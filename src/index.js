const { getClient, getEventDispatcher, startWebSocket } = require('./feishu/client');
const { registerHandlers } = require('./feishu/handler');
const logger = require('./logger');
const config = require('../config');

async function main() {
  logger.info('=== Feishu Claude Code Bridge ===');
  logger.info(`Claude work directory: ${config.claude.workDir}`);
  logger.info(`Max concurrent tasks: ${config.claude.maxConcurrent}`);
  logger.info(`Timeout: ${config.claude.timeout / 1000}s`);

  // Initialize Feishu client
  const client = getClient();

  // Set up event dispatcher with handlers
  const dispatcher = getEventDispatcher();
  registerHandlers(dispatcher, client);

  // Start WebSocket connection
  startWebSocket(dispatcher);

  logger.info('Bridge is running. Waiting for messages from Feishu...');
  logger.info('Press Ctrl+C to stop.');
}

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Shutting down...');
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection:', reason);
});

main().catch((err) => {
  logger.error('Fatal error:', err);
  process.exit(1);
});
