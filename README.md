# Feishu Claude Bridge

> 把真正的 Claude Code 能力带进飞书群聊。

一个轻量 Node.js 服务，通过飞书 WebSocket 长连接接收群聊消息，调��本地 [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI（`claude -p`）处理，结果发回飞书。

**无需公网服务器，无需域名，本地运行即可。**

## 为什么需要这个？

飞书生态里的 AI Bot（如 OpenClaw）自带的 agent 能力有限——不会用工具、上下文差、编码质量低。而 Claude Code CLI 拥有完整的 agent 能力：读写文件、执行命令、多���推理、自主编程。

这个桥接服务让你在飞书群里直接获得和终端里一样的 Claude Code 体验。

## 架构

```
飞书用户 ←→ 飞书服务器 ←WebSocket→ Bridge (Node.js) ←subprocess→ Claude Code CLI
```

## 功能

- **群聊直接对话** — 无需 @bot，群里发消息即可触发
- **多轮对话** — 自动维护 session，支持上下文记忆
- **完整工具能力** — Claude Code 的所有能力：读写文件、执行命令、搜索代码等
- **长消息分片** — 超长回复自动拆分发送
- **并发控制** — 可配置最大并发任务数
- **超时保护** — 自动 kill 超时任务
- **会话管理** — `/reset` 重置对话，`/status` 查看状态

## 前置要求

- **Node.js** >= 18
- **Claude Code CLI** 已安装并登录（`claude` 命令可用）
- **飞书开发者账号**，需创建一个自建应用

## 快速开始

### 1. 克隆并安装

```bash
git clone https://github.com/anthropics/feishu-claude-bridge.git
cd feishu-claude-bridge
npm install
```

### 2. 配置飞书 App

在[飞书开发者后台](https://open.feishu.cn/app)创建应用：

1. **应用能力** → 开启「机器人」
2. **事件与回调** → 订阅方式选「长连接」
3. **事件与回调** → 添加事件 `im.message.receive_v1`
4. **权限管理** → 开通以下权限：
   - `im:message` — 获取与发送单聊、群组消息
   - `im:message.group_msg` — 获取群组中所有消息
   - `im:message.p2p_msg:readonly` — 读��单聊消息
5. **应用发布** → 创��版本并发布

> **重要**：每次修改配置后需要「创建版本 → 发布」才会生效。

### 3. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，填入飞书 App 凭据：

```env
FEISHU_APP_ID=your_app_id
FEISHU_APP_SECRET=your_app_secret
```

### 4. 启动

```bash
npm start
```

Windows 用户也可以双击 `start.bat` 启动。

看到以下日志表示连接成功：

```
[INFO] === Feishu Claude Code Bridge ===
[INFO] Bridge is running. Waiting for messages from Feishu...
```

### 5. 测试

在飞书群聊里发送任意消息，bot 会回复 Claude Code 的响应。

## 配置项

在 `.env` 中可配置：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `FEISHU_APP_ID` | (必填) | 飞书 App ID |
| `FEISHU_APP_SECRET` | (必填) | 飞书 App Secret |
| `CLAUDE_WORK_DIR` | 当前目录 | Claude Code 的工作目录（决定项目上下文） |
| `CLAUDE_MAX_CONCURRENT` | `3` | 最大并发 Claude 任务数 |
| `CLAUDE_TIMEOUT` | `600000` | 超时时间（毫秒），默认 10 分钟 |
| `CLAUDE_MAX_TURNS` | `25` | 每次调用的最大轮数 |
| `LOG_LEVEL` | `info` | 日志级别：debug, info, warn, error |

## 命令

在群聊中发送以下命令：

| 命令 | 说明 |
|------|------|
| `/reset` 或 `/new` | 清除当前会话，开始新对话 |
| `/status` | 查看当前任务状态和会话信息 |
| `/help` | 显示帮助 |

## 项目结构

```
feishu-claude-bridge/
├── config.js               # 配置加载
├── src/
│   ├── index.js            # 入口
│   ├── logger.js           # 日志
│   ├── formatter.js        # 输出格式化
│   ├── feishu/
│   │   ├── client.js       # 飞书 SDK 初始化
│   │   ├── handler.js      # 消息处理
│   │   └── sender.js       # 消息发送（含分片）
│   └── claude/
│       ├── runner.js       # Claude CLI 子进程管理
│       └── session.js      # 会话映射与持久化
├── data/                   # 运行时数据（自动创建）
├── .env.example
├── start.bat               # Windows 一键启动
└── package.json
```

## 工作原理

1. 通过飞书 SDK 的 WebSocket 模式建立长连接（无需公网暴露）
2. 收到 `im.message.receive_v1` 事件后，解析消息文本
3. Spawn `claude -p` 子进程执行，使用 `--resume` 恢复多轮对话上下文
4. 解析 JSON 格式输出，格式化后通过飞书 API 发回群聊
5. Session ID 持久化到本地 JSON 文件，服务重启后可继续对话

## 常见问题

**Q: bot 收不到群消息？**
确认飞书 App 已开通 `im:message.group_msg` 权限，且已发布最新版本。

**Q: 提示 "Session already in use"？**
发送 `/reset` 清除会话，或等待前一个任务完成。同一群聊的消息会自动排队。

**Q: Claude 响应很慢？**
Claude Code 执行复杂任务（如写代码、搜索文件）��能需要几十秒。可通过 `CLAUDE_MAX_TURNS` 限制轮数。

## License

MIT
