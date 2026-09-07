import { Router } from 'express';
import { prisma } from '../config/db';

const router = Router();

// The frontend sends PascalCase model names (e.g. "MarketingCompany") in URLs,
// but PrismaClient exposes delegates using camelCase (e.g. prisma.marketingCompany).
// This helper converts PascalCase to camelCase so the dynamic lookup works.
function toCamelCase(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getDelegate(modelName: string): any {
  const key = toCamelCase(modelName);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (prisma as any)[key];
}

// GET /api/data/:model
router.get('/:model', async (req, res) => {
  const modelName = req.params.model;
  try {
    if (!getDelegate(modelName)) {
      return res.status(404).json({ error: `Model ${modelName} not found` });
    }
    const data = await getDelegate(modelName).findMany();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/data/:model/:id
router.get('/:model/:id', async (req, res) => {
  const { model, id } = req.params;
  try {
    if (!getDelegate(model)) return res.status(404).json({ error: `Model ${model} not found` });
    const data = await getDelegate(model).findUnique({ where: { id } });
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
    if (!getDelegate(modelName)) return res.status(404).json({ error: `Model ${modelName} not found` });
    const data = await getDelegate(modelName).create({
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
    if (!getDelegate(model)) return res.status(404).json({ error: `Model ${model} not found` });
    const data = await getDelegate(model).update({
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
    if (!getDelegate(model)) return res.status(404).json({ error: `Model ${model} not found` });
    await getDelegate(model).delete({ where: { id } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
