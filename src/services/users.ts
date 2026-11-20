import { sql } from '../db.js';
import type { AccountStatus, AuthUser, DbUser } from '../types.js';

type UserRow = {
  id: number;
  auth_user_id: string;
  email: string;
  name: string | null;
  status: AccountStatus;
  status_updated_at: string;
};

const USER_COLUMNS =
  'id, auth_user_id, email, name, status, status_updated_at';

function mapUser(row: UserRow): DbUser {
  return {
    id: Number(row.id),
    authUserId: row.auth_user_id,
    email: row.email,
    name: row.name,
    status: row.status,
    statusUpdatedAt: new Date(row.status_updated_at).toISOString(),
  };
}

/**
 * Maps a Neon Auth user (string UUID) to a FinFlow user row with an int id.
 *
 * The account status is deliberately left untouched on conflict: it is a
 * lifecycle field owned by the app (sign-in, sign-out, deletion, failures).
 */
export async function upsertUser(authUser: AuthUser): Promise<DbUser> {
  const rows = (await sql.query(
    `INSERT INTO users (auth_user_id, email, name)
     VALUES ($1, $2, $3)
     ON CONFLICT (auth_user_id) DO UPDATE
       SET email = CASE WHEN EXCLUDED.email <> '' THEN EXCLUDED.email ELSE users.email END,
           name = COALESCE(EXCLUDED.name, users.name),
           updated_at = now()
     RETURNING ${USER_COLUMNS}`,
    [authUser.authUserId, authUser.email, authUser.name],
  )) as UserRow[];

  return mapUser(rows[0]);
}

export async function getDbUser(userId: number): Promise<DbUser | null> {
  const rows = (await sql.query(
    `SELECT ${USER_COLUMNS} FROM users WHERE id = $1`,
    [userId],
  )) as UserRow[];

  return rows[0] ? mapUser(rows[0]) : null;
}

/**
 * Records an account lifecycle change. `archive` is terminal and stamps
 * `archived_at` the first time it is applied.
 */
export async function setUserStatus(
  userId: number,
  status: AccountStatus,
): Promise<DbUser | null> {
  const rows = (await sql.query(
    `UPDATE users
     SET status = $2::text,
         status_updated_at = now(),
         archived_at = CASE
           WHEN $2::text = 'archive' THEN COALESCE(archived_at, now())
           ELSE archived_at
         END,
         updated_at = now()
     WHERE id = $1
     RETURNING ${USER_COLUMNS}`,
    [userId, status],
  )) as UserRow[];

  return rows[0] ? mapUser(rows[0]) : null;
}

/**
 * Marks an account as failed after an unexpected server error. Archived
 * accounts are never rewritten and failures never mask a good state that was
 * written in the same request cycle.
 */
export async function markUserFailed(userId: number): Promise<void> {
  await sql.query(
    `UPDATE users
     SET status = 'failed',
         status_updated_at = now(),
         updated_at = now()
     WHERE id = $1 AND status IN ('active', 'inactive')`,
    [userId],
  );
}
