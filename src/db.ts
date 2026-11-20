import { neon } from '@neondatabase/serverless';
import { config } from './config.js';

/**
 * Neon's serverless driver uses HTTP for one-shot queries, which keeps the
 * API fast and portable on serverless hosts. Transactions are available via
 * sql.transaction(), but each FinFlow write is a single statement.
 */
export const sql = neon(config.databaseUrl);
