const express = require('express');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/wishlist - получить все активные элементы wishlist
router.get('/', async (req, res) => {
  try {
    const wishlistItems = await prisma.wishlistItem.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(wishlistItems);
  } catch (error) {
    console.error('Error fetching wishlist:', error);
    res.status(500).json({ error: 'Failed to fetch wishlist' });
  }
});

// POST /api/wishlist - добавить новый элемент в wishlist
router.post('/', async (req, res) => {
  try {
    const { name, description, image, price } = req.body;
    const newItem = await prisma.wishlistItem.create({
      data: { name, description, image, price },
    });
    res.status(201).json({
      result: true,
      wishlist: newItem,
    });
  } catch (error) {
    console.error('Error creating wishlist item:', error);
    res.status(400).json({
      result: false,
      error: 'Invalid data format',
    });
  }
});

// DELETE /api/wishlist/:id - удалить элемент wishlist по id
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.wishlistItem.delete({ where: { id: id } });
    res.status(200).json({
      result: true,
    });
  } catch (error) {
    console.error('Error deleting wishlist item:', error);
    res.status(404).json({
      result: false,
      error: 'Wishlist item not found',
    });
  }
});

router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const response = await prisma.wishlistItem.findUnique({
      where: { id: id },
    });

    if (!response) {
      return res.status(404).json({
        result: false,
        error: 'Wishlist item not found',
      });
    }

    res.status(200).json({
      result: true,
      wishlist: response,
    });
  } catch (error) {
    console.error('Error fetching wishlist item:', error);
    res.status(500).json({
      result: false,
      error: 'Failed to fetch wishlist item',
    });
  }
});
// PATCH /api/wishlist/:id - обновить элемент wishlist по id (частичное обновление)
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, description, image, price, isActive } = req.body;

  try {
    const updatedItem = await prisma.wishlistItem.update({
      where: { id: id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(image !== undefined && { image }),
        ...(price !== undefined && { price }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    res.status(200).json({
      result: true,
      wishlist: updatedItem,
    });
  } catch (error) {
    console.error('Error updating wishlist item:', error);
    res.status(404).json({
      result: false,
      error: 'Wishlist item not found or invalid data',
    });
  }
});

module.exports = router;
