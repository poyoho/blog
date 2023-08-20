# [magic-string](https://github.com/Rich-Harris/magic-string/tree/962192c0ae9c9cd293ae3d38c460f69b7a2456d7)

source map 制造的原理是把每个变更都记录在 map 上，然后再将这些 source map 组合起来，最后输出一份 source map 将 source 和 bundle 产物做对应。所以也就导致了如果 bundle 产物需要 source map，所有插件都需要保证 map 正确生成。`magic-string`在扩展 string 的操作，同时将对 string 的操作都记录下来，然后统一生成一次 map。

## source map

source map 文件包含有关编译后的代码如何映射到原始代码的基本信息，这是[source map 示例](../example/magic-string/app.js.map)。

```json
{
  "version": 3,
  "file": "app.js.map",
  "sources": [
    "app.source.js"
  ],
  "sourcesContent": [
    "var foo = 'yes';\nconsole.log( foo );"
  ],
  "names": [],
  "mappings": "AAAA,CAAC,CAAC,CAAC,CAAC,MAAG,CAAC,CAAC,CAAC,CAAC,"...
}

```

source map 最关键的方面是 mappings 字段。它使用 VLQ Base 64 编码字符串将 bundle 产物文件中的行和位置映射到相应的原始文件。可以使用 source map 可视化工具[source-map-visualization](https://sokra.github.io/source-map-visualization/#sass)、[Source Map Visualization](https://evanw.github.io/source-map-visualization/) 来可视化此映射。

[解开 mappings 字段](../example/magic-string/result)

```
"mappings": {
  "1": [
   ^
   └── 输出文件的行号
    "1 => aoo.source.js 1:1 foo"
      ^        ^        ^    ^
      │        │        │    └── 源文件中的符号名称
      │        │        │
      │        │        └── 源文件中的行：列位置
      │        │
      │        └── 源文件的名称
      │
      └── 输出文件的列号
  ]
}
```

所以在 magic-string 中需要保存的 mapping 信息就是这些。

## Mappings

在 magic-string 中，mappings 的生成是在`MagicString.prototype.generateMap`中完成的，`Mappings`是为了维护源码和产物代码保证行的对应关系。

```js
const wordRegex = /\w/

export default class Mappings {
  constructor(hires) {
    this.hires = hires
    // 代码行
    this.generatedCodeLine = 0
    // 代码列
    this.generatedCodeColumn = 0
    // mapping 生成结果
    this.raw = []
    // mapping 的原始片段
    this.rawSegments = this.raw[this.generatedCodeLine] = []
    this.pending = null
  }

  // 添加一行修改代码的 原始代码的原始片段
  addEdit(sourceIndex, content, loc, nameIndex) {
    if (content.length) {
      const segment = [
        this.generatedCodeColumn,
        sourceIndex,
        loc.line,
        loc.column
      ]
      if (nameIndex >= 0) {
        segment.push(nameIndex)
      }
      this.rawSegments.push(segment)
    } else if (this.pending) {
      this.rawSegments.push(this.pending)
    }

    this.advance(content)
    this.pending = null
  }

  // 添加没有编辑过的chunk
  addUneditedChunk(sourceIndex, chunk, original, loc, sourcemapLocations) {
    let originalCharIndex = chunk.start
    let first = true
    // when iterating each char, check if it's in a word boundary
    let charInHiresBoundary = false

    while (originalCharIndex < chunk.end) {
      if (this.hires || first || sourcemapLocations.has(originalCharIndex)) {
        const segment = [
          this.generatedCodeColumn,
          sourceIndex,
          loc.line,
          loc.column
        ]

        if (this.hires === 'boundary') {
          // in hires "boundary", group segments per word boundary than per char
          if (wordRegex.test(original[originalCharIndex])) {
            // for first char in the boundary found, start the boundary by pushing a segment
            if (!charInHiresBoundary) {
              this.rawSegments.push(segment)
              charInHiresBoundary = true
            }
          } else {
            // for non-word char, end the boundary by pushing a segment
            this.rawSegments.push(segment)
            charInHiresBoundary = false
          }
        } else {
          this.rawSegments.push(segment)
        }
      }

      // 将产物的代码行和列对应到原始代码的行和列
      if (original[originalCharIndex] === '\n') {
        loc.line += 1
        loc.column = 0
        this.generatedCodeLine += 1
        this.raw[this.generatedCodeLine] = this.rawSegments = []
        this.generatedCodeColumn = 0
        first = true
      } else {
        loc.column += 1
        this.generatedCodeColumn += 1
        first = false
      }

      originalCharIndex += 1
    }

    this.pending = null
  }

  // 生成 bundle产物代码每行对应原始代码的原始片段
  advance(str) {
    if (!str) return

    const lines = str.split('\n')

    if (lines.length > 1) {
      for (let i = 0; i < lines.length - 1; i++) {
        this.generatedCodeLine++
        this.raw[this.generatedCodeLine] = this.rawSegments = []
      }
      this.generatedCodeColumn = 0
    }

    this.generatedCodeColumn += lines[lines.length - 1].length
  }
}
```

## Chunk

在 magic-string 中，对所有的操作并不会马上生效，所以使用的时候，我们可以拿着 source string 和 magic-string 的实例，根据 source string 的位置，然后对 magic-string 进行操作，最后再调用`toString`方法，这样就可以得到最终的结果。

```js
const magicString = new MagicString(result.toString())
let source,
  magicString,
  pattern = /foo/g

while ((match = pattern.exec(source))) {
  magicString.overwrite(match.index, match.index + 3, 'answer')
}
```

sourcemap 也是基于 chunk 来生成的，所以在 magic-string 中，每一次操作都会生成一个 chunk ，用于保存这次变更记录，最后对照着 chunk 的改动来生成 sourcemap。

其中 chunk 的 `split` 方法就是用来生成 chunk 的，`split` 方法会根据传入的位置，将 chunk 分成两个 chunk，然后返回后一个 chunk。

内部使用时将编辑内容记录保存到接近更改块中，来保证生成的 sourcemap 对应修改的内容。

比如：

```text
'  test'.trim()
    split   -> '  ' + 'test'
  ✔️ edit    -> '' + 'test'
  ✖️ edit    -> 'test' + ''
```

```js
// 部分Chunk定义
export default class Chunk {
  constructor(start, end, content) {
    // chunk 对应source string的start位置
    this.start = start
    // chunk 对应source string的end位置
    this.end = end
    // chunk 原来的内容
    this.original = content

    // chunk 前后额外添加的内容 不需要对应sourcemap
    this.intro = ''
    this.outro = ''

    // chunk 可更改的content
    this.content = content
    // mappping的names 保存修改之前的字符串
    this.storeName = false
    this.edited = false

    // -- chunk是一个双向链表结构 --
    this.previous = undefined
    this.next = undefined
  }

  appendLeft(content) {
    // chunk 前额外添加的内容 不需要对应sourcemap
    this.outro += content
  }

  appendRight(content) {
    // chunk 后额外添加的内容 不需要对应sourcemap
    this.intro = this.intro + content
  }

  // 编辑chunk内容
  edit(content, storeName, contentOnly) {
    this.content = content
    // 只保留内容 去掉前后额外内容
    if (!contentOnly) {
      this.intro = ''
      this.outro = ''
    }
    // 存储mapping的names
    this.storeName = storeName

    // 标记chunk已经被编辑过
    this.edited = true

    return this
  }

  // 以index为界 分割chunk
  // sourcemap 也是基于 chunk 来生成的，所以在 magic-string 中，每一次操作都会生成一个 chunk ，用于保存这次变更记录，最后对照着 chunk 的改动来生成 sourcemap。
  split(index) {
    const sliceIndex = index - this.start

    const originalBefore = this.original.slice(0, sliceIndex)
    const originalAfter = this.original.slice(sliceIndex)

    this.original = originalBefore

    // -- chunk是一个双向链表结构 --
    // 创建新的chunk
    const newChunk = new Chunk(index, this.end, originalAfter)
    newChunk.outro = this.outro
    this.outro = ''

    this.end = index

    if (this.edited) {
      // 如果编辑过的chunk则清除内容
      // 并且用户应该将编辑内容记录保存到接近更改块中 来保证生成的sourcemap 对应修改的内容
      // 比如：
      // ‘  test’.trim()
      //     split   -> '  ' + 'test'
      //    ✔️edit    -> '' + 'test'
      //    ✖️edit    -> 'test' + ''
      // prev chunk <-> origin chunk('') <-(index)-> newChunk('') <-> next Chunk
      newChunk.edit('', false)
      this.content = ''
    } else {
      // 如果没有编辑过 则将原来的内容分割
      // prev chunk <-> origin chunk(originalBefore) <-(index)-> newChunk(originalAfter) <-> next Chunk
      this.content = originalBefore
    }

    // 连接chunk
    newChunk.next = this.next
    if (newChunk.next) newChunk.next.previous = newChunk
    newChunk.previous = this
    this.next = newChunk

    return newChunk
  }

  // 从chunk组合成字符串
  toString() {
    return this.intro + this.content + this.outro
  }

  trimEnd(rx) {
    this.outro = this.outro.replace(rx, '')
    if (this.outro.length) return true

    const trimmed = this.content.replace(rx, '')

    if (trimmed.length) {
      if (trimmed !== this.content) {
        this.split(this.start + trimmed.length).edit('', undefined, true)
        if (this.edited) {
          // 如果编辑过 则将新的chunk的内容设置为trimmed 保存更改记录
          this.edit(trimmed, this.storeName, true)
        }
      }
      return true
    } else {
      this.edit('', undefined, true)

      this.intro = this.intro.replace(rx, '')
      if (this.intro.length) return true
    }
  }

  trimStart(rx) {
    this.intro = this.intro.replace(rx, '')
    if (this.intro.length) return true

    const trimmed = this.content.replace(rx, '')

    if (trimmed.length) {
      if (trimmed !== this.content) {
        const newChunk = this.split(this.end - trimmed.length)
        if (this.edited) {
          // 如果编辑过 则将新的chunk的内容设置为trimmed 保存更改记录
          newChunk.edit(trimmed, this.storeName, true)
        }
        this.edit('', undefined, true)
      }
      return true
    } else {
      this.edit('', undefined, true)

      this.outro = this.outro.replace(rx, '')
      if (this.outro.length) return true
    }
  }
}
```

## MagicString

来到最后 MagicString 是对 String 进行抽象，提供了一系列的方法来操作字符串，最后生成一个新的字符串。它对 String 的操作抽象成了两步，先拆开 string，然后再将修改放到正确的位置上

- 增 不会影响 sourcemap 直接修改`outro intro`
  - `appendLeft` `appendRight` ，修改 string 级别的。
  - `prependLeft` `prependRight` ，修改 chunk 级别的。
- 删 会影响 sourcemap
  - `remove(start, end)`
  - 分割 start end，然后中间的所有 chunk 设置空
  - 在生成 sourcemap 时，就可以得到 start 左边的内容和 end 右边的内容对应的位置不变，中间全部变成了空，所以就相当于删除了。
- 改 会影响 sourcemap
  - `update(start, end, content, options)`
  - 分割 start end，然后中间的所有 chunk 设置空，最后把修改内容都放到了中间第一个 chunk 中
  - 在生成 sourcemap 时，就可以得到 start 左边的内容和 end 右边的内容对应的位置不变，中间全部变成了空，第一个 chunk 有内容，相当于中间的所有修改都对应了中间第一个 chunk。

这样的做法确保了每次操作都会有 chunk 记录，最后根据 chunk 记录生成 sourcemap。

```js
// 部分MagicString定义
export default class MagicString {
  constructor(string, options = {}) {
    const chunk = new Chunk(0, string.length, string)

    Object.defineProperties(this, {
      original: { writable: true, value: string },
      outro: { writable: true, value: '' },
      intro: { writable: true, value: '' },
      firstChunk: { writable: true, value: chunk },
      lastChunk: { writable: true, value: chunk },
      lastSearchedChunk: { writable: true, value: chunk },
      byStart: { writable: true, value: {} },
      byEnd: { writable: true, value: {} },
      filename: { writable: true, value: options.filename },
      indentExclusionRanges: {
        writable: true,
        value: options.indentExclusionRanges
      },
      sourcemapLocations: { writable: true, value: new BitSet() },
      storedNames: { writable: true, value: {} },
      indentStr: { writable: true, value: undefined },
      ignoreList: { writable: true, value: options.ignoreList }
    })

    if (DEBUG) {
      Object.defineProperty(this, 'stats', { value: new Stats() })
    }

    this.byStart[0] = chunk
    this.byEnd[string.length] = chunk
  }

  addSourcemapLocation(char) {
    this.sourcemapLocations.add(char)
  }

  append(content) {
    if (typeof content !== 'string')
      throw new TypeError('outro content must be a string')

    this.outro += content
    return this
  }

  appendLeft(index, content) {
    if (typeof content !== 'string')
      throw new TypeError('inserted content must be a string')

    if (DEBUG) this.stats.time('appendLeft')

    this._split(index)

    const chunk = this.byEnd[index]

    if (chunk) {
      chunk.appendLeft(content)
    } else {
      this.intro += content
    }

    if (DEBUG) this.stats.timeEnd('appendLeft')
    return this
  }

  appendRight(index, content) {
    if (typeof content !== 'string')
      throw new TypeError('inserted content must be a string')

    if (DEBUG) this.stats.time('appendRight')

    this._split(index)

    const chunk = this.byStart[index]

    if (chunk) {
      chunk.appendRight(content)
    } else {
      this.outro += content
    }

    if (DEBUG) this.stats.timeEnd('appendRight')
    return this
  }

  generateDecodedMap(options) {
    options = options || {}

    const sourceIndex = 0
    const names = Object.keys(this.storedNames)
    const mappings = new Mappings(options.hires)

    const locate = getLocator(this.original)

    if (this.intro) {
      mappings.advance(this.intro)
    }

    this.firstChunk.eachNext((chunk) => {
      const loc = locate(chunk.start)

      if (chunk.intro.length) mappings.advance(chunk.intro)

      if (chunk.edited) {
        mappings.addEdit(
          sourceIndex,
          chunk.content,
          loc,
          chunk.storeName ? names.indexOf(chunk.original) : -1
        )
      } else {
        mappings.addUneditedChunk(
          sourceIndex,
          chunk,
          this.original,
          loc,
          this.sourcemapLocations
        )
      }

      if (chunk.outro.length) mappings.advance(chunk.outro)
    })

    return {
      file: options.file ? options.file.split(/[/\\]/).pop() : undefined,
      sources: [
        options.source
          ? getRelativePath(options.file || '', options.source)
          : options.file || ''
      ],
      sourcesContent: options.includeContent ? [this.original] : undefined,
      names,
      mappings: mappings.raw,
      x_google_ignoreList: this.ignoreList ? [sourceIndex] : undefined
    }
  }

  generateMap(options) {
    return new SourceMap(this.generateDecodedMap(options))
  }

  overwrite(start, end, content, options) {
    options = options || {}
    return this.update(start, end, content, {
      ...options,
      overwrite: !options.contentOnly
    })
  }

  update(start, end, content, options) {
    if (typeof content !== 'string')
      throw new TypeError('replacement content must be a string')

    while (start < 0) start += this.original.length
    while (end < 0) end += this.original.length

    if (end > this.original.length) throw new Error('end is out of bounds')
    if (start === end)
      throw new Error(
        'Cannot overwrite a zero-length range – use appendLeft or prependRight instead'
      )

    if (DEBUG) this.stats.time('overwrite')

    this._split(start)
    this._split(end)

    if (options === true) {
      if (!warned.storeName) {
        console.warn(
          'The final argument to magicString.overwrite(...) should be an options object. See https://github.com/rich-harris/magic-string'
        ) // eslint-disable-line no-console
        warned.storeName = true
      }

      options = { storeName: true }
    }
    const storeName = options !== undefined ? options.storeName : false
    const overwrite = options !== undefined ? options.overwrite : false

    if (storeName) {
      const original = this.original.slice(start, end)
      Object.defineProperty(this.storedNames, original, {
        writable: true,
        value: true,
        enumerable: true
      })
    }

    const first = this.byStart[start]
    const last = this.byEnd[end]

    if (first) {
      let chunk = first
      while (chunk !== last) {
        if (chunk.next !== this.byStart[chunk.end]) {
          throw new Error('Cannot overwrite across a split point')
        }
        chunk = chunk.next
        chunk.edit('', false)
      }

      first.edit(content, storeName, !overwrite)
    } else {
      // must be inserting at the end
      const newChunk = new Chunk(start, end, '').edit(content, storeName)

      // TODO last chunk in the array may not be the last chunk, if it's moved...
      last.next = newChunk
      newChunk.previous = last
    }

    if (DEBUG) this.stats.timeEnd('overwrite')
    return this
  }

  remove(start, end) {
    while (start < 0) start += this.original.length
    while (end < 0) end += this.original.length

    if (start === end) return this

    if (start < 0 || end > this.original.length)
      throw new Error('Character is out of bounds')
    if (start > end) throw new Error('end must be greater than start')

    if (DEBUG) this.stats.time('remove')

    this._split(start)
    this._split(end)

    let chunk = this.byStart[start]

    while (chunk) {
      chunk.intro = ''
      chunk.outro = ''
      chunk.edit('')

      chunk = end > chunk.end ? this.byStart[chunk.end] : null
    }

    if (DEBUG) this.stats.timeEnd('remove')
    return this
  }

  _split(index) {
    if (this.byStart[index] || this.byEnd[index]) return

    if (DEBUG) this.stats.time('_split')

    let chunk = this.lastSearchedChunk
    const searchForward = index > chunk.end

    while (chunk) {
      if (chunk.contains(index)) return this._splitChunk(chunk, index)

      chunk = searchForward ? this.byStart[chunk.end] : this.byEnd[chunk.start]
    }
  }

  _splitChunk(chunk, index) {
    if (chunk.edited && chunk.content.length) {
      // zero-length edited chunks are a special case (overlapping replacements)
      const loc = getLocator(this.original)(index)
      throw new Error(
        `Cannot split a chunk that has already been edited (${loc.line}:${loc.column} – "${chunk.original}")`
      )
    }

    const newChunk = chunk.split(index)

    this.byEnd[index] = chunk
    this.byStart[index] = newChunk
    this.byEnd[newChunk.end] = newChunk

    if (chunk === this.lastChunk) this.lastChunk = newChunk

    this.lastSearchedChunk = chunk
    if (DEBUG) this.stats.timeEnd('_split')
    return true
  }

  toString() {
    let str = this.intro

    let chunk = this.firstChunk
    while (chunk) {
      str += chunk.toString()
      chunk = chunk.next
    }

    return str + this.outro
  }

  _replaceRegexp(searchValue, replacement) {
    function getReplacement(match, str) {
      if (typeof replacement === 'string') {
        return replacement.replace(/\$(\$|&|\d+)/g, (_, i) => {
          // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/replace#specifying_a_string_as_a_parameter
          if (i === '$') return '$'
          if (i === '&') return match[0]
          const num = +i
          if (num < match.length) return match[+i]
          return `$${i}`
        })
      } else {
        return replacement(...match, match.index, str, match.groups)
      }
    }
    function matchAll(re, str) {
      let match
      const matches = []
      while ((match = re.exec(str))) {
        matches.push(match)
      }
      return matches
    }
    if (searchValue.global) {
      const matches = matchAll(searchValue, this.original)
      matches.forEach((match) => {
        if (match.index != null)
          this.overwrite(
            match.index,
            match.index + match[0].length,
            getReplacement(match, this.original)
          )
      })
    } else {
      const match = this.original.match(searchValue)
      if (match && match.index != null)
        this.overwrite(
          match.index,
          match.index + match[0].length,
          getReplacement(match, this.original)
        )
    }
    return this
  }

  _replaceString(string, replacement) {
    const { original } = this
    const index = original.indexOf(string)

    if (index !== -1) {
      this.overwrite(index, index + string.length, replacement)
    }

    return this
  }

  replace(searchValue, replacement) {
    if (typeof searchValue === 'string') {
      return this._replaceString(searchValue, replacement)
    }

    return this._replaceRegexp(searchValue, replacement)
  }

  _replaceAllString(string, replacement) {
    const { original } = this
    const stringLength = string.length
    for (
      let index = original.indexOf(string);
      index !== -1;
      index = original.indexOf(string, index + stringLength)
    ) {
      this.overwrite(index, index + stringLength, replacement)
    }

    return this
  }

  replaceAll(searchValue, replacement) {
    if (typeof searchValue === 'string') {
      return this._replaceAllString(searchValue, replacement)
    }

    if (!searchValue.global) {
      throw new TypeError(
        'MagicString.prototype.replaceAll called with a non-global RegExp argument'
      )
    }

    return this._replaceRegexp(searchValue, replacement)
  }
}
```
