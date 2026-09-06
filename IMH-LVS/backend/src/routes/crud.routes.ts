import { Router } from 'express';
import { prisma } from '../config/db';

const router = Router();

// GET /api/data/:model
router.get('/:model', async (req, res) => {
  const modelName = req.params.model;
  try {
    if (!(prisma as any)[modelName]) {
      return res.status(404).json({ error: `Model ${modelName} not found` });
    }
    const data = await (prisma as any)[modelName].findMany();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/data/:model/:id
router.get('/:model/:id', async (req, res) => {
  const { model, id } = req.params;
  try {
    if (!(prisma as any)[model]) return res.status(404).json({ error: `Model ${model} not found` });
    const data = await (prisma as any)[model].findUnique({ where: { id } });
    if (!data) return res.status(404).json({ error: 'Not found' });
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/data/:model
router.post('/:model', async (req, res) => {
  const modelName = req.params.model;
  try {
    if (!(prisma as any)[modelName]) return res.status(404).json({ error: `Model ${modelName} not found` });
    const data = await (prisma as any)[modelName].create({
      data: req.body
    });
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/data/:model/:id
router.put('/:model/:id', async (req, res) => {
  const { model, id } = req.params;
  try {
    if (!(prisma as any)[model]) return res.status(404).json({ error: `Model ${model} not found` });
    const data = await (prisma as any)[model].update({
      where: { id },
      data: req.body
    });
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/data/:model/:id
router.delete('/:model/:id', async (req, res) => {
  const { model, id } = req.params;
  try {
    if (!(prisma as any)[model]) return res.status(404).json({ error: `Model ${model} not found` });
    await (prisma as any)[model].delete({ where: { id } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
