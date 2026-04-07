const { sendText, sendTextGetId, updateCard } = require('./sender');
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
    if (processedEvents.size > MAX_PROCESSED_CACHE) {
      const firstKey = processedEvents.values().next().value;
      processedEvents.delete(firstKey);
    }
  }

  // Only handle text and post (rich text) messages
  if (message.message_type !== 'text' && message.message_type !== 'post') {
    logger.debug(`Ignoring message type: ${message.message_type}`);
    return;
  }

  // Parse message content
  let text;
  try {
    const content = JSON.parse(message.content);
    if (message.message_type === 'post') {
      text = extractPostText(content);
    } else {
      text = content.text || '';
    }
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

  // Send processing indicator as a card (so we can update it later)
  let statusMsgId = null;
  try {
    statusMsgId = await sendTextGetId(client, chatId, 'Processing...');
    logger.info('Sent processing indicator, msgId:', statusMsgId);
  } catch (err) {
    logger.error('Failed to send processing indicator:', err.message);
  }

  // Get existing session ID (null if new chat)
  const existingSessionId = sessionManager.getSessionId(chatId);

  // Queue Claude calls per chat
  const task = async () => {
    logger.info('Calling Claude Code...');

    // Status update callback: update the processing card in real-time
    const onStatus = (statusText) => {
      if (statusMsgId) {
        updateCard(client, statusMsgId, statusText).catch(() => {});
      }
    };

    const result = await runClaude(text, existingSessionId, onStatus);
    logger.info('Claude Code returned:', result.success ? 'success' : 'error', `(${result.duration}ms)`);

    if (result.success && result.sessionId) {
      sessionManager.setSessionId(chatId, result.sessionId);
    }

    const response = formatClaudeResult(result);

    // Update the processing card with final result, or send new message if card update fails
    if (statusMsgId) {
      try {
        await updateCard(client, statusMsgId, response);
        logger.info('Updated processing card with Claude response');
      } catch (err) {
        logger.error('Failed to update card, sending new message:', err.message);
        await sendText(client, chatId, response);
      }
    } else {
      try {
        await sendText(client, chatId, response);
        logger.info('Sent Claude response to Feishu');
      } catch (err) {
        logger.error('Failed to send Claude response:', err.message);
      }
    }
  };

  // Chain onto existing queue for this chat, or start new one
  const prev = chatQueues.get(chatId) || Promise.resolve();
  const next = prev.then(task, task);
  chatQueues.set(chatId, next);
  next.finally(() => {
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
    await sendText(client, chatId, 'Session cleared. Starting fresh.');
    return true;
  }

  if (command === '/status') {
    const activeTasks = getActiveTaskCount();
    const sessionInfo = sessionManager.getSessionInfo(chatId);
    let status = `Status\n\n`;
    status += `Active tasks: ${activeTasks}\n`;
    if (sessionInfo) {
      status += `Session: ${sessionInfo.sessionId.slice(0, 8)}...\n`;
      status += `Created: ${sessionInfo.createdAt}\n`;
      status += `Last used: ${sessionInfo.lastUsedAt}\n`;
    } else {
      status += `Session: none (will be created on first message)\n`;
    }
    await sendText(client, chatId, status);
    return true;
  }

  if (command === '/help') {
    const help = `Claude Code Bridge\n\n` +
      `Send any message to chat with Claude Code.\n\n` +
      `Commands:\n` +
      `/reset or /new - Clear session, start fresh\n` +
      `/status - View current status\n` +
      `/help - Show this help`;
    await sendText(client, chatId, help);
    return true;
  }

  return false;
}

/**
 * Extract plain text from a Feishu "post" (rich text) message.
 * Post content is structured as: { title, content: [[{tag, text, href, ...}]] }
 */
function extractPostText(content) {
  const parts = [];
  const title = content.title;
  if (title) parts.push(title);

  // content is an array of paragraphs, each paragraph is an array of elements
  const paragraphs = content.content || [];
  for (const paragraph of paragraphs) {
    const line = [];
    for (const element of paragraph) {
      if (element.tag === 'text' && element.text) {
        line.push(element.text);
      } else if (element.tag === 'a' && element.href) {
        const label = element.text || element.href;
        line.push(`${label} (${element.href})`);
      } else if (element.tag === 'at' && element.user_name) {
        // skip @mentions
      }
    }
    if (line.length > 0) parts.push(line.join(''));
  }

  return parts.join('\n');
}

module.exports = { registerHandlers };
