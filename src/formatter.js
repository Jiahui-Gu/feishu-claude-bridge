// Maximum output length before truncation
const MAX_OUTPUT_LENGTH = 20000;

/**
 * Format Claude Code output for Feishu display.
 * Handles truncation, cleanup, and adds metadata.
 * @param {object} result - Result from runner.runClaude()
 * @returns {string} Formatted message text
 */
function formatClaudeResult(result) {
  if (!result.success) {
    return `**Error**\n\n${result.error}`;
  }

  let text = result.result || '(empty response)';

  // Clean up common artifacts
  text = cleanOutput(text);

  // Convert unsupported markdown to Feishu-compatible format
  text = toFeishuMarkdown(text);

  // Truncate if too long
  if (text.length > MAX_OUTPUT_LENGTH) {
    text = text.slice(0, MAX_OUTPUT_LENGTH) + '\n\n... (truncated)';
  }

  // Add execution time
  if (result.duration) {
    const seconds = (result.duration / 1000).toFixed(1);
    text += `\n\n⏱️ ${seconds}s`;
  }

  return text;
}

/**
 * Convert standard Markdown to Feishu card-compatible Markdown.
 *
 * Feishu cards support: bold, italic, strikethrough, links, lists, code blocks
 * Feishu cards do NOT support: headings (#), tables, blockquotes (>)
 */
function toFeishuMarkdown(text) {
  // Convert headings to bold text
  // Must handle inside code blocks carefully - skip code blocks
  const parts = splitByCodeBlocks(text);

  for (let i = 0; i < parts.length; i++) {
    if (parts[i].isCode) continue;

    let t = parts[i].text;

    // Headings → bold
    t = t.replace(/^#{1,6}\s+(.+)$/gm, '**$1**');

    // Blockquotes → italic with bar
    t = t.replace(/^>\s*(.+)$/gm, '| *$1*');

    // Tables → simple aligned text
    t = convertTables(t);

    // Checkbox lists
    t = t.replace(/^(\s*)- \[x\]\s*/gm, '$1✅ ');
    t = t.replace(/^(\s*)- \[ \]\s*/gm, '$1⬜ ');

    parts[i].text = t;
  }

  return parts.map(p => p.text).join('');
}

/**
 * Split text into code blocks and non-code sections.
 */
function splitByCodeBlocks(text) {
  const parts = [];
  const regex = /(```[\s\S]*?```)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index), isCode: false });
    }
    parts.push({ text: match[0], isCode: true });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), isCode: false });
  }

  return parts;
}

/**
 * Convert markdown tables to simple text format.
 */
function convertTables(text) {
  const lines = text.split('\n');
  const result = [];
  let i = 0;

  while (i < lines.length) {
    // Detect table: line with |, followed by separator line with |---|
    if (i + 1 < lines.length &&
        lines[i].includes('|') &&
        /^\s*\|?\s*[-:]+[-|\s:]+$/.test(lines[i + 1])) {

      // Parse header
      const headers = parseTableRow(lines[i]);

      // Skip separator
      i += 2;

      // Parse data rows
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        rows.push(parseTableRow(lines[i]));
        i++;
      }

      // Format as readable text
      for (const row of rows) {
        const pairs = headers.map((h, idx) => `**${h}**: ${row[idx] || ''}`);
        result.push(pairs.join('  |  '));
      }
      result.push('');
    } else {
      result.push(lines[i]);
      i++;
    }
  }

  return result.join('\n');
}

/**
 * Parse a markdown table row into cells.
 */
function parseTableRow(line) {
  return line.split('|')
    .map(cell => cell.trim())
    .filter(cell => cell.length > 0);
}

/**
 * Clean up common artifacts in Claude Code output.
 */
function cleanOutput(text) {
  // Remove ANSI escape codes
  text = text.replace(/\x1b\[[0-9;]*m/g, '');

  // Remove null bytes
  text = text.replace(/\0/g, '');

  // Trim excessive whitespace
  text = text.replace(/\n{4,}/g, '\n\n\n');

  return text.trim();
}

module.exports = { formatClaudeResult };
