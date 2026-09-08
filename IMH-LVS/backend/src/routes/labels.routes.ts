import { Router } from 'express';
import { labelFileUpload, labelPairUpload } from '../middleware/upload.middleware';
import { compareExtractedLabels, compareLabels, compareVisual, extractLabel } from '../controllers/labels.controller';

const router = Router();

router.post('/extract', labelFileUpload, extractLabel);
router.post('/compare', labelPairUpload, compareLabels);
router.post('/compare-extracted', compareExtractedLabels);
router.post('/compare-visual', labelPairUpload, compareVisual);

export default router;
