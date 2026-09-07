import { Router } from 'express';
import healthRoutes from './health.routes';
import labelsRoutes from './labels.routes';
import mastersRoutes from './masters.routes';
import productsRoutes from './products.routes';
import usersRoutes from './users.routes';
import artworksRoutes from './artworks.routes';
import comparisonsRoutes from './comparisons.routes';
import crudRoutes from './crud.routes';

const router = Router();

// Stateless. /health reports the database rather than requiring it, and
// /labels/extract OCRs an uploaded file and stores nothing — both work with no
// DATABASE_URL configured at all (see src/db/pool.ts).
router.use('/health', healthRoutes);
router.use('/labels', labelsRoutes);

// Persistence. These need a database and say so, loudly, on the first request
// that reaches one — getPool() throws a directed error rather than letting the
// driver report "password authentication failed for user undefined".
router.use('/masters', mastersRoutes);
router.use('/products', productsRoutes);
router.use('/users', usersRoutes);
router.use('/artworks', artworksRoutes);
router.use('/comparisons', comparisonsRoutes);
router.use('/data', crudRoutes);

export default router;
