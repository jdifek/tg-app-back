const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { body, validationResult } = require('express-validator');

const router = express.Router();
const prisma = new PrismaClient();

// PRODUCTS CRUD
// POST /api/admin/products - создать продукт
router.post('/products', [
  body('name').notEmpty().withMessage('Name is required'),
  body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('categoryId').notEmpty().withMessage('Category ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const product = await prisma.product.create({
      data: req.body,
      include: { category: true }
    });
    res.status(201).json(product);
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// PUT /api/admin/products/:id - обновить продукт
router.put('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const product = await prisma.product.update({
      where: { id },
      data: req.body,
      include: { category: true }
    });
    res.json(product);
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// DELETE /api/admin/products/:id - удалить продукт
router.delete('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.product.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// BUNDLES CRUD
// POST /api/admin/bundles - создать бандл
router.post('/bundles', [
  body('name').notEmpty().withMessage('Name is required'),
  body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const bundle = await prisma.bundle.create({
      data: req.body
    });
    res.status(201).json(bundle);
  } catch (error) {
    console.error('Error creating bundle:', error);
    res.status(500).json({ error: 'Failed to create bundle' });
  }
});
// GET /api/admin/categories - получить все категории
router.get('/categories', async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { name: 'asc' }
    });
    res.json(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});
// PUT /api/admin/bundles/:id - обновить бандл
router.put('/bundles/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const bundle = await prisma.bundle.update({
      where: { id },
      data: req.body
    });
    res.json(bundle);
  } catch (error) {
    console.error('Error updating bundle:', error);
    res.status(500).json({ error: 'Failed to update bundle' });
  }
});

// DELETE /api/admin/bundles/:id - удалить бандл
router.delete('/bundles/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.bundle.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting bundle:', error);
    res.status(500).json({ error: 'Failed to delete bundle' });
  }
});

// GET /api/admin/orders - получить все заказы
router.get('/orders', async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      include: {
        user: true,
        orderItems: {
          include: {
            product: true,
            bundle: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(orders);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// WISHLIST CRUD
router.post('/wishlist', async (req, res) => {
  try {
    const wishlistItem = await prisma.wishlistItem.create({
      data: req.body
    });
    res.status(201).json(wishlistItem);
  } catch (error) {
    console.error('Error creating wishlist item:', error);
    res.status(500).json({ error: 'Failed to create wishlist item' });
  }
});

router.put('/wishlist/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const wishlistItem = await prisma.wishlistItem.update({
      where: { id },
      data: req.body
    });
    res.json(wishlistItem);
  } catch (error) {
    console.error('Error updating wishlist item:', error);
    res.status(500).json({ error: 'Failed to update wishlist item' });
  }
});

router.delete('/wishlist/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.wishlistItem.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting wishlist item:', error);
    res.status(500).json({ error: 'Failed to delete wishlist item' });
  }
});

module.exports = router;