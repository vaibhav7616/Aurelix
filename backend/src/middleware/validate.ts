import { NextFunction, Request, Response } from 'express';
import { ZodSchema } from 'zod';
import { Err } from '../utils/errors';

export const validateBody = (schema: ZodSchema) => (req: Request, _res: Response, next: NextFunction) => {
  const r = schema.safeParse(req.body);
  if (!r.success) return next(Err.validation('Invalid request body', r.error.flatten()));
  req.body = r.data;
  next();
};

export const validateQuery = (schema: ZodSchema) => (req: Request, _res: Response, next: NextFunction) => {
  const r = schema.safeParse(req.query);
  if (!r.success) return next(Err.validation('Invalid query', r.error.flatten()));
  (req as unknown as { validatedQuery: unknown }).validatedQuery = r.data;
  next();
};
