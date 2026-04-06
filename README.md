# Feishu Claude Bridge

[中文](README.zh-CN.md)

> Bring the full power of Claude Code into Feishu (Lark) group chats.

A lightweight Node.js bridge that connects Feishu group chats to the local [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI via WebSocket. No public server needed — just run it locally.

## Architecture

```
Feishu User ←→ Feishu Server ←WebSocket→ Bridge (Node.js) ←subprocess→ Claude Code CLI
```

## Setup

### One-liner: Let Claude Code do it for you

Just tell your Claude Code:

> Help me set up feishu-claude-bridge. Clone https://github.com/Jiahui-Gu/feishu-claude-bridge, run npm install, then guide me through creating a Feishu app and getting the App ID and App Secret.

It will walk you through everything.

### Manual Setup

<details>
<summary>Click to expand</summary>

#### 1. Clone & Install

```bash
git clone https://github.com/Jiahui-Gu/feishu-claude-bridge.git
cd feishu-claude-bridge
npm install
```

#### 2. Create a Feishu App

Go to [Feishu Developer Console](https://open.feishu.cn/app) and create an app:

1. **App Capabilities** → Enable "Bot"
2. **Events & Callbacks** → Subscription mode: "Long Connection" (WebSocket)
3. **Events & Callbacks** → Add event: `im.message.receive_v1`
4. **Permissions** → Enable: `im:message`, `im:message.group_msg`, `im:message.p2p_msg:readonly`
5. **Publish** the app (changes only take effect after publishing)

#### 3. Configure

```bash
cp .env.example .env
# Edit .env with your FEISHU_APP_ID and FEISHU_APP_SECRET
```

#### 4. Run

```bash
npm start
```

On Windows, double-click `start.bat`.

</details>

## Usage

Send any message in a Feishu group chat — the bot replies with Claude Code's response.

| Command | Description |
|---------|-------------|
| `/reset` | Clear session, start fresh |
| `/status` | View current status |
| `/help` | Show help |

## Configuration

All optional. Set in `.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAUDE_WORK_DIR` | Current dir | Working directory (project context) |
| `CLAUDE_MAX_CONCURRENT` | `3` | Max concurrent tasks |
| `CLAUDE_TIMEOUT` | `600000` | Timeout in ms (10 min) |
| `CLAUDE_MAX_TURNS` | `25` | Max turns per invocation |

## License

MIT
