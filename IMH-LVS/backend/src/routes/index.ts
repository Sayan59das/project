import { Router } from 'express';
import healthRoutes from './health.routes';
import labelsRoutes from './labels.routes';

const router = Router();

router.use('/health', healthRoutes);
router.use('/labels', labelsRoutes);

export default router;
