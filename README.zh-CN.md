# Feishu Claude Bridge

[English](README.md)

> 把真正的 Claude Code 能力带进飞书群聊。

一个轻量 Node.js 服务，通过飞书 WebSocket 长连接接收群聊消息，调用本地 [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI 处理，结果发回飞书。无需公网服务器，本地运行即可。

## 架构

```
飞书用户 ←→ 飞书服务器 ←WebSocket→ Bridge (Node.js) ←subprocess→ Claude Code CLI
```

## 安装

### 一句话搞定：让 Claude Code 帮你配

直接跟你的 Claude Code 说：

> 帮我部署 feishu-claude-bridge。克隆 https://github.com/Jiahui-Gu/feishu-claude-bridge，执行 npm install，然后指导我创建飞书应用并获取 App ID 和 App Secret。

它会带你完成所有步骤。

### 手动安装

<details>
<summary>点击展开</summary>

#### 1. 克隆并安装

```bash
git clone https://github.com/Jiahui-Gu/feishu-claude-bridge.git
cd feishu-claude-bridge
npm install
```

#### 2. 创建飞书应用

在[飞书开发者后台](https://open.feishu.cn/app)创建应用：

1. **应用能力** → 开启「机器人」
2. **事件与回调** → 订阅方式选「长连接」
3. **事件与回调** → 添加事件 `im.message.receive_v1`
4. **权限管理** → 开通：`im:message`、`im:message.group_msg`、`im:message.p2p_msg:readonly`
5. **发布应用**（修改配置后必须重新发布才生效）

#### 3. 配置

```bash
cp .env.example .env
# 编辑 .env，填入 FEISHU_APP_ID 和 FEISHU_APP_SECRET
```

#### 4. 启动

```bash
npm start
```

Windows 用户可双击 `start.bat`。

</details>

## 使用

在飞书群聊里发消息，bot 会回复 Claude Code 的响应。

| 命令 | 说明 |
|------|------|
| `/reset` | 清除会话，重新开始 |
| `/status` | 查看当前状态 |
| `/help` | 显示帮��� |

## 配置项

均为可选，在 `.env` 中设置：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `CLAUDE_WORK_DIR` | 当前目录 | 工作目录（决定项目上下文） |
| `CLAUDE_MAX_CONCURRENT` | `3` | 最大并发任务数 |
| `CLAUDE_TIMEOUT` | `600000` | 超时时间（毫秒，默认 10 分钟） |
| `CLAUDE_MAX_TURNS` | `25` | 每次调用最大轮数 |

## License

MIT
