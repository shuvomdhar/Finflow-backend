export type AuthUser = {
  authUserId: string;
  email: string;
  name: string | null;
};

export const ACCOUNT_STATUSES = [
  'active',
  'inactive',
  'archive',
  'failed',
] as const;

export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export type DbUser = {
  id: number;
  authUserId: string;
  email: string;
  name: string | null;
  status: AccountStatus;
  statusUpdatedAt: string;
};

export type Income = {
  id: number;
  month: string;
  source: string;
  category: string;
  amount: number;
  note: string | null;
};

export type Expense = {
  id: number;
  spentOn: string;
  title: string;
  category: string;
  amount: number;
  paymentMethod: string;
  note: string | null;
};

export type CategoryTotal = {
  category: string;
  total: number;
};
