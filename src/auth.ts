import type { NextFunction, Request, Response } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from './config.js';
import { upsertUser } from './services/users.js';
import type { AuthUser } from './types.js';
import { asyncHandler, HttpError } from './utils.js';

const jwks = createRemoteJWKSet(new URL(config.authJwksUrl));

export async function authenticateRequest(request: Request): Promise<AuthUser> {
  const header = request.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    throw new HttpError(401, 'Missing bearer token');
  }

  const token = header.slice('Bearer '.length).trim();

  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: config.authIssuer,
      audience: config.authAudience,
    });

    if (!payload.sub) {
      throw new HttpError(401, 'Token is missing a subject');
    }

    return {
      authUserId: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : '',
      name: typeof payload.name === 'string' ? payload.name : null,
    };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(401, 'Invalid or expired token');
  }
}

/**
 * Verifies the Neon Auth JWT and makes sure a local integer-id user exists.
 *
 * Archived accounts keep their Neon Auth credential but lose access to the
 * FinFlow ledger, so every authenticated route is blocked at the gate.
 */
export const requireUser = asyncHandler(
  async (request: Request, _response: Response, next: NextFunction) => {
    const authUser = await authenticateRequest(request);
    request.authUser = authUser;
    const user = await upsertUser(authUser);
    request.dbUser = user;

    if (user.status === 'archive') {
      throw new HttpError(
        403,
        'This account has been deleted. Create a new account to keep tracking your money.',
        'ACCOUNT_ARCHIVED',
      );
    }

    next();
  },
);
