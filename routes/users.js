// routes/users.js - НОВЫЙ ФАЙЛ
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { body, validationResult } = require('express-validator');

const router = express.Router();
const prisma = new PrismaClient();

// POST /api/users - создать или обновить пользователя
router.post('/', [
  body('telegramId').notEmpty().withMessage('Telegram ID is required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { telegramId, username, firstName, lastName } = req.body;

    // Проверяем существует ли пользователь
    let user = await prisma.user.findUnique({
      where: { telegramId }
    });

    if (user) {
      // Обновляем существующего пользователя
      user = await prisma.user.update({
        where: { telegramId },
        data: {
          username,
          firstName,
          lastName
        }
      });
    } else {
      // Создаем нового пользователя
      user = await prisma.user.create({
        data: {
          telegramId,
          username,
          firstName,
          lastName
        }
      });
    }

    res.json(user);
  } catch (error) {
    console.error('Error creating/updating user:', error);
    res.status(500).json({ error: 'Failed to create/update user' });
  }
});

// GET /api/users/:telegramId - получить пользователя по Telegram ID
router.get('/:telegramId', async (req, res) => {
  try {
    const { telegramId } = req.params;

    const user = await prisma.user.findUnique({
      where: { telegramId },
      include: {
        orders: {
          include: {
            orderItems: {
              include: {
                product: true,
                bundle: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: 10 // последние 10 заказов
        },
        subscriptions: {
          where: {
            status: 'ACTIVE'
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// GET /api/users/:telegramId/stats - получить статистику пользователя
router.get('/:telegramId/stats', async (req, res) => {
  try {
    const { telegramId } = req.params;

    const user = await prisma.user.findUnique({
      where: { telegramId }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Получаем статистику
    const [totalOrders, completedOrders, totalSpent, activeSubscriptions] = await Promise.all([
      prisma.order.count({
        where: { userId: user.id }
      }),
      prisma.order.count({
        where: { 
          userId: user.id,
          status: 'COMPLETED'
        }
      }),
      prisma.order.aggregate({
        where: { 
          userId: user.id,
          status: 'COMPLETED'
        },
        _sum: {
          totalAmount: true
        }
      }),
      prisma.subscription.count({
        where: {
          userId: user.id,
          status: 'ACTIVE'
        }
      })
    ]);

    res.json({
      totalOrders,
      completedOrders,
      totalSpent: totalSpent._sum.totalAmount || 0,
      activeSubscriptions
    });
  } catch (error) {
    console.error('Error fetching user stats:', error);
    res.status(500).json({ error: 'Failed to fetch user stats' });
  }
});

// PUT /api/users/:telegramId - обновить информацию пользователя
router.put('/:telegramId', async (req, res) => {
  try {
    const { telegramId } = req.params;
    const { username, firstName, lastName } = req.body;

    const user = await prisma.user.update({
      where: { telegramId },
      data: {
        username,
        firstName,
        lastName
      }
    });

    res.json(user);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// GET /api/users/:telegramId/orders - получить все заказы пользователя
router.get('/:telegramId/orders', async (req, res) => {
  try {
    const { telegramId } = req.params;
    const { status, limit = 50, offset = 0 } = req.query;

    const user = await prisma.user.findUnique({
      where: { telegramId }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const where = { userId: user.id };
    if (status) {
      where.status = status;
    }

    const orders = await prisma.order.findMany({
      where,
      include: {
        orderItems: {
          include: {
            product: true,
            bundle: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit),
      skip: parseInt(offset)
    });

    res.json(orders);
  } catch (error) {
    console.error('Error fetching user orders:', error);
    res.status(500).json({ error: 'Failed to fetch user orders' });
  }
});

// GET /api/users/:telegramId/subscriptions - получить подписки пользователя
router.get('/:telegramId/subscriptions', async (req, res) => {
  try {
    const { telegramId } = req.params;

    const user = await prisma.user.findUnique({
      where: { telegramId }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const subscriptions = await prisma.subscription.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' }
    });

    res.json(subscriptions);
  } catch (error) {
    console.error('Error fetching user subscriptions:', error);
    res.status(500).json({ error: 'Failed to fetch user subscriptions' });
  }
});

module.exports = router;