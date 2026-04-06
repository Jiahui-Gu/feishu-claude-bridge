require('dotenv').config();

const config = {
  feishu: {
    appId: process.env.FEISHU_APP_ID,
    appSecret: process.env.FEISHU_APP_SECRET,
  },
  claude: {
    // Working directory for Claude Code (determines project context)
    workDir: process.env.CLAUDE_WORK_DIR || process.cwd(),
    // Maximum concurrent Claude tasks
    maxConcurrent: parseInt(process.env.CLAUDE_MAX_CONCURRENT || '3', 10),
    // Timeout in milliseconds (default 10 minutes)
    timeout: parseInt(process.env.CLAUDE_TIMEOUT || '600000', 10),
    // Max turns per invocation
    maxTurns: parseInt(process.env.CLAUDE_MAX_TURNS || '25', 10),
  },
  // Path to persist session data
  sessionsFile: process.env.SESSIONS_FILE || './data/sessions.json',
};

// Validate required config
if (!config.feishu.appId || !config.feishu.appSecret) {
  console.error('ERROR: FEISHU_APP_ID and FEISHU_APP_SECRET must be set in .env');
  process.exit(1);
}

module.exports = config;
