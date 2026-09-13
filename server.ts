import http from 'http';
import path from 'path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createApp } from './server/app';
import { env } from './server/config/env';
import { logger } from './server/utils/logger';
import { initSocket } from './server/websocket/socketServer';
import { startMarket, stopMarket } from './server/services/marketService';
import { startSettlementLoop, stopSettlementLoop } from './server/trading/optionsEngine';

async function startServer() {
  const app = createApp();
  const server = http.createServer(app);

  // Initialize WebSockets on HTTP server
  initSocket(server);

  try {
    await startMarket();
    logger.info('Demo market simulation engine started');
    startSettlementLoop();
    logger.info('Option settlement loop started');
  } catch (e) {
    logger.warn({ err: e }, 'Market engine warning');
  }

  // Vite middleware for development vs static build for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  server.listen(PORT, '0.0.0.0', () => {
    logger.info(`Aurelix server listening on http://0.0.0.0:${PORT}`);
  });

  const shutdown = async () => {
    logger.info('Shutting down server...');
    stopSettlementLoop();
    await stopMarket().catch(() => undefined);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };

  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}

void startServer();
