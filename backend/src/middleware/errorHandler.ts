import { NextFunction, Request, Response } from 'express';
import { toEnvelopeError } from '../utils/errors';
import { logger } from '../utils/logger';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const maybe = err as { type?: string; status?: number };
  if (maybe?.type === 'entity.parse.failed' || (err instanceof SyntaxError && maybe?.status === 400)) {
    res.status(400).json({ success: false, data: null, error: { code: 'INVALID_JSON', message: 'Malformed JSON body' } });
    return;
  }
  const e = toEnvelopeError(err);
  if (e.status >= 500) logger.error({ err, requestId: (req as unknown as { id?: string }).id, route: req.path }, 'unhandled error');
  res.status(e.status).json({ success: false, data: null, error: { code: e.code, message: e.message, details: e.details ?? null } });
}
