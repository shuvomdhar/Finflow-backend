import { Router } from 'express';
import {
  incomeCreateSchema,
  incomeUpdateSchema,
  monthSchema,
} from '../schemas.js';
import {
  createIncome,
  deleteIncome,
  listIncomes,
  updateIncome,
} from '../services/finance.js';
import { asyncHandler, HttpError, parseId } from '../utils.js';

export const incomesRouter = Router();

incomesRouter.get(
  '/',
  asyncHandler(async (request, response) => {
    const userId = request.dbUser!.id;
    const monthParam = request.query.month;

    let month: string | undefined;
    if (typeof monthParam === 'string' && monthParam.length > 0) {
      const parsed = monthSchema.safeParse(monthParam);
      if (!parsed.success) {
        throw new HttpError(400, 'month must use the YYYY-MM format');
      }
      month = parsed.data;
    }

    const incomes = await listIncomes(userId, { month });
    response.json({
      incomes,
      total: incomes.reduce((sum, income) => sum + income.amount, 0),
    });
  }),
);

incomesRouter.post(
  '/',
  asyncHandler(async (request, response) => {
    const parsed = incomeCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        error: 'Invalid income',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const income = await createIncome(request.dbUser!.id, parsed.data);
    response.status(201).json({ income });
  }),
);

incomesRouter.patch(
  '/:id',
  asyncHandler(async (request, response) => {
    const id = parseId(String(request.params.id));
    const parsed = incomeUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        error: 'Invalid income',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const income = await updateIncome(request.dbUser!.id, id, parsed.data);
    response.json({ income });
  }),
);

incomesRouter.delete(
  '/:id',
  asyncHandler(async (request, response) => {
    const id = parseId(String(request.params.id));
    await deleteIncome(request.dbUser!.id, id);
    response.json({ ok: true, id });
  }),
);
