import { Router } from 'express';
import { z } from 'zod';
import { monthSchema } from '../schemas.js';
import { streamReportPdf } from '../pdf.js';
import { asyncHandler, HttpError } from '../utils.js';

export const exportRouter = Router();

const yearSchema = z.coerce
  .number()
  .int()
  .min(2000)
  .max(2100);

exportRouter.get(
  '/pdf',
  asyncHandler(async (request, response) => {
    const yearResult = yearSchema.safeParse(
      request.query.year ?? new Date().getUTCFullYear(),
    );
    if (!yearResult.success) {
      throw new HttpError(400, 'Invalid year');
    }

    let month: string | undefined;
    if (typeof request.query.month === 'string' && request.query.month.length) {
      const monthResult = monthSchema.safeParse(request.query.month);
      if (!monthResult.success) {
        throw new HttpError(400, 'month must use the YYYY-MM format');
      }
      month = monthResult.data;
    }

    const currencyResult = z
      .string()
      .regex(/^[A-Za-z]{3}$/)
      .safeParse(request.query.currency ?? 'USD');
    if (!currencyResult.success) {
      throw new HttpError(400, 'currency must be a 3-letter ISO code');
    }

    await streamReportPdf(
      response,
      request.dbUser!,
      yearResult.data,
      month,
      currencyResult.data,
    );
  }),
);
