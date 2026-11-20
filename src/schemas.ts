import { z } from 'zod';

export const INCOME_CATEGORIES = [
  'salary',
  'freelance',
  'business',
  'investment',
  'gift',
  'other',
] as const;

export const EXPENSE_CATEGORIES = [
  'food',
  'housing',
  'transport',
  'shopping',
  'health',
  'entertainment',
  'education',
  'bills',
  'travel',
  'other',
] as const;

export const PAYMENT_METHODS = [
  'card',
  'cash',
  'bank',
  'mobile',
  'other',
] as const;

export const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM');

export const dateSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'Use YYYY-MM-DD');

export const amountSchema = z.coerce
  .number()
  .positive('Amount must be greater than zero')
  .max(999_999_999, 'Amount is too large');

const optionalNote = z
  .string()
  .trim()
  .max(500)
  .optional()
  .nullable()
  .transform((value) => (value ? value : null));

export const incomeCreateSchema = z.object({
  month: monthSchema,
  source: z.string().trim().min(1, 'Source is required').max(120),
  category: z.enum(INCOME_CATEGORIES).default('salary'),
  amount: amountSchema,
  note: optionalNote,
});

export const incomeUpdateSchema = incomeCreateSchema.partial();

export const expenseCreateSchema = z.object({
  spentOn: dateSchema,
  title: z.string().trim().min(1, 'Title is required').max(160),
  category: z.enum(EXPENSE_CATEGORIES).default('other'),
  amount: amountSchema,
  paymentMethod: z.enum(PAYMENT_METHODS).default('card'),
  note: optionalNote,
});

export const expenseUpdateSchema = expenseCreateSchema.partial();

/** Lifecycle statuses a client may report for itself. */
export const accountStatusUpdateSchema = z.object({
  status: z.enum(['active', 'inactive', 'failed']),
});
