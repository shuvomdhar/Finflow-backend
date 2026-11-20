import { Router } from 'express';
import { sql } from '../db.js';
import { accountStatusUpdateSchema } from '../schemas.js';
import { setUserStatus } from '../services/users.js';
import { asyncHandler, HttpError } from '../utils.js';

export const meRouter = Router();

meRouter.get(
  '/',
  asyncHandler(async (request, response) => {
    const user = request.dbUser!;
    const rows = (await sql.query(
      `SELECT
         (SELECT COUNT(*)::int FROM incomes WHERE user_id = $1) AS income_count,
         (SELECT COUNT(*)::int FROM expenses WHERE user_id = $1) AS expense_count`,
      [user.id],
    )) as { income_count: number; expense_count: number }[];

    response.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        status: user.status,
        statusUpdatedAt: user.statusUpdatedAt,
      },
      stats: {
        incomeCount: Number(rows[0]?.income_count ?? 0),
        expenseCount: Number(rows[0]?.expense_count ?? 0),
      },
    });
  }),
);

/**
 * Records the account lifecycle status.
 *
 * - active: the user signed in (or signed up) successfully
 * - inactive: the user signed out
 * - failed: an unexpected error hit this account
 *
 * `archive` is intentionally not accepted here; deleting an account goes
 * through DELETE /api/me so the financial records are purged too.
 */
meRouter.patch(
  '/status',
  asyncHandler(async (request, response) => {
    const user = request.dbUser!;

    if (user.status === 'archive') {
      throw new HttpError(
        409,
        'This account has been deleted and cannot change status.',
        'ACCOUNT_ARCHIVED',
      );
    }

    const parsed = accountStatusUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new HttpError(400, 'status must be active, inactive or failed');
    }

    const updated = await setUserStatus(user.id, parsed.data.status);
    if (!updated) {
      throw new HttpError(404, 'Account not found');
    }

    response.json({
      user: {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        status: updated.status,
        statusUpdatedAt: updated.statusUpdatedAt,
      },
    });
  }),
);

/**
 * Delete account: the ledger is purged and the account is archived. The row is
 * kept so the email can never be silently linked to a fresh ledger.
 */
meRouter.delete(
  '/',
  asyncHandler(async (request, response) => {
    const user = request.dbUser!;

    if (user.status !== 'archive') {
      await sql.query('DELETE FROM incomes WHERE user_id = $1', [user.id]);
      await sql.query('DELETE FROM expenses WHERE user_id = $1', [user.id]);
      await setUserStatus(user.id, 'archive');
    }

    response.json({ ok: true, status: 'archive' });
  }),
);
