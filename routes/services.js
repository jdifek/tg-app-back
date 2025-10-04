const express = require('express');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/services - получить все активные услуги
router.get('/', async (req, res) => {
  try {
    const { type } = req.query;
    const where = { isActive: true };
    
    if (type) {
      where.type = type;
    }

    const services = await prisma.service.findMany({
      where,
      orderBy: { price: 'asc' }
    });
    res.json(services);
  } catch (error) {
    console.error('Error fetching services:', error);
    res.status(500).json({ error: 'Failed to fetch services' });
  }
});

// GET /api/services/:type - получить услуги по типу
router.get('/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const services = await prisma.service.findMany({
      where: { 
        type: type.toUpperCase().replace('-', '_'),
        isActive: true 
      },
      orderBy: { price: 'asc' }
    });
    res.json(services);
  } catch (error) {
    console.error('Error fetching services:', error);
    res.status(500).json({ error: 'Failed to fetch services' });
  }
});

module.exports = router;
