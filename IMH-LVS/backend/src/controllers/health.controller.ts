import { Request, Response } from 'express';
import { getPool } from '../db/pool';

type DependencyState = 'ok' | 'unconfigured' | 'unreachable';

/**
 * Liveness/readiness endpoint. This is what Render polls (see render.yaml's
 * healthCheckPath), so it has to answer quickly and it must not fail the
 * whole service for a degraded dependency.
 *
 * The database is reported, not required. Label extraction
 * (/api/labels/extract) is stateless — it OCRs an uploaded file and stores
 * nothing — so a backend with an unreachable database is still doing useful
 * work, and returning 503 here would take that away and roll back a deploy
 * over it. The persistence routes fail loudly on their own when asked.
 */
export async function getHealth(_req: Request, res: Response) {
  const database = await checkDatabase();

  res.status(200).json({
    success: true,
    message: 'IMH LVS Backend is running',
    dependencies: { database }
  });
}

async function checkDatabase(): Promise<{ state: DependencyState; detail?: string }> {
  let pool;
  try {
    pool = getPool();
  } catch {
    // getPool() throws only when DATABASE_URL is unset — a configuration
    // fact, not an outage, and worth distinguishing: "you never set it" and
    // "it is set but the server is down" have completely different fixes.
    return { state: 'unconfigured', detail: 'DATABASE_URL is not set' };
  }

  try {
    await pool.query('SELECT 1');
    return { state: 'ok' };
  } catch (error) {
    return {
      state: 'unreachable',
      detail: error instanceof Error ? error.message : String(error)
    };
  }
}
