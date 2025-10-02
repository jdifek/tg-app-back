const express = require('express');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/wishlist - получить все активные элементы wishlist
router.get('/', async (req, res) => {
  try {
    const wishlistItems = await prisma.wishlistItem.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json(wishlistItems);
  } catch (error) {
    console.error('Error fetching wishlist:', error);
    res.status(500).json({ error: 'Failed to fetch wishlist' });
  }
});

module.exports = router;
