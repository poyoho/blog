# mac 浏览器多版本

## Chromium

* 查看chromium的版本信息对应的[branches](https://chromiumdash.appspot.com/branches)。

* 以下载 chrome@70 为例，复制branches为 587811。去[这里](https://commondatastorage.googleapis.com/chromium-browser-snapshots/index.html?)找到对应的系统版本，下载对应chromium的版本。

* 下载完成后解压，就拿到了 Arm 版本的 Chromium。 然而打开时又出现了新的问题：

```text
Chromium is damaged and can't be opened. You should move it to the Trash.
```

遇到这个报错必须要移除对应的验证：

```sh
xattr -c ./Chromium.app
```

* 打开后，访问`chrome://version/`，可以看到版本号为 70.0.3538.110，这个版本号就是对应的 Chrome 版本号。

## Safari

// TODO
