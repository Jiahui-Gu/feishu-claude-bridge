const { Client, EventDispatcher, WSClient, LoggerLevel } = require('@larksuiteoapi/node-sdk');
const config = require('../../config');
const logger = require('../logger');

let client = null;
let eventDispatcher = null;
let wsClient = null;

/**
 * Initialize and return the Feishu SDK Client.
 */
function getClient() {
  if (!client) {
    client = new Client({
      appId: config.feishu.appId,
      appSecret: config.feishu.appSecret,
    });
    logger.info('Feishu Client initialized');
  }
  return client;
}

/**
 * Create and return the EventDispatcher.
 */
function getEventDispatcher() {
  if (!eventDispatcher) {
    eventDispatcher = new EventDispatcher({});
    logger.info('EventDispatcher initialized');
  }
  return eventDispatcher;
}

/**
 * Start WebSocket connection to Feishu.
 * @param {EventDispatcher} dispatcher - Configured event dispatcher
 */
function startWebSocket(dispatcher) {
  wsClient = new WSClient({
    appId: config.feishu.appId,
    appSecret: config.feishu.appSecret,
    loggerLevel: LoggerLevel.warn, // SDK only logs warnings and errors
  });

  // WSClient requires explicit .start() with the eventDispatcher
  wsClient.start({ eventDispatcher: dispatcher });
  logger.info('WebSocket client started, connecting to Feishu...');
  return wsClient;
}

module.exports = { getClient, getEventDispatcher, startWebSocket };
