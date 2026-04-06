// Maximum output length before truncation
const MAX_OUTPUT_LENGTH = 3500;

/**
 * Format Claude Code output for Feishu display.
 * Handles truncation, cleanup, and adds metadata.
 * @param {object} result - Result from runner.runClaude()
 * @returns {string} Formatted message text
 */
function formatClaudeResult(result) {
  if (!result.success) {
    return `❌ 错误\n\n${result.error}`;
  }

  let text = result.result || '(empty response)';

  // Clean up common artifacts
  text = cleanOutput(text);

  // Truncate if too long
  if (text.length > MAX_OUTPUT_LENGTH) {
    text = text.slice(0, MAX_OUTPUT_LENGTH) + '\n\n... (输出过长，已截断)';
  }

  // Add execution time
  if (result.duration) {
    const seconds = (result.duration / 1000).toFixed(1);
    text += `\n\n⏱️ ${seconds}s`;
  }

  return text;
}

/**
 * Clean up common artifacts in Claude Code output.
 */
function cleanOutput(text) {
  // Remove ANSI escape codes (shouldn't be present in JSON mode, but just in case)
  text = text.replace(/\x1b\[[0-9;]*m/g, '');

  // Remove null bytes
  text = text.replace(/\0/g, '');

  // Trim excessive whitespace
  text = text.replace(/\n{4,}/g, '\n\n\n');

  return text.trim();
}

module.exports = { formatClaudeResult };
