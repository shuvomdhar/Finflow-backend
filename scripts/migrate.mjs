import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const __dirname = dirname(fileURLToPath(import.meta.url));
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('DATABASE_URL is missing. Add it to backend/.env');
  process.exit(1);
}

const sql = neon(databaseUrl);
const schema = readFileSync(join(__dirname, '..', 'db', 'schema.sql'), 'utf8');

// The Neon HTTP driver executes a single statement per request, so split the
// idempotent DDL file on statement terminators.
const statements = schema
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n')
  .split(';')
  .map((statement) => statement.trim())
  .filter((statement) => statement.length > 0);

for (const statement of statements) {
  await sql.query(statement);
}

console.log(`FinFlow schema applied (${statements.length} statements).`);
