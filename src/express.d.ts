import type { AuthUser, DbUser } from './types.js';

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
      dbUser?: DbUser;
    }
  }
}

export {};
