import http from 'http';
import { createApp } from './app';
import { env } from './config/env';
import { logger } from './utils/logger';
import { initSocket } from './websocket/socketServer';
import { startMarket, stopMarket } from './services/marketService';
import { startSettlementLoop, stopSettlementLoop } from './trading/optionsEngine';

async function main(): Promise<void> {
  const app = createApp();
  const server = http.createServer(app);
  initSocket(server);
  try {
    await startMarket();
    logger.info('demo market engine started');
    startSettlementLoop();
    logger.info('option settlement loop started');
  } catch (e) {
    logger.warn({ e }, 'market engine failed to start (non-fatal)');
  }
  server.listen(env.API_PORT, '0.0.0.0', () => {
    logger.info({ port: env.API_PORT, env: env.NODE_ENV }, 'aurelix backend listening');
  });

  const shutdown = async () => {
    logger.info('shutting down...');
    stopSettlementLoop();
    await stopMarket().catch(() => undefined);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}

void main();
