import pino from 'pino';

function buildLogger(): pino.Logger {
  const base = {
    name: 'aurelix',
    level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
    redact: {
      paths: ['password', 'passwordHash', '*.password', 'token', 'refreshToken', 'authorization', 'req.headers.authorization'],
      censor: '[REDACTED]',
    },
  };
  if (process.env.NODE_ENV === 'production') return pino(base);
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require.resolve('pino-pretty');
    return pino({ ...base, transport: { target: 'pino-pretty', options: { colorize: true } } });
  } catch {
    return pino(base); // pino-pretty not installed (e.g. prod image) — plain JSON logs
  }
}

export const logger = buildLogger();
