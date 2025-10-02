const express = require('express');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/bundles - получить все активные бандлы
router.get('/', async (req, res) => {
  try {
    const bundles = await prisma.bundle.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json(bundles);
  } catch (error) {
    console.error('Error fetching bundles:', error);
    res.status(500).json({ error: 'Failed to fetch bundles' });
  }
});

// GET /api/bundles/:id - получить бандл по ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const bundle = await prisma.bundle.findUnique({
      where: { id }
    });
    
    if (!bundle) {
      return res.status(404).json({ error: 'Bundle not found' });
    }
    
    res.json(bundle);
  } catch (error) {
    console.error('Error fetching bundle:', error);
    res.status(500).json({ error: 'Failed to fetch bundle' });
  }
});

module.exports = router;