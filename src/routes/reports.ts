import { Router } from 'express';
import { z } from 'zod';
import { monthSchema } from '../schemas.js';
import { getOverview, getReport } from '../services/finance.js';
import { asyncHandler, currentMonth, HttpError } from '../utils.js';

export const reportsRouter = Router();

const yearSchema = z.coerce
  .number()
  .int()
  .min(2000, 'Year must be 2000 or later')
  .max(2100, 'Year must be 2100 or earlier');

function readYear(value: unknown): number {
  const parsed = yearSchema.safeParse(value ?? new Date().getUTCFullYear());
  if (!parsed.success) {
    throw new HttpError(400, 'Invalid year');
  }
  return parsed.data;
}

function readMonth(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  const parsed = monthSchema.safeParse(value);
  if (!parsed.success) {
    throw new HttpError(400, 'month must use the YYYY-MM format');
  }
  return parsed.data;
}

reportsRouter.get(
  '/overview',
  asyncHandler(async (request, response) => {
    const month = readMonth(request.query.month) ?? currentMonth();
    const overview = await getOverview(request.dbUser!.id, month);
    response.json(overview);
  }),
);

reportsRouter.get(
  '/reports',
  asyncHandler(async (request, response) => {
    const year = readYear(request.query.year);
    const month = readMonth(request.query.month);
    const report = await getReport(request.dbUser!.id, year, month);
    response.json(report);
  }),
);
