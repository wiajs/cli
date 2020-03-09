# @wiajs/cli

> wiajs/cli is the Standard Tooling for Wia App Development.

> Note: This tool's part of the code is borrowed from [Vue-cli](https://github.com/vuejs/vue-cli) and [gulp-cli](https://github.com/gulpjs/gulp-cli). I am forever grateful for the gift they are to the web.

## install

需全局安装。

```sh
npm install -g @wiajs/cli
```

## use

### init

generate a wia workspace from a preset.

在命令行中进入项目目录，比如：`d:\prj` or `C:\Users\xxx\prj`，输入如下指令：

`wia init`

将在项目目录中创建一个 wia 目录，并安装好 wia 开发所需的各种工具库，准备好开发环境。

### new

create a new wia app.

`wia new appname`

创建一个新的项目，并搭好项目架构，初始化 git 库。
