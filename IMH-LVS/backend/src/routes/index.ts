import { Router } from 'express';
import healthRoutes from './health.routes';
import labelsRoutes from './labels.routes';
import mastersRoutes from './masters.routes';
import productsRoutes from './products.routes';
import usersRoutes from './users.routes';
import artworksRoutes from './artworks.routes';
import comparisonsRoutes from './comparisons.routes';
import authRoutes from './auth.routes';
import { requireSession } from '../middleware/auth.middleware';

const router = Router();

// PUBLIC. Exactly two things are reachable without a session, and both are
// listed here rather than left to a default, so that adding a router below
// cannot accidentally inherit "no guard" — see auth.middleware.ts.
//
// /health reports the database rather than requiring one, and is what a
// platform's health check calls before anybody could possibly be signed in.
// /auth is where a session comes from, so it cannot require one.
router.use('/health', healthRoutes);
router.use('/auth', authRoutes);

// EVERYTHING BELOW REQUIRES A SIGNED-IN, ACTIVE USER.
//
// /labels is inside the guard even though it is stateless and stores nothing.
// It OCRs an uploaded file, which means an open /labels/extract is an open
// document-processing service running on the same host as a pharma database —
// worth having behind a login on its own, quite apart from the artwork
// somebody would be handing it.
router.use(requireSession);

router.use('/labels', labelsRoutes);

// Persistence. These need a database and say so, loudly, on the first request
// that reaches one — getPool() throws a directed error rather than letting the
// driver report "password authentication failed for user undefined".
router.use('/masters', mastersRoutes);
router.use('/products', productsRoutes);
router.use('/users', usersRoutes);
router.use('/artworks', artworksRoutes);
router.use('/comparisons', comparisonsRoutes);

export default router;
