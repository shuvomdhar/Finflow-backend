import { Router } from 'express';
import {
  expenseCreateSchema,
  expenseUpdateSchema,
  monthSchema,
} from '../schemas.js';
import {
  createExpense,
  deleteExpense,
  listExpenses,
  updateExpense,
} from '../services/finance.js';
import { asyncHandler, HttpError, parseId } from '../utils.js';

export const expensesRouter = Router();

expensesRouter.get(
  '/',
  asyncHandler(async (request, response) => {
    const userId = request.dbUser!.id;
    const query = request.query;

    let month: string | undefined;
    if (typeof query.month === 'string' && query.month.length > 0) {
      const parsed = monthSchema.safeParse(query.month);
      if (!parsed.success) {
        throw new HttpError(400, 'month must use the YYYY-MM format');
      }
      month = parsed.data;
    }

    const expenses = await listExpenses(userId, {
      month,
      category:
        typeof query.category === 'string' && query.category.length > 0
          ? query.category
          : undefined,
      search:
        typeof query.search === 'string' && query.search.length > 0
          ? query.search
          : undefined,
    });

    response.json({
      expenses,
      total: expenses.reduce((sum, expense) => sum + expense.amount, 0),
    });
  }),
);

expensesRouter.post(
  '/',
  asyncHandler(async (request, response) => {
    const parsed = expenseCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        error: 'Invalid expense',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const expense = await createExpense(request.dbUser!.id, parsed.data);
    response.status(201).json({ expense });
  }),
);

expensesRouter.patch(
  '/:id',
  asyncHandler(async (request, response) => {
    const id = parseId(String(request.params.id));
    const parsed = expenseUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        error: 'Invalid expense',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const expense = await updateExpense(request.dbUser!.id, id, parsed.data);
    response.json({ expense });
  }),
);

expensesRouter.delete(
  '/:id',
  asyncHandler(async (request, response) => {
    const id = parseId(String(request.params.id));
    await deleteExpense(request.dbUser!.id, id);
    response.json({ ok: true, id });
  }),
);
