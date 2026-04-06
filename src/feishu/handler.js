const { sendText } = require('./sender');
const { runClaude, getActiveTaskCount } = require('../claude/runner');
const sessionManager = require('../claude/session');
const { formatClaudeResult } = require('../formatter');
const logger = require('../logger');

// Track processed event IDs to handle deduplication (Feishu may retry delivery)
const processedEvents = new Set();
const MAX_PROCESSED_CACHE = 1000;

// Per-chat task queue: ensures only one Claude call per chat at a time
const chatQueues = new Map();

/**
 * Register message event handler on the EventDispatcher.
 * @param {object} dispatcher - Feishu EventDispatcher
 * @param {object} client - Feishu Client
 */
function registerHandlers(dispatcher, client) {
  dispatcher.register({
    'im.message.receive_v1': async (data) => {
      try {
        await handleMessage(data, client);
      } catch (err) {
        logger.error('Unhandled error in message handler:', err);
      }
    },
  });
  logger.info('Message handlers registered');
}

/**
 * Handle an incoming Feishu message.
 */
async function handleMessage(data, client) {
  const event = data;
  const message = event?.message;
  const sender = event?.sender;

  if (!message || !sender) {
    logger.warn('Received event with missing message or sender:', JSON.stringify(data));
    return;
  }

  // Dedup by event_id: Feishu retries delivery with the same event_id
  const eventId = event.event_id;
  if (eventId && processedEvents.has(eventId)) {
    logger.debug(`Skipping duplicate event: ${eventId}`);
    return;
  }
  if (eventId) {
    processedEvents.add(eventId);
    // Prevent cache from growing unbounded
    if (processedEvents.size > MAX_PROCESSED_CACHE) {
      const firstKey = processedEvents.values().next().value;
      processedEvents.delete(firstKey);
    }
  }

  // Only handle text messages
  if (message.message_type !== 'text') {
    logger.debug(`Ignoring non-text message type: ${message.message_type}`);
    return;
  }

  // Parse message content
  let text;
  try {
    const content = JSON.parse(message.content);
    text = content.text || '';
  } catch {
    logger.warn('Failed to parse message content');
    return;
  }

  // Strip @bot mentions (format: @_user_xxx or @_all)
  text = text.replace(/@_user_\w+/g, '').trim();

  if (!text) {
    logger.debug('Empty message after stripping mentions, ignoring');
    return;
  }

  const chatId = message.chat_id;
  logger.info(`Message from ${sender.sender_id?.open_id || 'unknown'} in chat ${chatId}: ${text.slice(0, 100)}`);

  // Handle special commands
  if (await handleSpecialCommand(text, chatId, client)) {
    return;
  }

  // Send processing indicator
  try {
    await sendText(client, chatId, '⏳ 正在处理，请稍候...');
    logger.info('Sent processing indicator');
  } catch (err) {
    logger.error('Failed to send processing indicator:', err.message);
  }

  // Get existing session ID (null if new chat)
  const existingSessionId = sessionManager.getSessionId(chatId);

  // Queue Claude calls per chat to avoid "session already in use" errors
  const task = async () => {
    logger.info('Calling Claude Code...');
    const result = await runClaude(text, existingSessionId);
    logger.info('Claude Code returned:', result.success ? 'success' : 'error', `(${result.duration}ms)`);

    // Save the session ID returned by Claude (for new sessions or to confirm)
    if (result.success && result.sessionId) {
      sessionManager.setSessionId(chatId, result.sessionId);
    }

    const response = formatClaudeResult(result);
    try {
      await sendText(client, chatId, response);
      logger.info('Sent Claude response to Feishu');
    } catch (err) {
      logger.error('Failed to send Claude response:', err.message);
    }
  };

  // Chain onto existing queue for this chat, or start new one
  const prev = chatQueues.get(chatId) || Promise.resolve();
  const next = prev.then(task, task); // run even if previous failed
  chatQueues.set(chatId, next);
  next.finally(() => {
    // Clean up if this is still the latest task
    if (chatQueues.get(chatId) === next) {
      chatQueues.delete(chatId);
    }
  });
}

/**
 * Handle special slash commands.
 * @returns {boolean} true if the message was a special command (handled)
 */
async function handleSpecialCommand(text, chatId, client) {
  const command = text.toLowerCase().trim();

  if (command === '/reset' || command === '/new') {
    sessionManager.resetSession(chatId);
    await sendText(client, chatId, '🔄 会话已重置，开始全新对话。');
    return true;
  }

  if (command === '/status') {
    const activeTasks = getActiveTaskCount();
    const sessionInfo = sessionManager.getSessionInfo(chatId);
    let status = `📊 状态\n\n`;
    status += `• 活跃任务: ${activeTasks}\n`;
    if (sessionInfo) {
      status += `• 当前会话: ${sessionInfo.sessionId.slice(0, 8)}...\n`;
      status += `• 会话创建: ${sessionInfo.createdAt}\n`;
      status += `• 最近使用: ${sessionInfo.lastUsedAt}\n`;
    } else {
      status += `• 当前会话: 无（发送消息将自动创建）\n`;
    }
    await sendText(client, chatId, status);
    return true;
  }

  if (command === '/help') {
    const help = `🤖 Claude Code Bridge 帮助\n\n` +
      `直接发送消息即可与 Claude Code 对话。\n\n` +
      `特殊命令:\n` +
      `• /reset 或 /new — 清除当前会话，重新开始\n` +
      `• /status — 查看当前状态\n` +
      `• /help — 显示此帮助信息`;
    await sendText(client, chatId, help);
    return true;
  }

  return false;
}

module.exports = { registerHandlers };
