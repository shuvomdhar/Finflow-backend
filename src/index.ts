import cors from 'cors';
import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { requireUser } from './auth.js';
import { config } from './config.js';
import { sql } from './db.js';
import { expensesRouter } from './routes/expenses.js';
import { exportRouter } from './routes/export.js';
import { incomesRouter } from './routes/incomes.js';
import { meRouter } from './routes/me.js';
import { reportsRouter } from './routes/reports.js';
import { markUserFailed } from './services/users.js';
import { HttpError } from './utils.js';

const app = express();

app.disable('x-powered-by');
app.use(
  cors({
    origin: config.corsOrigins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', async (_request, response) => {
  try {
    await sql.query('SELECT 1');
    response.json({
      status: 'ok',
      database: 'connected',
      auth: { issuer: config.authIssuer },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    response.status(503).json({
      status: 'error',
      database: 'unavailable',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

app.use('/api', requireUser);

app.use('/api/me', meRouter);
app.use('/api/incomes', incomesRouter);
app.use('/api/expenses', expensesRouter);
app.use('/api', reportsRouter);
app.use('/api/export', exportRouter);

app.use((request, response) => {
  response.status(404).json({
    error: 'Not found',
    path: request.path,
  });
});

app.use(
  async (
    error: unknown,
    request: Request,
    response: Response,
    _next: NextFunction,
  ) => {
    if (error instanceof HttpError) {
      response.status(error.status).json({
        error: error.message,
        ...(error.code ? { code: error.code } : {}),
      });
      return;
    }

    console.error('[finflow-api]', error);

    // Any unexpected failure while a signed-in user is making a request is a
    // real account problem, so the account is flagged until the next sign-in.
    if (request.dbUser) {
      try {
        await markUserFailed(request.dbUser.id);
      } catch (statusError) {
        console.error('[finflow-api] could not mark account failed', statusError);
      }
    }

    response.status(500).json({
      error: 'Internal server error',
      code: 'REQUEST_FAILED',
    });
  },
);

app.listen(config.port, () => {
  console.log(`FinFlow API listening on http://localhost:${config.port}`);
});
