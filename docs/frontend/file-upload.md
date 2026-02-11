# 大文件上传

# 大文件上传

* [上传服务](https://github.com/poyoho/shared/tree/master/packages/service/upload)
* [vue用例](https://github.com/poyoho/shared/blob/master/playground/vue/src/views/uploadLargeFile.vue)
* [上传服务端](https://github.com/poyoho/shared/blob/master/playground/serve/src/serve.ts)

## 内容hash计算

通过文件内容`hash`，确定文件上传状态【未上传、上传中、已经上传】。

> * `文件hash`计算需要特比资源进行运算，`web worker`（使计算不阻塞主线程UI） / `WebAssembly`（使用rust计算md5`速度提高30%`） 充分利用计算资源。
> * 对文件hash进行`抽样计算`，损失hash的准确率（当两个文件抽样的部分完全相同，则误判两个文件相同）提高速率（减少hash计算量，速度提高`100% - 取决于抽样率`）。

### 抽样hash

首尾不切片，其他抽样切片，使用`generator`处理中间抽样过程。

|常量|简介|默认值|
|----|----|----|
|FILE_OFFSET|hash计算分片|50M|
|CHUNK_OFFSET|抽样跨度|5M|
|CALC_CHUNK|计算chunk大小|1M|

一个2G的文件计算量就是

= ( 头尾 ) + ( 2G 6M采样1M )

= ( 50 + 50 ) + ( (2 * 1024 - 100) / 6 ) * 1 = `425M`

计算量减少了80%，相应的速率也提高了`80%`。
而且当文件带上更多业务属性，大文件重复的几率是特别小的，文件hash的计算效率提高一个级别。

```ts
async function *bloomFilter(file: File): AsyncGenerator<{
  buff: Uint8Array,
  endPtr: number
}> {
  let count = 0
  const chunkCount = Math.ceil(file.size / FILE_OFFSET)
  for (let cur = 0; cur < file.size; cur += FILE_OFFSET) {
    const endPtr = cur + FILE_OFFSET
    const fileChunk = file.slice(cur, endPtr)
    if(![0, chunkCount - 1].includes(count)) {
      const chunks = []
      for (let samplingCur = cur; samplingCur < endPtr; samplingCur += CHUNK_OFFSET) {
        chunks.push(fileChunk.slice(samplingCur - cur, CALC_CHUNK))
      }
      yield { buff: new Uint8Array(await new Blob(chunks).arrayBuffer()), endPtr }
    } else {
      yield { buff: new Uint8Array(await fileChunk.arrayBuffer()), endPtr }
    }
    count++
  }
}
```

### worker

CPU密集型的算法会阻塞UI，使用`web worker`计算hash。

算法计算内容切片，每完成一部分都通知刷新进度条。

```js
this.onmessage = async (e) => {
  const { file } = e.data
  const spark = new this.SparkMD5.ArrayBuffer();
  const fileChunksIteror = bloomFilter(file)
  while (true) {
    const fileChunk = await fileChunksIteror.next()
    if (fileChunk.done) { break }
    const { buff, endPtr } = fileChunk.value
    spark.append(buff)
    this.postMessage({
      action: "percent",
      percent: endPtr > file.size ? 99 : endPtr * 100 / file.size,
    })
  }
  this.postMessage({
    action: "percent",
    percent: 100,
    hash: spark.end()
  })
}
```

创建worker

```ts
function callWorker (
  importScripts: string[],
  formatScript: (str: string) => string = (str) => str
) {
  const workerScript = _worker.toString()

  const workerData = new Blob(
    [
      ...importScripts,
      formatScript(`(function ${workerScript})()`)
    ],
    { type: "text/javascript" }
  )

  return new Worker(URL.createObjectURL(workerData))
}
```

>  在调用worker的时候，将本地函数字符串化，以`Blob流`给Worker调用，不用将Worker独立出一个静态文件。

### wasm

hash计算可以直接使用js的库`spark-md5`或者`rust md5`生成hash值。

经过多次测试，使用rust计算速率提高`30%`。

```rust
#[wasm_bindgen]
impl HashHelper {
  pub fn new() -> HashHelper{
    HashHelper {
      ctx: md5::Context::new(),
    }
  }

  pub fn append (&mut self, data: &[u8]) {
    self.ctx.consume(data);
  }

  pub fn end(self) -> JsString {
    let digest = self.ctx.compute();
    let hex: JsString = JsString::from(format!("{:x}", digest).as_str());
    JsString::from(hex)
  }
}
```

### wasm + worker

wasm运行的时候还是使用js的主进程，还是会阻塞UI。所以继续引入`worker`来解决问题。

1. 生成的js胶水代码需要在运行时指定wasm文件URL
```sh
wasm-pack build --target no-modules
```

2. 引入wasm并使用wasm作为hash计算器。
```ts {6,8,12,13}
const sparkSite = new URL("../third/wasm/hash/hash.js", import.meta.url)
const wasmSite = new URL('../third/wasm/hash/hash_bg.wasm', import.meta.url)
const worker = callWorker(
  [
    // 引入wasm
    `self.importScripts("${sparkSite}");\n`,
    // 初始化wasm
    `wasm_bindgen("${wasmSite}").then(() => this.postMessage({ action: "init" }));\n`,
  ],
  // 替换使用hash计算器
  (script) => script.replace(
    "new this.SparkMD5.ArrayBuffer()",
    "wasm_bindgen.HashHelper.new()"
  )
)
```

3. 由于初始化wasm是异步的，所以等待加载完wasm再执行hash计算。

```ts {4}
worker.onmessage = (e) => {
  switch(e.data.action) {
    case "init":
      worker.postMessage({ file })
      break
  }
}
```

## 切片上传

上传大文件主要做的工作是`文件切片`，充分利用网络资源。
> * 在处理`文件切片大小`问题应该根据当前网络环境进行动态分配`SIZE`。
> 比如A用户网速为`1000MB`如果`SIZE=10MB`该用户每个请求都是马上完成的，则多次建立连接的资源衰耗也特别大，通过参照`tcp慢启动策略`对`SIZE`进行动态更新文件切片大小。
> * 大文件由于切片过多，过多的HTTP链接与会使浏览器卡顿，`控制异步请求的并发数`并允许上传`错误重试`限制上传资源使用。


### 动态切片

1. 文件分片首先要过滤掉上次上传的文件分片，只上传未上传的分片。

对已经上传的分片打上`pass`标记

对未上传的分片打上`ready`标记

```ts
function filterUploadedFileChunks(
  file: File,
  uploadedFileList: FileChunkDesc[]
): FileChunk[] {
  if (uploadedFileList.length === 0) {
    const fileChunks: FileChunk[] = [{
      startIdx: 0,
      endIdx: file.size,
      status: "ready",
      chunk: file,
      filename: file.name,
    }]
    return fileChunks
  }
  const fileChunks: FileChunk[] = []
  const push = (startIdx: number, endIdx: number, status: UploadStatus) => {
    fileChunks.push({
      startIdx, endIdx, status,
      chunk: file.slice(startIdx, endIdx),
      filename: file.name,
    })
  }
  const endIdx = uploadedFileList
    .sort((a, b) => a.startIdx - b.startIdx)
    .reduce((prev, next) => {
      if (next.startIdx > prev) {
        push(prev, next.startIdx, "ready")
      }
      push(next.startIdx, next.endIdx, "pass")
      return next.endIdx
    }, 0)
  if (file.size > endIdx) {
    push(endIdx, file.size, "ready")
  }
  return fileChunks
  }
```

2. 对未上传的文件分片再进行处理
* 文件分片存在`pass`标记则跳过上传，对大切片进行二次切片
* 切片需要根据当前网速进行，使用`generator`进行切片，每次调用`next`都传入切片大小，根据传入的切片大小动态更改下次切片大小。

```ts {3,8,22,26}
function *dynamicSize(
  file: File,
  fileChunks: FileChunk[],
  fileOffset: number
): Iterator<FileChunk, void, number> {
  for(let idx = 0; idx < fileChunks.length; idx++) {
    const fileChunk = fileChunks[idx]
    if (fileChunk.status === "pass") continue
    const size = fileChunk.endIdx - fileChunk.startIdx
    if (size > fileOffset) {
      // slice
      for(let cur = fileChunk.startIdx; cur < fileChunk.endIdx;) {
        const curEnd = cur + fileOffset > fileChunk.endIdx ? fileChunk.endIdx : cur + fileOffset
        const newOffset = yield {
          startIdx: cur,
          endIdx: curEnd,
          status: "ready",
          chunk: file.slice(cur, curEnd),
          filename: file.name,
        }
        cur = curEnd
        fileOffset = newOffset
      }
    } else {
      const newOffset = yield fileChunk
      fileOffset = newOffset
    }
  }
}
```

3. 根据网速计算切片大小

根据上传速度动态计算切片大小，类似`tcp慢启动`优化策略，当拥塞发生时，窗口的减小是成倍（1/2）减小，在网络恢复时，窗口的增大是缓慢增大的，所以叫做慢启动。检测当前环境的资源动态动态扩大或缩小文件切片大小，加快上传速度。

```ts
function resize(offset: number, start: number) {
  const time = Number(((new Date().getTime() - start) / 1000).toFixed(4))
  let rate = time / 5
  if(rate < 0.5) rate = 0.5
  else if(rate > 2) rate = 2
  offset = Math.ceil(offset / rate)
  return offset
}
```

### 网络请求【并发、错误重试】请求控制

多文件上传的网络请求，需要额外控制。

* 请求错误的时候，需要重新发起当前切片的上传请求。
* 每次请求都要计算上传时间，并根据时间重新确定切片大小。

```ts
async function requestResizeChunk (
  chunk: FileChunk,
  offset: number,
  uploadAPI: UploadAPI,
) {
  let resp: any
  let errorTimes = 3
  let start: number
  while (errorTimes) {
    start = Date.now()
    try {
      resp = await uploadAPI(chunk)
      chunk.status = "uploaded"
      break
    } catch (error) {
      resp = error
      chunk.status = "ready"
      errorTimes--
    }
  }
  if (chunk.status === "ready") {
    chunk.status = "error"
  }
  const fileOffset = resize(offset, start)
  return { resp, fileOffset }
}
```

建立特别多的tcp的连接，使浏览器卡顿，并发请求的数量需要控制在一定范围。

上传的文件切片通过上述的`generator`生成，更改的切片大小由上述的`requestResizeChunk`进行计算，获得的切片大小是最新返回的计算结果。

```ts
function requestWithConcurrent (
  chunkItor: Iterator<FileChunk, void, number>,
  fileOffset: number,
  uploadAPI: UploadAPI,
) {
  let max = 4
  return new Promise((resolve) => {
    const result = []
    const next = () => {
      const chunkItorResult = chunkItor.next(fileOffset)
      if (chunkItorResult.done) {
        if (max === 1) { // 最后一个线程返回
          resolve(result)
        } else {
          max--
        }
        return
      }
      const chunk = chunkItorResult.value as FileChunk
      requestResizeChunk(chunk, fileOffset, uploadAPI)
        .then(res => {
          fileOffset = res.fileOffset
          result.push(res.resp)
        })
        .finally(() => {
          next()
        })
    }
    Array(max).fill(1).forEach(() => next())
  })
}
```

## 断点续传

断点续传的原理在于前端/服务端需要记住已上传的切片，这样下次上传就可以跳过之前已上传的部分。

* 不使用`浏览器保存`，防止刷新页面/换浏览器丢失上传记录，服务端需要配合返回已上传文件切片。
* 不使用`xhr.abort()`停止上传任务，因为这个方法会清空js的调用栈，通过`任务读取取消标记`控制停止上传行为。

### 标记断点 - hash计算worker

直接关闭worker

```ts
function stop () {
  // stop worker
  worker?.terminate()
  // promise return
  ob?.next("")
}
```

### 标记断点 - 上传任务队列

添加标记，在上传任务安全退出后才能重新启动上传。

```ts

let canceled = false

function stop () {
  canceled = true
}

async function slowStart(file: File, uploadedFileList: FileChunkDesc[], uploadAPI: UploadAPI) {
  const fileOffset = 10 * 1024 * 1024 // file chunks start 10M start
  const fileChunks = filterUploadedFileChunks(file, uploadedFileList)
  const fileChunksIteror = dynamicSize(file, fileChunks, fileOffset)
  const res = await requestWithConcurrent(fileChunksIteror, fileOffset, uploadAPI)
  canceled = false
}
```

修改`requestWithConcurrent`每次发请求都判断当前上传是否被取消

```ts
requestResizeChunk(chunk, fileOffset, uploadAPI)
  .then(res => {
    fileOffset = res.fileOffset
    result.push(res.resp)
  })
  .finally(() => {
    if (canceled) {
      chunkItor.return()
    }
    next()
  })
```

### 续传

等待上述停止动作都执行完成后，重新执行启动上传机会按流程重新开始上传。

## canvas实现进度条

因为文件分片粒度可能特别小，而且上传分片位置不确定，使用`canvas`绘制的进度条更加直观的查看【已经上传、错误上传、多任务正在上传、上传成功】的状态。

```ts
function drawPercent(start: number, end: number, status: UploadStatus) {
  const x1 = start * 500 / uploadState.size
  const x2 = end * 500 / uploadState.size
  switch(status) {
    case "pass": ctx.value.fillStyle = "#45c23a"; break
    case "ready": ctx.value.fillStyle = "#666666"; break
    case "uploading": ctx.value.fillStyle = "#0088ff"; break
    case "uploaded": ctx.value.fillStyle = "#45c23a"; break
    case "error": ctx.value.fillStyle = "#bc1717"; break
  }
  ctx.value.fillRect(Math.floor(x1), 0, Math.ceil(x2 - x1), 10)
}
```
