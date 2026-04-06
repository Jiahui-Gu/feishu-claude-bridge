const { spawn } = require('child_process');
const config = require('../../config');
const logger = require('../logger');

// Track active tasks for concurrency control
let activeTasks = 0;

/**
 * Run Claude Code CLI with the given prompt and session.
 * @param {string} prompt - User's message text
 * @param {string|null} sessionId - Session ID to resume, or null for a new session
 * @returns {Promise<{success: boolean, result?: string, error?: string, duration?: number, sessionId?: string}>}
 */
async function runClaude(prompt, sessionId) {
  if (activeTasks >= config.claude.maxConcurrent) {
    return {
      success: false,
      error: `系统繁忙，当前有 ${activeTasks} 个任务正在执行（最大 ${config.claude.maxConcurrent}）。请稍后再试。`,
    };
  }

  activeTasks++;
  const startTime = Date.now();

  try {
    const { text, returnedSessionId } = await spawnClaude(prompt, sessionId);
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
 * Spawn claude -p as a child process and collect output.
 */
function spawnClaude(prompt, sessionId) {
  return new Promise((resolve, reject) => {
    const args = [
      '-p', prompt,
      '--output-format', 'json',
      '--max-turns', String(config.claude.maxTurns),
      '--dangerously-skip-permissions',
    ];

    // If we have an existing session, resume it; otherwise let Claude create a new one
    if (sessionId) {
      args.push('--resume', sessionId);
      logger.info(`Spawning: claude -p ... --resume ${sessionId}`);
    } else {
      logger.info('Spawning: claude -p ... (new session)');
    }

    // Build environment: inherit current env but remove CLAUDECODE and set skip auth
    const env = { ...process.env };
    delete env.CLAUDECODE;
    env.CLAUDE_CODE_SKIP_AUTH_LOGIN = 'true';

    const child = spawn('claude', args, {
      cwd: config.claude.workDir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Timeout protection
    const timer = setTimeout(() => {
      logger.warn(`Claude process timed out after ${config.claude.timeout}ms, killing...`);
      child.kill('SIGTERM');
      // Force kill after 5 seconds if still alive
      setTimeout(() => {
        if (!child.killed) child.kill('SIGKILL');
      }, 5000);
      reject(new Error(`Claude 执行超时（${Math.round(config.claude.timeout / 60000)} 分钟），任务已终止。`));
    }, config.claude.timeout);

    child.on('close', (code) => {
      clearTimeout(timer);
      logger.debug(`Claude process exited with code ${code}`);

      if (code !== 0 && !stdout) {
        const errorMsg = stderr.trim() || `Claude 进程异常退出（退出码: ${code}）`;
        reject(new Error(errorMsg));
        return;
      }

      // Parse JSON output
      try {
        const { text, sessionId: returnedSessionId } = parseClaudeOutput(stdout);
        resolve({ text, returnedSessionId });
      } catch (parseErr) {
        // If JSON parsing fails, return raw stdout as fallback
        logger.warn('Failed to parse Claude JSON output, using raw output');
        resolve({ text: stdout.trim() || stderr.trim() || '(empty response)', returnedSessionId: null });
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`无法启动 Claude CLI: ${err.message}`));
    });
  });
}

/**
 * Parse Claude Code JSON output and extract the text result and session ID.
 */
function parseClaudeOutput(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return { text: '(empty response)', sessionId: null };

  const parsed = JSON.parse(trimmed);

  // Extract session_id from the response
  const sessionId = parsed.session_id || null;

  // The JSON output format has a "result" field containing the final text
  let text;
  if (typeof parsed.result === 'string') {
    text = parsed.result;
  } else if (typeof parsed === 'string') {
    text = parsed;
  } else {
    text = JSON.stringify(parsed, null, 2);
  }

  return { text, sessionId };
}

/**
 * Get current task count for status reporting.
 */
function getActiveTaskCount() {
  return activeTasks;
}

module.exports = { runClaude, getActiveTaskCount };
