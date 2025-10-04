const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { body, validationResult } = require('express-validator');

const router = express.Router();
const prisma = new PrismaClient();

// POST /api/orders - создать заказ
router.post('/', [
  body('userId').notEmpty().withMessage('User ID is required'),
  body('orderType').isIn(['PRODUCT', 'BUNDLE', 'VIP', 'CUSTOM_VIDEO', 'VIDEO_CALL', 'RATING']).withMessage('Invalid order type'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      userId,
      orderType,
      items,
      firstName,
      lastName,
      address,
      city,
      zipCode,
      country,
      metadata
    } = req.body;

    // Проверяем пользователя
    let user = await prisma.user.findUnique({
      where: { telegramId: userId }
    });

    if (!user) {
      user = await prisma.user.create({
        data: { telegramId: userId }
      });
    }

    let totalAmount = 0;
    const orderItems = [];

    // Обрабатываем различные типы заказов
    if (orderType === 'PRODUCT' || orderType === 'BUNDLE') {
      for (const item of items || []) {
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
    } else if (orderType === 'VIP') {
      // Цены для VIP планов
      const plans = {
        'monthly': 49.99,
        'quarterly': 129.99,
        'yearly': 449.99
      };
      const planId = metadata?.planId || 'monthly';
      totalAmount = plans[planId] || 49.99;
    } else if (orderType === 'CUSTOM_VIDEO') {
      // Цены для кастомного видео
      const prices = {
        '5min': 99.99,
        '10min': 179.99,
        '15min': 249.99
      };
      const duration = metadata?.duration || '5min';
      totalAmount = prices[duration] || 99.99;
    } else if (orderType === 'VIDEO_CALL') {
      // Цены для видеозвонков
      const prices = {
        '10min': 149.99,
        '20min': 279.99,
        '30min': 399.99
      };
      const duration = metadata?.duration || '10min';
      totalAmount = prices[duration] || 149.99;
    } else if (orderType === 'RATING') {
      // Цены для рейтингов
      const prices = {
        'text': 19.99,
        'voice': 39.99,
        'video': 59.99
      };
      const ratingType = metadata?.ratingType || 'text';
      totalAmount = prices[ratingType] || 19.99;
    }

    // Создаем заказ
    const order = await prisma.order.create({
      data: {
        userId: user.id,
        orderType,
        totalAmount,
        firstName,
        lastName,
        address,
        city,
        zipCode,
        country,
        metadata: metadata ? JSON.stringify(metadata) : null,
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
});

// PATCH /api/orders/:id/status - обновить статус заказа
router.patch('/:id/status', [
  body('status').isIn(['PENDING', 'PROCESSING', 'COMPLETED', 'CANCELLED']).withMessage('Invalid status'),
  body('paymentMethod').optional()
], async (req, res) => {
  try {
    const { id } = req.params;
    const { status, paymentMethod } = req.body;

    const order = await prisma.order.update({
      where: { id },
      data: {
        status,
        paymentMethod: paymentMethod || undefined,
        updatedAt: new Date()
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

    res.json(order);
  } catch (error) {
    console.error('Error updating order:', error);
    res.status(500).json({ error: 'Failed to update order' });
  }
});

// GET /api/orders/:userId - получить заказы пользователя
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

// GET /api/orders/detail/:id - получить детали заказа
router.get('/detail/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        user: true,
        orderItems: {
          include: {
            product: true,
            bundle: true
          }
        }
      }
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json(order);
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

module.exports = router;