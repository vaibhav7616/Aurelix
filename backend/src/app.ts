import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { requestId } from './middleware/requestLogger';
import { apiLimiter, authLimiter } from './middleware/rateLimit';
import { errorHandler } from './middleware/errorHandler';
import { checkDatabase } from './config/database';
import { checkRedis } from './config/redis';

import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import accountRoutes from './routes/accounts';
import assetRoutes from './routes/assets';
import marketRoutes from './routes/market';
import orderRoutes from './routes/orders';
import optionRoutes from './routes/options';
import positionRoutes from './routes/positions';
import tradeRoutes from './routes/trades';
import walletRoutes from './routes/wallet';
import paymentRoutes from './routes/payments';
import withdrawalRoutes from './routes/withdrawals';
import notificationRoutes from './routes/notifications';
import adminRoutes from './routes/admin';

export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(
    cors({
      origin: (origin, callback) => {
        // allow requests with no origin (e.g. mobile apps, curl, postman, same-origin)
        if (!origin || !env.isProd || env.CORS_ORIGINS.includes(origin) || env.CORS_ORIGINS.includes('*')) {
          return callback(null, true);
        }
        return callback(null, true);
      },
      credentials: true,
    })
  );
  app.use(compression());
  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());
  app.use(requestId);

  app.get('/health', (_req, res) => res.json({ success: true, data: { status: 'ok', service: 'aurelix-backend', time: new Date().toISOString() }, error: null }));
  app.get('/ready', async (_req, res) => {
    const [db, redis] = await Promise.all([checkDatabase(), checkRedis()]);
    const ok = db && redis;
    res.status(ok ? 200 : 503).json({ success: ok, data: { backend: true, postgres: db, redis }, error: ok ? null : { code: 'NOT_READY', message: 'Dependency check failed' } });
  });

  app.use('/api/v1/auth', authLimiter, authRoutes);
  app.use('/api/v1/users', apiLimiter, userRoutes);
  app.use('/api/v1/accounts', apiLimiter, accountRoutes);
  app.use('/api/v1/assets', apiLimiter, assetRoutes);
  app.use('/api/v1/market', apiLimiter, marketRoutes);
  app.use('/api/v1/options', apiLimiter, optionRoutes);
  app.use('/api/v1/orders', apiLimiter, orderRoutes);
  app.use('/api/v1/positions', apiLimiter, positionRoutes);
  app.use('/api/v1/trades', apiLimiter, tradeRoutes);
  app.use('/api/v1/wallet', apiLimiter, walletRoutes);
  app.use('/api/v1/payments', apiLimiter, paymentRoutes);
  app.use('/api/v1/withdrawals', apiLimiter, withdrawalRoutes);
  app.use('/api/v1/notifications', apiLimiter, notificationRoutes);
  app.use('/api/v1/admin', apiLimiter, adminRoutes);

  app.use('/api', (_req, res) => res.status(404).json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Route not found' } }));
  app.use(errorHandler);
  return app;
}
