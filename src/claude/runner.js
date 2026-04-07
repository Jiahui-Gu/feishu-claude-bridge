const { spawn } = require('child_process');
const config = require('../../config');
const logger = require('../logger');

// Track active tasks for concurrency control
let activeTasks = 0;

/**
 * Run Claude Code CLI with the given prompt and session.
 * Uses stream-json output to provide real-time status updates.
 * @param {string} prompt - User's message text
 * @param {string|null} sessionId - Session ID to resume, or null for a new session
 * @param {function|null} onStatus - Callback for status updates: (statusText) => void
 * @returns {Promise<{success: boolean, result?: string, error?: string, duration?: number, sessionId?: string}>}
 */
async function runClaude(prompt, sessionId, onStatus) {
  if (activeTasks >= config.claude.maxConcurrent) {
    return {
      success: false,
      error: `Too many tasks running (${activeTasks}/${config.claude.maxConcurrent}). Please try again later.`,
    };
  }

  activeTasks++;
  const startTime = Date.now();

  try {
    const { text, returnedSessionId } = await spawnClaude(prompt, sessionId, onStatus);
    const duration = Date.now() - startTime;
    return { success: true, result: text, duration, sessionId: returnedSessionId };
  } catch (err) {
    const duration = Date.now() - startTime;
    logger.error(`Claude execution failed after ${duration}ms:`, err.message);
    return { success: false, error: err.message, duration };
  } finally {
    activeTasks--;
  }
}

/**
 * Spawn claude -p as a child process with streaming output.
 */
function spawnClaude(prompt, sessionId, onStatus) {
  return new Promise((resolve, reject) => {
    const args = [
      '-p', prompt,
      '--output-format', 'stream-json',
      '--verbose',
      '--max-turns', String(config.claude.maxTurns),
      '--dangerously-skip-permissions',
    ];

    if (sessionId) {
      args.push('--resume', sessionId);
      logger.info(`Spawning: claude -p ... --resume ${sessionId}`);
    } else {
      logger.info('Spawning: claude -p ... (new session)');
    }

    const env = { ...process.env };
    delete env.CLAUDECODE;
    env.CLAUDE_CODE_SKIP_AUTH_LOGIN = 'true';

    const child = spawn('claude', args, {
      cwd: config.claude.workDir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let resultText = '';
    let returnedSessionId = null;
    let buffer = '';
    let lastStatusTime = 0;
    const STATUS_THROTTLE = 2000; // Min ms between status updates

    child.stdout.on('data', (data) => {
      buffer += data.toString();

      // Process complete lines
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep incomplete last line

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          processStreamEvent(event, onStatus, lastStatusTime, STATUS_THROTTLE, (time) => { lastStatusTime = time; });

          // Capture session_id from any event that has it
          if (event.session_id) {
            returnedSessionId = event.session_id;
          }

          // Capture final result
          if (event.type === 'result') {
            resultText = extractResultText(event);
            if (event.session_id) returnedSessionId = event.session_id;
          }
        } catch (e) {
          // Skip unparseable lines
        }
      }
    });

    let stderr = '';
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    const timer = setTimeout(() => {
      logger.warn(`Claude process timed out after ${config.claude.timeout}ms, killing...`);
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!child.killed) child.kill('SIGKILL');
      }, 5000);
      reject(new Error(`Claude timed out after ${Math.round(config.claude.timeout / 60000)} minutes. Task killed.`));
    }, config.claude.timeout);

    child.on('close', (code) => {
      clearTimeout(timer);

      // Process any remaining buffer
      if (buffer.trim()) {
        try {
          const event = JSON.parse(buffer);
          if (event.type === 'result') {
            resultText = extractResultText(event);
            if (event.session_id) returnedSessionId = event.session_id;
          }
          if (event.session_id) returnedSessionId = event.session_id;
        } catch (e) {
          // Try regex fallback for session_id
          const match = buffer.match(/"session_id"\s*:\s*"([^"]+)"/);
          if (match) returnedSessionId = match[1];
        }
      }

      if (code !== 0 && !resultText) {
        const errorMsg = stderr.trim() || `Claude process exited with code ${code}`;
        reject(new Error(errorMsg));
        return;
      }

      resolve({ text: resultText || '(empty response)', returnedSessionId });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to start Claude CLI: ${err.message}`));
    });
  });
}

/**
 * Process a stream event and emit status updates.
 */
function processStreamEvent(event, onStatus, lastStatusTime, throttle, setLastTime) {
  if (!onStatus) return;

  const now = Date.now();
  if (now - lastStatusTime < throttle) return;

  let status = null;

  if (event.type === 'assistant' && event.message?.content) {
    for (const block of event.message.content) {
      if (block.type === 'tool_use') {
        status = describeToolUse(block.name, block.input);
      }
    }
  }

  if (status) {
    setLastTime(now);
    onStatus(status);
  }
}

/**
 * Generate a human-readable description of a tool call.
 */
function describeToolUse(toolName, input) {
  switch (toolName) {
    case 'Bash':
      if (input?.command) {
        const cmd = input.command.length > 60
          ? input.command.slice(0, 60) + '...'
          : input.command;
        return `Running: \`${cmd}\``;
      }
      return 'Running command...';
    case 'Read':
      if (input?.file_path) {
        const file = input.file_path.split(/[/\\]/).pop();
        return `Reading: ${file}`;
      }
      return 'Reading file...';
    case 'Edit':
      if (input?.file_path) {
        const file = input.file_path.split(/[/\\]/).pop();
        return `Editing: ${file}`;
      }
      return 'Editing file...';
    case 'Write':
      if (input?.file_path) {
        const file = input.file_path.split(/[/\\]/).pop();
        return `Writing: ${file}`;
      }
      return 'Writing file...';
    case 'Glob':
      return 'Searching files...';
    case 'Grep':
      if (input?.pattern) return `Searching: ${input.pattern}`;
      return 'Searching code...';
    case 'WebSearch':
      return 'Searching the web...';
    case 'WebFetch':
      return 'Fetching URL...';
    case 'Agent':
      return 'Spawning sub-agent...';
    default:
      return `Using ${toolName}...`;
  }
}

/**
 * Extract result text from a stream result event.
 */
function extractResultText(event) {
  let text = '';

  if (typeof event.result === 'string') {
    text = event.result;
  }

  // Append AskUserQuestion options from permission_denials
  if (Array.isArray(event.permission_denials)) {
    for (const denial of event.permission_denials) {
      if (denial.tool_name === 'AskUserQuestion' && denial.tool_input?.questions) {
        text += formatQuestions(denial.tool_input.questions);
      }
    }
  }

  return text;
}

/**
 * Format AskUserQuestion options as readable text.
 */
function formatQuestions(questions) {
  let output = '';
  for (const q of questions) {
    output += `\n\n${q.question}`;
    if (Array.isArray(q.options)) {
      q.options.forEach((opt, i) => {
        output += `\n${i + 1}. ${opt.label}`;
        if (opt.description) output += ` — ${opt.description}`;
      });
    }
  }
  return output;
}

/**
 * Get current task count for status reporting.
 */
function getActiveTaskCount() {
  return activeTasks;
}

module.exports = { runClaude, getActiveTaskCount };
