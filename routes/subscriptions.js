const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { body, validationResult } = require('express-validator');

const router = express.Router();
const prisma = new PrismaClient();

// POST /api/subscriptions - создать подписку
router.post('/', [
  body('userId').notEmpty().withMessage('User ID is required'),
  body('planType').isIn(['MONTHLY', 'QUARTERLY', 'YEARLY']).withMessage('Invalid plan type'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { userId, planType } = req.body;

    // Проверяем или создаем пользователя
    let user = await prisma.user.findUnique({
      where: { telegramId: userId }
    });

    if (!user) {
      user = await prisma.user.create({
        data: { telegramId: userId }
      });
    }

    // Определяем цену и длительность
    const plans = {
      MONTHLY: { price: 49.99, months: 1 },
      QUARTERLY: { price: 129.99, months: 3 },
      YEARLY: { price: 449.99, months: 12 }
    };

    const plan = plans[planType];
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + plan.months);

    // Создаем подписку
    const subscription = await prisma.subscription.create({
      data: {
        userId: user.id,
        planType,
        price: plan.price,
        endDate,
        status: 'ACTIVE'
      }
    });

    // Создаем заказ для подписки
    const order = await prisma.order.create({
      data: {
        userId: user.id,
        orderType: 'VIP',
        totalAmount: plan.price,
        status: 'PENDING',
        metadata: JSON.stringify({ planType, subscriptionId: subscription.id })
      }
    });

    res.status(201).json({ subscription, order });
  } catch (error) {
    console.error('Error creating subscription:', error);
    res.status(500).json({ error: 'Failed to create subscription' });
  }
});

// GET /api/subscriptions/:userId - получить подписки пользователя
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await prisma.user.findUnique({
      where: { telegramId: userId }
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
    console.error('Error fetching subscriptions:', error);
    res.status(500).json({ error: 'Failed to fetch subscriptions' });
  }
});

module.exports = router;
