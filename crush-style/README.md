# crush-style · 开发说明

怎么安装、怎么用,见[仓库根目录的 README](../README.md)。这里写给想读或改代码的人。

这是一个 Claude Code 的 mod:用函数 hook 写成的插件,在 Claude Code 2.1.287 上开发。mod 的 API 仍是早期版本,以本机 Claude Code 写出的类型声明为准(见下文"类型检查")。

## 每个界面元素由哪个 hook 画

| Crush 的元素 | 这里怎么做 |
| --- | --- |
| 用户消息的紫色竖条 | `UserMessage`:左侧 `▌`(Charple),高度按换行后的行数算,中文按双宽处理。只改用户亲手输入的消息,任务通知等仍由引擎画 |
| 助手消息 | `AssistantMessage`:Markdown 缩进两列,去掉回复开头的圆点。超过 Markdown 元素上限(1 万字符)时交还引擎 |
| 回复末尾的 `◇ 模型 耗时` | `TurnDuration` |
| 工具调用行 | `ToolUse`:状态图标(运行中是旋转的渐变点、`✓`、`×`、`⊘`)+ 工具名 + 参数;Edit/Write 行尾显示 `+3 -1`,被中断的显示 `interrupted` |
| 工具名 | Read→View、WebFetch→Fetch、WebSearch→Search、Task→Agent、TodoWrite→To-Do;MCP 工具显示为 `工具名  服务器 · 参数` |
| Bash 输出块 | `ToolResult`:带 `│` 边栏,最多 10 行,其余折叠成 `… N more lines`;出错时整块红色。其他工具的结果仍由引擎画 |
| 一次读多个文件时逐个列出 | `ToolGroup`:把 `isExpanded` 改成 `true`,每个调用变成独立的 `ToolUse` 行 |
| 渐变闪动的 "Thinking…" | `Spinner`:单词上有一道流动的紫粉渐变,带已用时间 |
| `╱╱╱╱` 斜线分隔 | 侧边栏标题和状态带两端 |
| 圆角边框的命令输出 | `CommandOutput` |
| 信息栏 | `Pane`:会话标题、目录、分支、模型、上下文进度条、token、花费、5h/7d 额度、改动文件(+/-)、To-Do、工具调用统计 |
| 输入框上方的状态行 | `AbovePrompt`:模型、上下文、花费、To-Do 进度、分支、目录。有侧边栏停靠时让位 |
| 输入时的高亮 | `prompt.edit`:开头的 `/命令`、`!`、`@文件` 上色 |

所有绘制都只在 `terminal` 表面生效,桌面端、VS Code、手机端一律交还引擎。

## 状态放在哪

- **`$.state`**(会话内,热重载后保留):动画帧、本轮开始时间、改动文件、工具计数、To-Do、标题、分支、模型、用量。绘制时读取会自动订阅,写入时只重画读过它的那几行。
- **`$.store`**(跨会话):总开关 `enabled`,以及用户手动关掉侧边栏的标记 `sidebarDismissed`。
- **模块变量**(重载后清零):home 目录、cwd、模型 id、动画计时器。

总开关放在 `$.store` 而不是 `userConfig`,原因是实测在 `claude -p` 会话里,`$.config.list()` 不列出任何插件配置行,`$.config.set('<plugin>.<field>')` 会直接报错。关闭时所有 hook 仍然注册、只是原样放行,并调用 `$.ui.invalidate('ui.render')` 让已画出的行重画;改动文件等统计照常记录。

动画计时器(120 ms 一帧)只在一轮对话进行中运行,`turn.complete` 时停止;热重载发生在一轮中间时,会从 `$.state` 里的开始时间恢复。

## 验证器的两条规矩

写 hook 时 `claude plugin validate` 会静态扫描源码,有两条规矩类型声明里看不出来:

1. 接收 `$` 的辅助函数必须是**本文件顶层**的函数声明(或绑定到函数的 const),不能写在 `register` 里面,也不能从别的文件导入。
2. `read($, x)` / `update($, x, fn)` 的 `x` 必须是**本文件里**用 `atom({ plugin, key } as const, 初始值)` 声明的,不能从别的模块导入。

所以所有 hook、atom 和接收 `$` 的函数都在 `hooks/register.tsx`;其他文件只放纯函数和返回元素树的绘制函数(它们接收 `$.ui.resolve(e)` 返回的元素表,不接收 `$`)。

## 文件

```
.claude-plugin/plugin.json   清单和配置项(userConfig)
hooks/hooks.json             指向 register.tsx
hooks/register.tsx           所有 hook、atom、命令
hooks/theme.tsx              配色、渐变、显示宽度、格式化
hooks/messages.tsx           用户/助手消息、Spinner、页脚、命令框
hooks/tools.tsx              工具行、输出块、各工具的名字和参数
hooks/sidebar.tsx            侧边栏和状态带
types/index.d.ts             $.state 的类型契约
tests/crush-style.test.tsx   界面、工具、侧边栏、生命周期
tests/switch.test.tsx        总开关
tsconfig.json                继承引擎生成的配置
```

## 检查和测试

在仓库根目录运行:

```
claude plugin validate crush-style    # 引擎会怎么读这个 mod,会拒绝什么
claude plugin test crush-style        # 40 个测试
```

测试用 Claude Code 自带的测试工具(`claude-code/testing`):在终端、桌面等表面上挂载组件,检查 hook 返回的元素树能通过校验、内容正确。它**不画像素**,所以颜色和对齐只能在真实终端里看。

### 类型检查

mod 被 Claude Code 加载过一次后,引擎会在 `.claude-plugin/types/` 下写出本机版本的类型声明(这个目录不进 git)。之后:

```
npx -p typescript tsc -p crush-style
```

在 Windows 的 Git Bash 里用 `claude -p "/crush on"` 这类命令做试验时要小心:Git Bash 会把以 `/` 开头的参数改写成 Windows 路径。请改用 PowerShell。

## 没在真实终端里验证的

- 用户消息的竖条高度和换行是否对齐(中文、长行、窄窗口)
- 侧边栏在全屏布局下的宽度和滚动
- 关闭/打开总开关时,历史消息是否立刻重画
- Spinner 的渐变在不同终端里的真彩色效果

## 改配色

所有颜色都在 `hooks/theme.tsx` 顶部的 `C` 对象里,用的是 Charm 的调色板(Charple、Dolly、Bok 等)。正文不设颜色,跟随终端自己的前景色,所以亮色主题下也能读。
