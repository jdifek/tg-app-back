const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { body, validationResult } = require('express-validator');

const router = express.Router();
const prisma = new PrismaClient();

// POST /api/orders - создать заказ
router.post('/', [
  body('userId').notEmpty().withMessage('User ID is required'),
  body('items').isArray().withMessage('Items must be an array'),
  body('firstName').optional().trim(),
  body('lastName').optional().trim(),
  body('address').optional().trim(),
  body('city').optional().trim(),
  body('zipCode').optional().trim(),
  body('country').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      userId,
      items,
      firstName,
      lastName,
      address,
      city,
      zipCode,
      country
    } = req.body;

    // Проверяем пользователя
    const user = await prisma.user.findUnique({
      where: { telegramId: userId }
    });

    if (!user) {
      // Создаем пользователя если не существует
      await prisma.user.create({
        data: { telegramId: userId }
      });
    }

    let totalAmount = 0;
    const orderItems = [];

    // Обрабатываем товары
    for (const item of items) {
      if (item.type === 'product') {
        const product = await prisma.product.findUnique({
          where: { id: item.id }
        });
        if (product) {
          totalAmount += product.price * (item.quantity || 1);
          orderItems.push({
            productId: product.id,
            quantity: item.quantity || 1,
            price: product.price
          });
        }
      } else if (item.type === 'bundle') {
        const bundle = await prisma.bundle.findUnique({
          where: { id: item.id }
        });
        if (bundle) {
          totalAmount += bundle.price;
          orderItems.push({
            bundleId: bundle.id,
            quantity: 1,
            price: bundle.price
          });
        }
      }
    }

    // Создаем заказ
    const order = await prisma.order.create({
      data: {
        userId: user.id,
        totalAmount,
        firstName,
        lastName,
        address,
        city,
        zipCode,
        country,
        orderItems: {
          create: orderItems
        }
      },
      include: {
        orderItems: {
          include: {
            product: true,
            bundle: true
          }
        }
      }
    });

    res.status(201).json(order);
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});// GET /api/orders - получить заказы пользователя
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await prisma.user.findUnique({
      where: { telegramId: userId }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const orders = await prisma.order.findMany({
      where: { userId: user.id },
      include: {
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

module.exports = router;