const logger = require('../logger');

// Feishu card message max size is 30KB; keep content well under that
const MAX_CARD_CONTENT_LENGTH = 20000;
// Feishu text message max length for plain text fallback
const MAX_MESSAGE_LENGTH = 4000;

/**
 * Send a markdown card message to a Feishu chat.
 * Falls back to plain text for short/simple messages.
 * @param {object} client - Feishu SDK Client instance
 * @param {string} chatId - Target chat ID
 * @param {string} text - Message text (may contain markdown)
 * @param {string} [receiveIdType='chat_id'] - Type of receive ID
 */
async function sendText(client, chatId, text, receiveIdType = 'chat_id') {
  // Use card for Claude responses (likely markdown), plain text for short system messages
  if (hasMarkdown(text)) {
    await sendCard(client, chatId, text, receiveIdType);
  } else {
    await sendPlain(client, chatId, text, receiveIdType);
  }
}

/**
 * Send a markdown card message.
 */
async function sendCard(client, chatId, text, receiveIdType) {
  const chunks = splitMessage(text, MAX_CARD_CONTENT_LENGTH);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks.length > 1
      ? `[${i + 1}/${chunks.length}]\n\n${chunks[i]}`
      : chunks[i];

    const card = {
      elements: [{ tag: 'markdown', content: chunk }],
    };

    try {
      await client.im.message.create({
        params: { receive_id_type: receiveIdType },
        data: {
          receive_id: chatId,
          msg_type: 'interactive',
          content: JSON.stringify(card),
        },
      });
      logger.debug(`Sent card chunk ${i + 1}/${chunks.length} to ${chatId}`);
    } catch (err) {
      logger.error(`Failed to send card to ${chatId}:`, err.message);
      // Fallback to plain text if card fails
      logger.info('Falling back to plain text');
      await sendPlain(client, chatId, text, receiveIdType);
      return;
    }

    if (i < chunks.length - 1) {
      await sleep(300);
    }
  }
}

/**
 * Send a plain text message.
 */
async function sendPlain(client, chatId, text, receiveIdType) {
  const chunks = splitMessage(text, MAX_MESSAGE_LENGTH);

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
      logger.debug(`Sent text chunk ${i + 1}/${chunks.length} to ${chatId}`);
    } catch (err) {
      logger.error(`Failed to send message to ${chatId}:`, err.message);
      throw err;
    }

    if (i < chunks.length - 1) {
      await sleep(300);
    }
  }
}

/**
 * Check if text contains markdown formatting.
 */
function hasMarkdown(text) {
  return /[*_`#\[\]~>|-]{2}|^#{1,6}\s|```|\*\*|^\s*[-*]\s/m.test(text);
}

/**
 * Split a message into chunks that fit within a size limit.
 * Tries to split on newlines, falling back to hard split.
 */
function splitMessage(text, maxLength) {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Try to find a good break point (newline) near the limit
    let splitIdx = remaining.lastIndexOf('\n', maxLength);
    if (splitIdx < maxLength * 0.5) {
      // If newline is too far back, try space
      splitIdx = remaining.lastIndexOf(' ', maxLength);
    }
    if (splitIdx < maxLength * 0.5) {
      // Hard split as last resort
      splitIdx = maxLength;
    }

    chunks.push(remaining.slice(0, splitIdx));
    remaining = remaining.slice(splitIdx).trimStart();
  }

  return chunks;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { sendText };
