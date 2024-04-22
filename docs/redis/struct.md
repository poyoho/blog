# redis

## sds

redis 内部所有的字符串都使用自己实现的 sds(simple dynamic string)来存储。

```c
struct __attribute__ ((__packed__)) sdshdr8 {
    uint8_t len; /* used */
    uint8_t alloc; /* excluding the header and null terminator */
    unsigned char flags; /* 3 lsb of type, 5 unused bits */
    char buf[];
};
```

- len: 记录字符串的长度，避免使用`\0`作为字符串结束符，让字符串可以存任何的二进制数据。
- alloc: 记录申请的内存长度，因为申请内存的操作效率很低，每次都多申请一些。
  - 内存管理机制：Linux 使用的是虚拟内存管理机制，需要进行页表的管理和地址映射，这会引入一定的开销。
  - 内存分配算法：Linux 使用的内存分配算法可能会导致碎片化，影响内存的利用率和分配效率。
  - 内核态和用户态切换：在申请内存时，需要进行内核态和用户态之间的切换，这会增加一定的开销。
- flag: 前面 3 位保存字符串类型

```c
#define SDS_TYPE_5  0
#define SDS_TYPE_8  1
#define SDS_TYPE_16 2
#define SDS_TYPE_32 3
#define SDS_TYPE_64 4
```

- buf: 内容

sds 有 4 个定义，分别是 8 位、16 位、32 位、64 位，根据字符串的长度来选择合适的 sds。

```c
struct __attribute__ ((__packed__)) sdshdr5 {
    unsigned char flags; /* 3 lsb of type, and 5 msb of string length */
    char buf[];
};
struct __attribute__ ((__packed__)) sdshdr8 {
    uint8_t len; /* used */
    uint8_t alloc; /* excluding the header and null terminator */
    unsigned char flags; /* 3 lsb of type, 5 unused bits */
    char buf[];
};
struct __attribute__ ((__packed__)) sdshdr16 {
    uint16_t len; /* used */
    uint16_t alloc; /* excluding the header and null terminator */
    unsigned char flags; /* 3 lsb of type, 5 unused bits */
    char buf[];
};
struct __attribute__ ((__packed__)) sdshdr32 {
    uint32_t len; /* used */
    uint32_t alloc; /* excluding the header and null terminator */
    unsigned char flags; /* 3 lsb of type, 5 unused bits */
    char buf[];
};
struct __attribute__ ((__packed__)) sdshdr64 {
    uint64_t len; /* used */
    uint64_t alloc; /* excluding the header and null terminator */
    unsigned char flags; /* 3 lsb of type, 5 unused bits */
    char buf[];
};
```

### 扩容

sds 扩展空间的方式是根据需要选择合适的扩展策略，通常是按照一定的倍数扩展，例如翻倍扩展。因为不是所有字符串都会被频繁修改，比如 key 值就不需要频繁更改，所以这里也保留不使用扩展策略的方法。

- 扩展逻辑

```c
if (greedy == 1) {
     if (newlen < SDS_MAX_PREALLOC)
         newlen *= 2;
     else
         newlen += SDS_MAX_PREALLOC;
 }
```

```c
sds _sdsMakeRoomFor(sds s, size_t addlen, int greedy) {
    void *sh, *newsh;
    size_t avail = sdsavail(s);
    size_t len, newlen, reqlen;
    char type, oldtype = s[-1] & SDS_TYPE_MASK;
    int hdrlen;
    size_t usable;

    /* Return ASAP if there is enough space left. */
    if (avail >= addlen) return s;

    len = sdslen(s);
    sh = (char*)s-sdsHdrSize(oldtype);
    reqlen = newlen = (len+addlen);
    assert(newlen > len);   /* Catch size_t overflow */
    if (greedy == 1) {
        if (newlen < SDS_MAX_PREALLOC)
            newlen *= 2;
        else
            newlen += SDS_MAX_PREALLOC;
    }

    type = sdsReqType(newlen);

    /* Don't use type 5: the user is appending to the string and type 5 is
     * not able to remember empty space, so sdsMakeRoomFor() must be called
     * at every appending operation. */
    if (type == SDS_TYPE_5) type = SDS_TYPE_8;

    hdrlen = sdsHdrSize(type);
    assert(hdrlen + newlen + 1 > reqlen);  /* Catch size_t overflow */
    if (oldtype==type) {
        newsh = s_realloc_usable(sh, hdrlen+newlen+1, &usable);
        if (newsh == NULL) return NULL;
        s = (char*)newsh+hdrlen;
    } else {
        /* Since the header size changes, need to move the string forward,
         * and can't use realloc */
        newsh = s_malloc_usable(hdrlen+newlen+1, &usable);
        if (newsh == NULL) return NULL;
        memcpy((char*)newsh+hdrlen, s, len+1);
        s_free(sh);
        s = (char*)newsh+hdrlen;
        s[-1] = type;
        sdssetlen(s, len);
    }
    usable = usable-hdrlen-1;
    if (usable > sdsTypeMaxSize(type))
        usable = sdsTypeMaxSize(type);
    sdssetalloc(s, usable);
    return s;
}
```

## intset

intset 是 redis 内部用来存储整数集合的数据结构，它是一个有序的集合，不允许重复元素。因为底层是二分法查找，比较适合数据量小的场景使用，当数据量大的时候，效率就有所下降了。

```c
typedef struct intset {
    uint32_t encoding;
    uint32_t length;
    int8_t contents[];
} intset;
```

- encoding: 记录 intset 的编码方式，有 3 种

```c
// 16位
#define INTSET_ENC_INT16 (sizeof(int16_t))
// 32位
#define INTSET_ENC_INT32 (sizeof(int32_t))
// 64位
#define INTSET_ENC_INT64 (sizeof(int64_t))
```

- length: 数组的长度
- contents: 内容

### 扩容

intset 的实现是一个数组，数组的每个元素的大小是固定的，根据 encoding 来决定。如果新添加的元素超过了 encoding 的范围，intset 会自动扩容。利用类型升级机制，时间换空间，节省内存空间。

```c
/* Upgrades the intset to a larger encoding and inserts the given integer. */
static intset *intsetUpgradeAndAdd(intset *is, int64_t value) {
    uint8_t curenc = intrev32ifbe(is->encoding);
    uint8_t newenc = _intsetValueEncoding(value);
    int length = intrev32ifbe(is->length);
    // 要让inset重新分配内存的数据，不是比原来的大就是比原来的小
    int prepend = value < 0 ? 1 : 0;

    /* First set new encoding and resize */
    is->encoding = intrev32ifbe(newenc);
    is = intsetResize(is,intrev32ifbe(is->length)+1);

    /* Upgrade back-to-front so we don't overwrite values.
     * Note that the "prepend" variable is used to make sure we have an empty
     * space at either the beginning or the end of the intset. */
    while(length--)
        _intsetSet(is,length+prepend,_intsetGetEncoded(is,length,curenc));

    /* Set the value at the beginning or the end. */
    if (prepend)
        _intsetSet(is,0,value);
    else
        _intsetSet(is,intrev32ifbe(is->length),value);
    is->length = intrev32ifbe(intrev32ifbe(is->length)+1);
    return is;
}
```

## dict

dict 是 redis 内部用来存储键值对的数据结构，底层是一个哈希表。dict 包含三部分，hash 表、hash 节点（dictEntry）、字典（dict）。

```c
typedef struct dictType {
    uint64_t (*hashFunction)(const void *key);
    void *(*keyDup)(dict *d, const void *key);
    void *(*valDup)(dict *d, const void *obj);
    int (*keyCompare)(dict *d, const void *key1, const void *key2);
    void (*keyDestructor)(dict *d, void *key);
    void (*valDestructor)(dict *d, void *obj);
    int (*expandAllowed)(size_t moreMem, double usedRatio);
    /* Flags */
    /* The 'no_value' flag, if set, indicates that values are not used, i.e. the
     * dict is a set. When this flag is set, it's not possible to access the
     * value of a dictEntry and it's also impossible to use dictSetKey(). Entry
     * metadata can also not be used. */
    unsigned int no_value:1;
    /* If no_value = 1 and all keys are odd (LSB=1), setting keys_are_odd = 1
     * enables one more optimization: to store a key without an allocated
     * dictEntry. */
    unsigned int keys_are_odd:1;
    /* TODO: Add a 'keys_are_even' flag and use a similar optimization if that
     * flag is set. */

    /* Allow each dict and dictEntry to carry extra caller-defined metadata. The
     * extra memory is initialized to 0 when allocated. */
    size_t (*dictEntryMetadataBytes)(dict *d);
    size_t (*dictMetadataBytes)(void);
    /* Optional callback called after an entry has been reallocated (due to
     * active defrag). Only called if the entry has metadata. */
    void (*afterReplaceEntry)(dict *d, dictEntry *entry);
} dictType;

struct dictEntry {
    void *key;
    union {
        void *val;
        uint64_t u64;
        int64_t s64;
        double d;
    } v;
    struct dictEntry *next;     /* Next entry in the same hash bucket. */
    void *metadata[];           /* An arbitrary number of bytes (starting at a
                                 * pointer-aligned address) of size as returned
                                 * by dictType's dictEntryMetadataBytes(). */
};

struct dict {
    dictType *type;

    dictEntry **ht_table[2];
    unsigned long ht_used[2];

    long rehashidx; /* rehashing not in progress if rehashidx == -1 */

    /* Keep small vars at end for optimal (minimal) struct padding */
    int16_t pauserehash; /* If >0 rehashing is paused (<0 indicates coding error) */
    signed char ht_size_exp[2]; /* exponent of size. (size = 1<<exp) */

    void *metadata[];           /* An arbitrary number of bytes (starting at a
                                 * pointer-aligned address) of size as defined
                                 * by dictType's dictEntryBytes. */
};
```

**dict**

- dictType: 存储了各种与 hash table 相关的函数。
- ht_table: hash 表。 Redis 哈希表在处理哈希冲突时使用的是链表，这种方法在数据量较大的情况下可能会导致链表过长，影响查找效率。为了解决这个问题，Redis 7.2 引入了两个哈希表的设计，即主哈希表和辅助哈希表。
  - 主哈希表：主要用于存储数据，大小通常较小。当主哈希表中的某个桶（bucket）中的链表长度达到一定阈值时，会触发扩容操作，并将该桶中的数据重新哈希到辅助哈希表中。
  - 辅助哈希表：用于存储主哈希表中被重新哈希的数据，大小通常较大。辅助哈希表的桶的数量是主哈希表的数倍，这样可以降低哈希冲突的概率，提高查找效率。
- ht_used: hash 表中已经使用的桶的数量（hash 表中，已经使用的内存块数量）。
- ht_size_exp: hash table 的掩码，一定是 （2 ^ n - 1）保证二进制的数据是都是 1
  - 用于计算桶的位置 `idx = hash(key) & DICTHT_SIZE_MASK(d->ht_size_exp[table])`，这样可以保证 idx 的范围是 0~N-1。
- rehashidx: 标记当前的 hashtable 是否处于 rehash 状态，
  - 如果 rehashidx ==-1，则当前没有处于 rehash 状态
  - 如果 rehashidx >=0，表示已经 rehash 多少个桶
- pauserehash: 该值大于 0 表示 rehash 终止，小于 0 表示编码错误
- metadata: 用于存储额外信息的字段，可以存储一些元数据

**dictEntry**

- key: 指向 key
- v: value，可以存储不同类型的数据
  - union 是指内存的同一个位置可以存储不同的数据类型，是为了兼容不同类型的 value。
  - 当 value 是 uint64_t、int64_t、double 的数据类型的时候可以直接内嵌在 dictentry 中，无需为此分配额外的内存，这样可以节省内存，如果不是的话就要额外申请内存，这里只存放指针。
- metadata: 存储额外的信息
- next: 采用拉链法解决哈希冲突，哈希表的每个桶中维护一个链表，将哈希冲突的元素存储在同一个桶对应的链表中

  - 初始化哈希表：创建一个大小为 N 的哈希表，每个槽初始化为空链表。
  - 插入元素：对于要插入的元素 key，先计算其哈希值 hash(key)，然后将 key 插入到哈希表的第 hash(key) mod N 个桶对应的链表中。

    ```c
    /* Finds and returns the position within the dict where the provided key should
    * be inserted using dictInsertAtPosition if the key does not already exist in
    * the dict. If the key exists in the dict, NULL is returned and the optional
    * 'existing' entry pointer is populated, if provided. */
    void *dictFindPositionForInsert(dict *d, const void *key, dictEntry **existing) {
        unsigned long idx, table;
        dictEntry *he;
        // 使用d.type的hashFunction函数计算key的哈希值
        uint64_t hash = dictHashKey(d, key);
        if (existing) *existing = NULL;
        if (dictIsRehashing(d)) _dictRehashStep(d);

        /* Expand the hash table if needed */
        if (_dictExpandIfNeeded(d) == DICT_ERR)
            return NULL;
        for (table = 0; table <= 1; table++) {
            // idx = hash & (N-1)
            // 只取数组的低位，这样可以保证idx的范围是0~N-1
            idx = hash & DICTHT_SIZE_MASK(d->ht_size_exp[table]);
            /* Search if this slot does not already contain the given key */
            he = d->ht_table[table][idx];
            while(he) {
                void *he_key = dictGetKey(he);
                if (key == he_key || dictCompareKeys(d, key, he_key)) {
                    if (existing) *existing = he;
                    return NULL;
                }
                he = dictGetNext(he);
            }
            if (!dictIsRehashing(d)) break;
        }

        /* If we are in the process of rehashing the hash table, the bucket is
        * always returned in the context of the second (new) hash table. */
        dictEntry **bucket = &d->ht_table[dictIsRehashing(d) ? 1 : 0][idx];
        return bucket;
    }
    ```

  - 查找元素：对于要查找的元素 key，计算其哈希值 hash(key)，然后在第 hash(key) & (N-1) 个槽对应的链表中查找 key。
  - 删除元素：删除元素的操作也类似，先找到元素所在的链表，然后删除对应的节点。

### 扩容

当哈希表中的某个桶中的链表长度达到一定阈值时，相当于退化到了链表查询了，这个时候会触发扩容操作，并将该桶中的数据重新哈希到辅助哈希表中。

`dict_can_resize`有 3 个状态

- DICT_RESIZE_ENABLE: 允许扩容
- DICT_RESIZE_AVOID: 避免扩容，服务器在执行 BGSAVE / BGREWRITEAOF 时，会将 dict_can_resize 设置为 DICT_RESIZE_AVOID，避免扩容。
- DICT_RESIZE_FORBID: 禁止扩容

1. dict_can_resize == DICT_RESIZE_ENABLE, `d->ht_used[0] / DICTHT_SIZE(d->ht_size_exp[0])` 触发扩容
2. dict_can_resize != DICT_RESIZE_FORBID, `d->ht_used[0] / DICTHT_SIZE(d->ht_size_exp[0]) > dict_force_resize_ratio` 触发扩容

```c
typedef enum {
    DICT_RESIZE_ENABLE,
    DICT_RESIZE_AVOID,
    DICT_RESIZE_FORBID,
} dictResizeEnable;

/* Expand the hash table if needed */
static int _dictExpandIfNeeded(dict *d)
{
    /* Incremental rehashing already in progress. Return. */
    if (dictIsRehashing(d)) return DICT_OK;

    /* If the hash table is empty expand it to the initial size. */
    if (DICTHT_SIZE(d->ht_size_exp[0]) == 0) return dictExpand(d, DICT_HT_INITIAL_SIZE);

    /* If we reached the 1:1 ratio, and we are allowed to resize the hash
     * table (global setting) or we should avoid it but the ratio between
     * elements/buckets is over the "safe" threshold, we resize doubling
     * the number of buckets. */
    if ((dict_can_resize == DICT_RESIZE_ENABLE &&
         d->ht_used[0] >= DICTHT_SIZE(d->ht_size_exp[0])) ||
        (dict_can_resize != DICT_RESIZE_FORBID &&
         d->ht_used[0] / DICTHT_SIZE(d->ht_size_exp[0]) > dict_force_resize_ratio))
    {
        if (!dictTypeExpandAllowed(d))
            return DICT_OK;
        // 这里后面会变成 d->ht_used[0] << 1
        return dictExpand(d, d->ht_used[0] + 1);
    }
    return DICT_OK;
}
```

### 缩容

当`(d->ht_used[0] + d->ht_used[1]) / (d->ht_size_exp[0] + d->ht_size_exp[1]) < 0.1` 触发缩容。

```c
#define dictSlots(d) (DICTHT_SIZE((d)->ht_size_exp[0])+DICTHT_SIZE((d)->ht_size_exp[1]))
#define dictSize(d) ((d)->ht_used[0]+(d)->ht_used[1])

int htNeedsResize(dict *dict) {
    long long size, used;

    size = dictSlots(dict);
    used = dictSize(dict);
    return (size > DICT_HT_INITIAL_SIZE &&
            (used*100/size < HASHTABLE_MIN_FILL));
}
```

### rehash

1. 通过`size`计算新 hash 表的大小 \_dictNextExp

- 如果扩容，size = 第一个大于等于 dict.ht[0].used + 1 的 2 ^ n
- 如果缩容，size = 第一个大于等于 dict.ht[0].used 的 2 ^ n， 最小值为 4

2. 创建新的 hash table
3. 标记现在的`dict.ht[0]`正在 rehash。

- 如果`ht[0]`很大，一次性直接 rehash 完，可能会阻塞进程，所以 redis 内部会将这个过程分多次，渐进式完成。
- 每次增删改查操作都会执行一次 rehash，每次 rehash 原来的`ht[0]`的一个桶，并且`rehashidx++`。

```c
/* Expand or create the hash table,
 * when malloc_failed is non-NULL, it'll avoid panic if malloc fails (in which case it'll be set to 1).
 * Returns DICT_OK if expand was performed, and DICT_ERR if skipped. */
int _dictExpand(dict *d, unsigned long size, int* malloc_failed)
{
    if (malloc_failed) *malloc_failed = 0;

    /* the size is invalid if it is smaller than the number of
     * elements already inside the hash table */
    if (dictIsRehashing(d) || d->ht_used[0] > size)
        return DICT_ERR;

    /* the new hash table */
    dictEntry **new_ht_table;
    unsigned long new_ht_used;
    signed char new_ht_size_exp = _dictNextExp(size);

    /* Detect overflows */
    size_t newsize = 1ul<<new_ht_size_exp;
    if (newsize < size || newsize * sizeof(dictEntry*) < newsize)
        return DICT_ERR;

    /* Rehashing to the same table size is not useful. */
    if (new_ht_size_exp == d->ht_size_exp[0]) return DICT_ERR;

    /* Allocate the new hash table and initialize all pointers to NULL */
    if (malloc_failed) {
        new_ht_table = ztrycalloc(newsize*sizeof(dictEntry*));
        *malloc_failed = new_ht_table == NULL;
        if (*malloc_failed)
            return DICT_ERR;
    } else
        new_ht_table = zcalloc(newsize*sizeof(dictEntry*));

    new_ht_used = 0;

    /* Is this the first initialization? If so it's not really a rehashing
     * we just set the first hash table so that it can accept keys. */
    if (d->ht_table[0] == NULL) {
        d->ht_size_exp[0] = new_ht_size_exp;
        d->ht_used[0] = new_ht_used;
        d->ht_table[0] = new_ht_table;
        return DICT_OK;
    }

    /* Prepare a second hash table for incremental rehashing */
    d->ht_size_exp[1] = new_ht_size_exp;
    d->ht_used[1] = new_ht_used;
    d->ht_table[1] = new_ht_table;
    d->rehashidx = 0;
    return DICT_OK;
}
```

rehash 是需要把`ht[0]`的桶重新算一遍 hash 映射到`ht[1]`中。

1. 对每个 dict entry 重新计算 hash

- 扩容，用新的 hash mask 重新执行一遍 hash 计算
- 缩容，因为 key 再算 hash 都是一样的，只需要去掉高位的数据即可。

2. 设置 value
3. 将 ht[1]赋值给 ht[0]，释放 ht[0]的内存。

```c
/* Performs N steps of incremental rehashing. Returns 1 if there are still
 * keys to move from the old to the new hash table, otherwise 0 is returned.
 *
 * Note that a rehashing step consists in moving a bucket (that may have more
 * than one key as we use chaining) from the old to the new hash table, however
 * since part of the hash table may be composed of empty spaces, it is not
 * guaranteed that this function will rehash even a single bucket, since it
 * will visit at max N*10 empty buckets in total, otherwise the amount of
 * work it does would be unbound and the function may block for a long time. */
int dictRehash(dict *d, int n) {
    int empty_visits = n*10; /* Max number of empty buckets to visit. */
    unsigned long s0 = DICTHT_SIZE(d->ht_size_exp[0]);
    unsigned long s1 = DICTHT_SIZE(d->ht_size_exp[1]);
    if (dict_can_resize == DICT_RESIZE_FORBID || !dictIsRehashing(d)) return 0;
    if (dict_can_resize == DICT_RESIZE_AVOID &&
        ((s1 > s0 && s1 / s0 < dict_force_resize_ratio) ||
         (s1 < s0 && s0 / s1 < dict_force_resize_ratio)))
    {
        return 0;
    }

    while(n-- && d->ht_used[0] != 0) {
        dictEntry *de, *nextde;

        /* Note that rehashidx can't overflow as we are sure there are more
         * elements because ht[0].used != 0 */
        assert(DICTHT_SIZE(d->ht_size_exp[0]) > (unsigned long)d->rehashidx);
        while(d->ht_table[0][d->rehashidx] == NULL) {
            d->rehashidx++;
            if (--empty_visits == 0) return 1;
        }
        de = d->ht_table[0][d->rehashidx];
        /* Move all the keys in this bucket from the old to the new hash HT */
        while(de) {
            uint64_t h;

            nextde = dictGetNext(de);
            void *key = dictGetKey(de);
            /* Get the index in the new hash table */
            if (d->ht_size_exp[1] > d->ht_size_exp[0]) {
                h = dictHashKey(d, key) & DICTHT_SIZE_MASK(d->ht_size_exp[1]);
            } else {
                /* We're shrinking the table. The tables sizes are powers of
                 * two, so we simply mask the bucket index in the larger table
                 * to get the bucket index in the smaller table. */
                h = d->rehashidx & DICTHT_SIZE_MASK(d->ht_size_exp[1]);
            }
            if (d->type->no_value) {
                if (d->type->keys_are_odd && !d->ht_table[1][h]) {
                    /* Destination bucket is empty and we can store the key
                     * directly without an allocated entry. Free the old entry
                     * if it's an allocated entry.
                     *
                     * TODO: Add a flag 'keys_are_even' and if set, we can use
                     * this optimization for these dicts too. We can set the LSB
                     * bit when stored as a dict entry and clear it again when
                     * we need the key back. */
                    assert(entryIsKey(key));
                    if (!entryIsKey(de)) zfree(decodeMaskedPtr(de));
                    de = key;
                } else if (entryIsKey(de)) {
                    /* We don't have an allocated entry but we need one. */
                    de = createEntryNoValue(key, d->ht_table[1][h]);
                } else {
                    /* Just move the existing entry to the destination table and
                     * update the 'next' field. */
                    assert(entryIsNoValue(de));
                    dictSetNext(de, d->ht_table[1][h]);
                }
            } else {
                dictSetNext(de, d->ht_table[1][h]);
            }
            d->ht_table[1][h] = de;
            d->ht_used[0]--;
            d->ht_used[1]++;
            de = nextde;
        }
        d->ht_table[0][d->rehashidx] = NULL;
        d->rehashidx++;
    }

    /* Check if we already rehashed the whole table... */
    if (d->ht_used[0] == 0) {
        zfree(d->ht_table[0]);
        /* Copy the new ht onto the old one */
        d->ht_table[0] = d->ht_table[1];
        d->ht_used[0] = d->ht_used[1];
        d->ht_size_exp[0] = d->ht_size_exp[1];
        _dictReset(d, 1);
        d->rehashidx = -1;
        return 0;
    }

    /* More to rehash... */
    return 1;
}
```

## ZipList