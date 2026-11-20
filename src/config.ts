import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const authBaseUrl = required('NEON_AUTH_BASE_URL');

export const config = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required('DATABASE_URL'),
  authBaseUrl,
  authJwksUrl:
    process.env.NEON_AUTH_JWKS_URL ??
    `${authBaseUrl.replace(/\/$/, '')}/.well-known/jwks.json`,
  // Neon Auth signs JWTs with the auth host as both issuer and audience.
  authIssuer: process.env.NEON_AUTH_ISSUER ?? new URL(authBaseUrl).origin,
  authAudience: process.env.NEON_AUTH_AUDIENCE ?? new URL(authBaseUrl).origin,
  corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
};
