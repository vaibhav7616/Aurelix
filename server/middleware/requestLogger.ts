import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';
export function requestId(req: Request, res: Response, next: NextFunction) {
  const id = (req.headers['x-request-id'] as string) || randomUUID();
  (req as unknown as { id: string }).id = id;
  res.setHeader('X-Request-Id', id);
  next();
}
