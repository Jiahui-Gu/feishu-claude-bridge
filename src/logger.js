const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = LEVELS[process.env.LOG_LEVEL || 'info'] ?? LEVELS.info;

function timestamp() {
  return new Date().toISOString();
}

function format(level, ...args) {
  return [`[${timestamp()}] [${level.toUpperCase()}]`, ...args];
}

const logger = {
  debug(...args) {
    if (currentLevel <= LEVELS.debug) console.log(...format('debug', ...args));
  },
  info(...args) {
    if (currentLevel <= LEVELS.info) console.log(...format('info', ...args));
  },
  warn(...args) {
    if (currentLevel <= LEVELS.warn) console.warn(...format('warn', ...args));
  },
  error(...args) {
    if (currentLevel <= LEVELS.error) console.error(...format('error', ...args));
  },
};

module.exports = logger;
