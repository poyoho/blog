# powershell7

[powershell7](https://github.com/PowerShell/PowerShell/releases) 优化 window 环境命令行使用。

## 安装 oh-my-post

- 运行 pwsh 启动 PowerShell 7，然后安装 posh-git 和 oh-my-posh：

```powershell
Install-Module posh-git -Scope CurrentUser # posh-git
Install-Module oh-my-posh -Scope CurrentUser -RequiredVersion 2.0.496 # oh-my-posh
```

- 输入`$profile`获取 PowerShell 7 启动的时候自动执行文件位置，在文件中编写加载模块代码。

```powershell
Import-Module posh-git # 引入 posh-git
Import-Module oh-my-posh # 引入 oh-my-posh

Set-Theme Paradox # 设置主题为 Paradox

Set-PSReadLineOption -PredictionSource History # 设置预测文本来源为历史记录

Set-PSReadlineKeyHandler -Key Tab -Function Complete # 设置 Tab 键补全
Set-PSReadLineKeyHandler -Key "Ctrl+d" -Function MenuComplete # 设置 Ctrl+d 为菜单补全和 Intellisense
Set-PSReadLineKeyHandler -Key "Ctrl+z" -Function Undo # 设置 Ctrl+z 为撤销
Set-PSReadLineKeyHandler -Key UpArrow -Function HistorySearchBackward # 设置向上键为后向搜索历史记录
Set-PSReadLineKeyHandler -Key DownArrow -Function HistorySearchForward # 设置向下键为前向搜索历史纪录
```

- 安装新的控制台字体[CascadiaPL](https://github.com/microsoft/cascadia-code/releases)展示更全的字符图标。

## 安装常用软件

使用 [scoop](https://github.com/lukesampson/scoop) 管理 window 下的包。

```powershell
Invoke-Expression (New-Object System.Net.WebClient).DownloadString('https://get.scoop.sh')
```

安装常用控制台命令软件。

```powershell
scoop install busybox
scoop install sudo
scoop install vim
```
