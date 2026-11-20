import { sql } from '../db.js';
import type { CategoryTotal, Expense, Income } from '../types.js';
import { currentMonth, HttpError, roundMoney } from '../utils.js';

type IncomeRow = {
  id: number;
  month: string;
  source: string;
  category: string;
  amount: number;
  note: string | null;
};

type ExpenseRow = {
  id: number;
  spent_on: string;
  title: string;
  category: string;
  amount: number;
  payment_method: string;
  note: string | null;
};

type TotalRow = {
  total: number;
  count: number;
};

const INCOME_COLUMNS = `
  id,
  to_char(month, 'YYYY-MM') AS month,
  source,
  category,
  amount::float8 AS amount,
  note
`;

const EXPENSE_COLUMNS = `
  id,
  to_char(spent_on, 'YYYY-MM-DD') AS spent_on,
  title,
  category,
  amount::float8 AS amount,
  payment_method,
  note
`;

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function mapIncome(row: IncomeRow): Income {
  return {
    id: Number(row.id),
    month: row.month,
    source: row.source,
    category: row.category,
    amount: roundMoney(Number(row.amount)),
    note: row.note,
  };
}

function mapExpense(row: ExpenseRow): Expense {
  return {
    id: Number(row.id),
    spentOn: row.spent_on,
    title: row.title,
    category: row.category,
    amount: roundMoney(Number(row.amount)),
    paymentMethod: row.payment_method,
    note: row.note,
  };
}

export async function listIncomes(
  userId: number,
  options: { month?: string; year?: number; limit?: number } = {},
): Promise<Income[]> {
  const conditions = ['user_id = $1'];
  const params: unknown[] = [userId];

  if (options.month) {
    params.push(options.month);
    conditions.push(`to_char(month, 'YYYY-MM') = $${params.length}`);
  }

  if (options.year) {
    params.push(options.year);
    conditions.push(`EXTRACT(YEAR FROM month) = $${params.length}`);
  }

  const limit = options.limit ? ` LIMIT ${Math.min(options.limit, 500)}` : '';

  const rows = (await sql.query(
    `SELECT ${INCOME_COLUMNS}
     FROM incomes
     WHERE ${conditions.join(' AND ')}
     ORDER BY month DESC, id DESC${limit}`,
    params,
  )) as IncomeRow[];

  return rows.map(mapIncome);
}

export async function createIncome(
  userId: number,
  input: {
    month: string;
    source: string;
    category: string;
    amount: number;
    note: string | null;
  },
): Promise<Income> {
  const rows = (await sql.query(
    `INSERT INTO incomes (user_id, month, source, category, amount, note)
     VALUES ($1, ($2 || '-01')::date, $3, $4, $5, $6)
     RETURNING ${INCOME_COLUMNS}`,
    [userId, input.month, input.source, input.category, input.amount, input.note],
  )) as IncomeRow[];

  return mapIncome(rows[0]);
}

export async function updateIncome(
  userId: number,
  id: number,
  changes: Partial<{
    month: string;
    source: string;
    category: string;
    amount: number;
    note: string | null;
  }>,
): Promise<Income> {
  const existingRows = (await sql.query(
    `SELECT ${INCOME_COLUMNS} FROM incomes WHERE id = $1 AND user_id = $2`,
    [id, userId],
  )) as IncomeRow[];

  if (!existingRows[0]) {
    throw new HttpError(404, 'Income not found');
  }

  const existing = mapIncome(existingRows[0]);
  const merged = { ...existing, ...changes };

  const rows = (await sql.query(
    `UPDATE incomes
     SET month = ($3 || '-01')::date,
         source = $4,
         category = $5,
         amount = $6,
         note = $7,
         updated_at = now()
     WHERE id = $1 AND user_id = $2
     RETURNING ${INCOME_COLUMNS}`,
    [
      id,
      userId,
      merged.month,
      merged.source,
      merged.category,
      merged.amount,
      merged.note,
    ],
  )) as IncomeRow[];

  return mapIncome(rows[0]);
}

export async function deleteIncome(userId: number, id: number): Promise<void> {
  const rows = (await sql.query(
    'DELETE FROM incomes WHERE id = $1 AND user_id = $2 RETURNING id',
    [id, userId],
  )) as { id: number }[];

  if (!rows[0]) {
    throw new HttpError(404, 'Income not found');
  }
}

export async function listExpenses(
  userId: number,
  options: {
    month?: string;
    year?: number;
    category?: string;
    search?: string;
    limit?: number;
  } = {},
): Promise<Expense[]> {
  const conditions = ['user_id = $1'];
  const params: unknown[] = [userId];

  if (options.month) {
    params.push(options.month);
    conditions.push(`to_char(spent_on, 'YYYY-MM') = $${params.length}`);
  }

  if (options.year) {
    params.push(options.year);
    conditions.push(`EXTRACT(YEAR FROM spent_on) = $${params.length}`);
  }

  if (options.category) {
    params.push(options.category);
    conditions.push(`category = $${params.length}`);
  }

  if (options.search) {
    params.push(`%${options.search}%`);
    conditions.push(`(title ILIKE $${params.length} OR note ILIKE $${params.length})`);
  }

  const limit = options.limit ? ` LIMIT ${Math.min(options.limit, 500)}` : '';

  const rows = (await sql.query(
    `SELECT ${EXPENSE_COLUMNS}
     FROM expenses
     WHERE ${conditions.join(' AND ')}
     ORDER BY spent_on DESC, id DESC${limit}`,
    params,
  )) as ExpenseRow[];

  return rows.map(mapExpense);
}

export async function createExpense(
  userId: number,
  input: {
    spentOn: string;
    title: string;
    category: string;
    amount: number;
    paymentMethod: string;
    note: string | null;
  },
): Promise<Expense> {
  const rows = (await sql.query(
    `INSERT INTO expenses (user_id, spent_on, title, category, amount, payment_method, note)
     VALUES ($1, $2::date, $3, $4, $5, $6, $7)
     RETURNING ${EXPENSE_COLUMNS}`,
    [
      userId,
      input.spentOn,
      input.title,
      input.category,
      input.amount,
      input.paymentMethod,
      input.note,
    ],
  )) as ExpenseRow[];

  return mapExpense(rows[0]);
}

export async function updateExpense(
  userId: number,
  id: number,
  changes: Partial<{
    spentOn: string;
    title: string;
    category: string;
    amount: number;
    paymentMethod: string;
    note: string | null;
  }>,
): Promise<Expense> {
  const existingRows = (await sql.query(
    `SELECT ${EXPENSE_COLUMNS} FROM expenses WHERE id = $1 AND user_id = $2`,
    [id, userId],
  )) as ExpenseRow[];

  if (!existingRows[0]) {
    throw new HttpError(404, 'Expense not found');
  }

  const existing = mapExpense(existingRows[0]);
  const merged = { ...existing, ...changes };

  const rows = (await sql.query(
    `UPDATE expenses
     SET spent_on = $3::date,
         title = $4,
         category = $5,
         amount = $6,
         payment_method = $7,
         note = $8,
         updated_at = now()
     WHERE id = $1 AND user_id = $2
     RETURNING ${EXPENSE_COLUMNS}`,
    [
      id,
      userId,
      merged.spentOn,
      merged.title,
      merged.category,
      merged.amount,
      merged.paymentMethod,
      merged.note,
    ],
  )) as ExpenseRow[];

  return mapExpense(rows[0]);
}

export async function deleteExpense(userId: number, id: number): Promise<void> {
  const rows = (await sql.query(
    'DELETE FROM expenses WHERE id = $1 AND user_id = $2 RETURNING id',
    [id, userId],
  )) as { id: number }[];

  if (!rows[0]) {
    throw new HttpError(404, 'Expense not found');
  }
}

async function getTotal(
  userId: number,
  table: 'incomes' | 'expenses',
  clause: string,
  params: unknown[],
): Promise<TotalRow> {
  const rows = (await sql.query(
    `SELECT COALESCE(SUM(amount), 0)::float8 AS total, COUNT(*)::int AS count
     FROM ${table}
     WHERE user_id = $1 AND ${clause}`,
    [userId, ...params],
  )) as TotalRow[];

  return {
    total: roundMoney(Number(rows[0]?.total ?? 0)),
    count: Number(rows[0]?.count ?? 0),
  };
}

export async function getMonthTotals(userId: number, month: string) {
  const [income, expense] = await Promise.all([
    getTotal(userId, 'incomes', `to_char(month, 'YYYY-MM') = $2`, [month]),
    getTotal(userId, 'expenses', `to_char(spent_on, 'YYYY-MM') = $2`, [month]),
  ]);

  const balance = roundMoney(income.total - expense.total);
  const savingsRate =
    income.total > 0
      ? Math.round(((income.total - expense.total) / income.total) * 1000) / 10
      : 0;

  return {
    month,
    income: income.total,
    expense: expense.total,
    balance,
    savingsRate,
    incomeCount: income.count,
    expenseCount: expense.count,
  };
}

export async function getYearSeries(userId: number, year: number) {
  const [incomeRows, expenseRows] = await Promise.all([
    sql.query(
      `SELECT EXTRACT(MONTH FROM month)::int AS month, COALESCE(SUM(amount), 0)::float8 AS total
       FROM incomes
       WHERE user_id = $1 AND EXTRACT(YEAR FROM month) = $2
       GROUP BY 1`,
      [userId, year],
    ) as unknown as Promise<{ month: number; total: number }[]>,
    sql.query(
      `SELECT EXTRACT(MONTH FROM spent_on)::int AS month, COALESCE(SUM(amount), 0)::float8 AS total
       FROM expenses
       WHERE user_id = $1 AND EXTRACT(YEAR FROM spent_on) = $2
       GROUP BY 1`,
      [userId, year],
    ) as unknown as Promise<{ month: number; total: number }[]>,
  ]);

  const incomeByMonth = new Map(
    incomeRows.map((row) => [Number(row.month), Number(row.total)]),
  );
  const expenseByMonth = new Map(
    expenseRows.map((row) => [Number(row.month), Number(row.total)]),
  );

  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const income = roundMoney(incomeByMonth.get(month) ?? 0);
    const expense = roundMoney(expenseByMonth.get(month) ?? 0);
    return {
      month,
      label: MONTH_LABELS[index],
      income,
      expense,
      balance: roundMoney(income - expense),
    };
  });
}

export async function getCategoryTotals(
  userId: number,
  options: { year: number; month?: string },
): Promise<CategoryTotal[]> {
  const conditions = [
    'user_id = $1',
    `EXTRACT(YEAR FROM spent_on) = $2`,
  ];
  const params: unknown[] = [userId, options.year];

  if (options.month) {
    params.push(options.month);
    conditions.push(`to_char(spent_on, 'YYYY-MM') = $${params.length}`);
  }

  const rows = (await sql.query(
    `SELECT category, COALESCE(SUM(amount), 0)::float8 AS total
     FROM expenses
     WHERE ${conditions.join(' AND ')}
     GROUP BY category
     ORDER BY total DESC`,
    params,
  )) as { category: string; total: number }[];

  return rows.map((row) => ({
    category: row.category,
    total: roundMoney(Number(row.total)),
  }));
}

async function getIncomeCategoryTotals(
  userId: number,
  options: { year: number; month?: string },
): Promise<CategoryTotal[]> {
  const conditions = ['user_id = $1', `EXTRACT(YEAR FROM month) = $2`];
  const params: unknown[] = [userId, options.year];

  if (options.month) {
    params.push(options.month);
    conditions.push(`to_char(month, 'YYYY-MM') = $${params.length}`);
  }

  const rows = (await sql.query(
    `SELECT category, COALESCE(SUM(amount), 0)::float8 AS total
     FROM incomes
     WHERE ${conditions.join(' AND ')}
     GROUP BY category
     ORDER BY total DESC`,
    params,
  )) as { category: string; total: number }[];

  return rows.map((row) => ({
    category: row.category,
    total: roundMoney(Number(row.total)),
  }));
}

async function getDaySeries(userId: number, month: string) {
  const rows = (await sql.query(
    `SELECT EXTRACT(DAY FROM spent_on)::int AS day, COALESCE(SUM(amount), 0)::float8 AS total
     FROM expenses
     WHERE user_id = $1 AND to_char(spent_on, 'YYYY-MM') = $2
     GROUP BY 1
     ORDER BY 1`,
    [userId, month],
  )) as { day: number; total: number }[];

  const totals = new Map(rows.map((row) => [Number(row.day), Number(row.total)]));
  const [year, monthNumber] = month.split('-').map(Number);
  const daysInMonth = new Date(year, monthNumber, 0).getDate();

  return Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    return {
      day,
      label: String(day),
      total: roundMoney(totals.get(day) ?? 0),
    };
  });
}

type ExpenseInsights = {
  largestExpense: { title: string; amount: number; date: string } | null;
  topMerchant: { title: string; count: number; total: number } | null;
  activeDays: number;
  weekendAverage: number;
  weekdayAverage: number;
  averagePerActiveDay: number;
};

async function getExpenseInsights(
  userId: number,
  options: { year: number; month?: string },
): Promise<ExpenseInsights> {
  const conditions = ['user_id = $1', 'EXTRACT(YEAR FROM spent_on) = $2'];
  const params: unknown[] = [userId, options.year];

  if (options.month) {
    params.push(options.month);
    conditions.push(`to_char(spent_on, 'YYYY-MM') = $${params.length}`);
  }

  const where = conditions.join(' AND ');

  const [largestRows, merchantRows, aggregateRows] = (await Promise.all([
    sql.query(
      `SELECT title, amount::float8 AS amount, to_char(spent_on, 'YYYY-MM-DD') AS date
       FROM expenses
       WHERE ${where}
       ORDER BY amount DESC, spent_on ASC
       LIMIT 1`,
      params,
    ),
    sql.query(
      `SELECT title, COUNT(*)::int AS count, COALESCE(SUM(amount), 0)::float8 AS total
       FROM expenses
       WHERE ${where}
       GROUP BY title
       ORDER BY count DESC, total DESC
       LIMIT 1`,
      params,
    ),
    sql.query(
      `SELECT
         COUNT(DISTINCT spent_on)::int AS active_days,
         COUNT(DISTINCT CASE WHEN EXTRACT(ISODOW FROM spent_on) IN (6, 7) THEN spent_on END)::int AS weekend_days,
         COALESCE(SUM(amount), 0)::float8 AS total,
         COALESCE(SUM(CASE WHEN EXTRACT(ISODOW FROM spent_on) IN (6, 7) THEN amount ELSE 0 END), 0)::float8 AS weekend_total
       FROM expenses
       WHERE ${where}`,
      params,
    ),
  ])) as [
    { title: string; amount: number; date: string }[],
    { title: string; count: number; total: number }[],
    {
      active_days: number;
      weekend_days: number;
      total: number;
      weekend_total: number;
    }[],
  ];

  const aggregate = aggregateRows[0];
  const activeDays = Number(aggregate?.active_days ?? 0);
  const weekendDays = Number(aggregate?.weekend_days ?? 0);
  const total = Number(aggregate?.total ?? 0);
  const weekendTotal = Number(aggregate?.weekend_total ?? 0);
  const weekdayDays = Math.max(activeDays - weekendDays, 0);
  const weekdayTotal = Math.max(total - weekendTotal, 0);

  return {
    largestExpense: largestRows[0]
      ? {
          title: largestRows[0].title,
          amount: roundMoney(Number(largestRows[0].amount)),
          date: largestRows[0].date,
        }
      : null,
    topMerchant: merchantRows[0]
      ? {
          title: merchantRows[0].title,
          count: Number(merchantRows[0].count),
          total: roundMoney(Number(merchantRows[0].total)),
        }
      : null,
    activeDays,
    weekendAverage:
      weekendDays > 0 ? roundMoney(weekendTotal / weekendDays) : 0,
    weekdayAverage:
      weekdayDays > 0 ? roundMoney(weekdayTotal / weekdayDays) : 0,
    averagePerActiveDay: activeDays > 0 ? roundMoney(total / activeDays) : 0,
  };
}

export async function getOverview(userId: number, month: string) {
  const year = Number(month.slice(0, 4));
  const [totals, series, expenseCategories, incomeCategories, recentExpenses, recentIncomes] =
    await Promise.all([
      getMonthTotals(userId, month),
      getYearSeries(userId, year),
      getCategoryTotals(userId, { year, month }),
      getIncomeCategoryTotals(userId, { year, month }),
      listExpenses(userId, { month, limit: 6 }),
      listIncomes(userId, { month, limit: 6 }),
    ]);

  return {
    ...totals,
    year,
    series,
    expenseCategories,
    incomeCategories,
    recentExpenses,
    recentIncomes,
  };
}

export async function getReport(userId: number, year: number, month?: string) {
  const selectedMonth = month ?? null;
  if (selectedMonth && Number(selectedMonth.slice(0, 4)) !== year) {
    throw new HttpError(400, 'month must belong to the selected year');
  }

  const [monthTotals, yearTotals, series, categories, incomeCategories, insights] =
    await Promise.all([
      selectedMonth
        ? getMonthTotals(userId, selectedMonth)
        : Promise.resolve(null),
      (async () => {
        const [income, expense] = await Promise.all([
          getTotal(userId, 'incomes', 'EXTRACT(YEAR FROM month) = $2', [year]),
          getTotal(userId, 'expenses', 'EXTRACT(YEAR FROM spent_on) = $2', [
            year,
          ]),
        ]);
        return {
          income: income.total,
          expense: expense.total,
          balance: roundMoney(income.total - expense.total),
          incomeCount: income.count,
          expenseCount: expense.count,
        };
      })(),
      getYearSeries(userId, year),
      getCategoryTotals(userId, {
        year,
        ...(selectedMonth ? { month: selectedMonth } : {}),
      }),
      getIncomeCategoryTotals(userId, {
        year,
        ...(selectedMonth ? { month: selectedMonth } : {}),
      }),
      getExpenseInsights(userId, {
        year,
        ...(selectedMonth ? { month: selectedMonth } : {}),
      }),
    ]);

  const days = selectedMonth ? await getDaySeries(userId, selectedMonth) : [];

  return {
    year,
    month: selectedMonth,
    totals: monthTotals
      ? {
          income: monthTotals.income,
          expense: monthTotals.expense,
          balance: monthTotals.balance,
          savingsRate: monthTotals.savingsRate,
        }
      : {
          income: yearTotals.income,
          expense: yearTotals.expense,
          balance: yearTotals.balance,
          savingsRate:
            yearTotals.income > 0
              ? Math.round(
                  ((yearTotals.income - yearTotals.expense) / yearTotals.income) *
                    1000,
                ) / 10
              : 0,
        },
    yearTotals,
    months: series,
    days,
    categories,
    incomeCategories,
    insights,
  };
}

export { currentMonth };
