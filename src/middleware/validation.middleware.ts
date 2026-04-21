import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { BadRequestError } from '../utils/errors';

export function validate(schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    const data = source === 'body' ? req.body : source === 'query' ? req.query : req.params;
    const result = schema.safeParse(data);

    if (!result.success) {
      const firstError = result.error.errors[0];
      throw new BadRequestError(`${firstError.path.join('.')}: ${firstError.message}`);
    }

    if (source === 'body') {
      req.body = result.data;
    }

    next();
  };
}
