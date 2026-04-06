const logger = require('../logger');

// Feishu text message max length (roughly 4000 chars to be safe)
const MAX_MESSAGE_LENGTH = 4000;

/**
 * Send a text message to a Feishu chat.
 * Automatically splits long messages into chunks.
 * @param {object} client - Feishu SDK Client instance
 * @param {string} chatId - Target chat ID (either chat_id or open_id depending on receive_id_type)
 * @param {string} text - Message text to send
 * @param {string} [receiveIdType='chat_id'] - Type of receive ID
 */
async function sendText(client, chatId, text, receiveIdType = 'chat_id') {
  const chunks = splitMessage(text);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks.length > 1
      ? `[${i + 1}/${chunks.length}] ${chunks[i]}`
      : chunks[i];

    try {
      await client.im.message.create({
        params: { receive_id_type: receiveIdType },
        data: {
          receive_id: chatId,
          msg_type: 'text',
          content: JSON.stringify({ text: chunk }),
        },
      });
      logger.debug(`Sent message chunk ${i + 1}/${chunks.length} to ${chatId}`);
    } catch (err) {
      logger.error(`Failed to send message to ${chatId}:`, err.message);
      throw err;
    }

    // Small delay between chunks to avoid rate limiting
    if (i < chunks.length - 1) {
      await sleep(300);
    }
  }
}

/**
 * Reply to a specific message in Feishu.
 * @param {object} client - Feishu SDK Client instance
 * @param {string} messageId - Message ID to reply to
 * @param {string} text - Reply text
 */
async function replyText(client, messageId, text) {
  const chunks = splitMessage(text);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks.length > 1
      ? `[${i + 1}/${chunks.length}] ${chunks[i]}`
      : chunks[i];

    try {
      await client.im.message.reply({
        path: { message_id: messageId },
        data: {
          msg_type: 'text',
          content: JSON.stringify({ text: chunk }),
        },
      });
      logger.debug(`Replied chunk ${i + 1}/${chunks.length} to message ${messageId}`);
    } catch (err) {
      logger.error(`Failed to reply to message ${messageId}:`, err.message);
      // If reply fails, try sending as a new message (we don't have chatId here so just throw)
      throw err;
    }

    if (i < chunks.length - 1) {
      await sleep(300);
    }
  }
}

/**
 * Split a message into chunks that fit within Feishu's limit.
 * Tries to split on newlines, falling back to hard split.
 */
function splitMessage(text) {
  if (text.length <= MAX_MESSAGE_LENGTH) {
    return [text];
  }

  const chunks = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= MAX_MESSAGE_LENGTH) {
      chunks.push(remaining);
      break;
    }

    // Try to find a good break point (newline) near the limit
    let splitIdx = remaining.lastIndexOf('\n', MAX_MESSAGE_LENGTH);
    if (splitIdx < MAX_MESSAGE_LENGTH * 0.5) {
      // If newline is too far back, try space
      splitIdx = remaining.lastIndexOf(' ', MAX_MESSAGE_LENGTH);
    }
    if (splitIdx < MAX_MESSAGE_LENGTH * 0.5) {
      // Hard split as last resort
      splitIdx = MAX_MESSAGE_LENGTH;
    }

    chunks.push(remaining.slice(0, splitIdx));
    remaining = remaining.slice(splitIdx).trimStart();
  }

  return chunks;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { sendText, replyText };
