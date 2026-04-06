const fs = require('fs');
const path = require('path');
const config = require('../../config');
const logger = require('../logger');

/**
 * Manages mapping between Feishu chat_id and Claude Code session_id.
 * Persists to a JSON file so sessions survive restarts.
 */
class SessionManager {
  constructor() {
    this.filePath = path.resolve(config.sessionsFile);
    this.sessions = this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(data);
        logger.info(`Loaded ${Object.keys(parsed).length} sessions from disk`);
        return parsed;
      }
    } catch (err) {
      logger.warn('Failed to load sessions file, starting fresh:', err.message);
    }
    return {};
  }

  _save() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.sessions, null, 2), 'utf-8');
    } catch (err) {
      logger.error('Failed to save sessions:', err.message);
    }
  }

  /**
   * Get the session_id for a given chat_id, or null if none exists.
   * @param {string} chatId - Feishu chat ID
   * @returns {string|null} Claude Code session ID, or null for new chats
   */
  getSessionId(chatId) {
    const session = this.sessions[chatId];
    if (session) {
      session.lastUsedAt = new Date().toISOString();
      this._save();
      return session.sessionId;
    }
    return null;
  }

  /**
   * Save or update the session_id for a chat (called after Claude returns).
   * @param {string} chatId
   * @param {string} sessionId - The session ID returned by Claude
   */
  setSessionId(chatId, sessionId) {
    if (!this.sessions[chatId]) {
      this.sessions[chatId] = {
        sessionId,
        createdAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString(),
      };
      logger.info(`Saved new session for chat ${chatId}: ${sessionId}`);
    } else {
      this.sessions[chatId].sessionId = sessionId;
      this.sessions[chatId].lastUsedAt = new Date().toISOString();
    }
    this._save();
  }

  /**
   * Reset session for a chat (user wants to start fresh).
   * @param {string} chatId
   */
  resetSession(chatId) {
    delete this.sessions[chatId];
    this._save();
    logger.info(`Reset session for chat ${chatId}`);
  }

  /**
   * Check if a chat has an existing session.
   * @param {string} chatId
   * @returns {boolean}
   */
  hasSession(chatId) {
    return !!this.sessions[chatId];
  }

  /**
   * Get session info for status display.
   * @param {string} chatId
   * @returns {object|null}
   */
  getSessionInfo(chatId) {
    return this.sessions[chatId] || null;
  }
}

// Export singleton
module.exports = new SessionManager();
