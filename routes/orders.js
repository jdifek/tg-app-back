const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const supabase = require('../supabaseClient');
const axios = require('axios');

const router = express.Router();
const prisma = new PrismaClient();
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

const storage = multer.memoryStorage();
const upload = multer({ storage });
const ADMIN_IDS = ['6970790362', '5505526221'];
async function notifyAdmins(order, username) {
  const message = `
📦 <b>Новый заказ создан!</b>
───────────────
🆔 <b>ID заказа:</b> ${order.id}
👤 <b>Пользователь:</b> ${order.firstName + `(@${username})` || 'Неизвестен'}
📗 <b>Тип:</b> ${order.orderType}
💰 <b>Сумма:</b> ${order.totalAmount} USD
───────────────
⚙️ Перейди в админку для обработки.
  `;

  for (const adminId of ADMIN_IDS) {
    try {
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: adminId,
        text: message,
        parse_mode: 'HTML',
      });
    } catch (err) {
      console.error(`❌ Ошибка при отправке уведомления админу ${adminId}:`, err.response?.data || err.message);
    }
  }
}

router.post("/stars", async (req, res) => {
  const { title, description, amount, userId } = req.body;

  console.log('🌟 === STARS PAYMENT REQUEST ===');
  console.log('📥 Request body:', { title, description, amount, userId });

  if (!userId) {
    console.log('❌ UserId not provided');
    return res.status(400).json({ error: "UserId is required" });
  }

  try {
    // 1. Находим или создаём пользователя
    console.log('🔍 Looking for user with telegramId:', userId);
    let user = await prisma.user.findUnique({ where: { telegramId: userId } });
    
    if (!user) {
      console.log('➕ User not found, creating new user...');
      user = await prisma.user.create({ data: { telegramId: userId } });
      console.log('✅ New user created:', { id: user.id, telegramId: user.telegramId });
    } else {
      console.log('✅ User found:', { id: user.id, telegramId: user.telegramId });
    }

    // 2. СНАЧАЛА создаём заказ
    console.log('📦 Creating order...');
    const order = await prisma.order.create({
      data: {
        userId: user.id,
        telegramId: userId,
        orderType: "RATING",
        paymentMethod: "STARS",
        totalAmount: amount,
        status: "PENDING",
        paymentStatus: "PENDING",
      },
    });
    console.log('✅ Order created:', {
      orderId: order.id,
      userId: order.userId,
      telegramId: order.telegramId,
      amount: order.totalAmount,
      status: order.status,
      paymentStatus: order.paymentStatus
    });

    // 3. ПОТОМ создаём invoice с реальным orderId
    const invoicePayload = { orderId: order.id };
    console.log('💳 Creating Telegram invoice...');
    console.log('📋 Invoice payload:', invoicePayload);
    
    const response = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          payload: JSON.stringify(invoicePayload),
          currency: "XTR",
          prices: [{ label: title, amount: Math.round(amount) }],
        }),
      }
    );

    const data = await response.json();
    console.log('📨 Telegram API response:', data);
    
    if (!data.ok) {
      console.error('❌ Failed to create invoice:', data.description);
      console.log('🗑️ Deleting order:', order.id);
      await prisma.order.delete({ where: { id: order.id } });
      return res.status(400).json({ error: data.description });
    }

    console.log('✅ Invoice created successfully:', data.result);
    console.log('🎉 === STARS PAYMENT REQUEST COMPLETED ===\n');
    
    res.json({ invoice_url: data.result, orderId: order.id });
  } catch (err) {
    console.error('❌ Error in /stars endpoint:', err);
    console.error('Stack trace:', err.stack);
    res.status(500).json({ error: "Ошибка при создании счёта" });
  }
});

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
      telegramId,
      username,
      paymentMethod,
      lastName,
      address,
      city,
      zipCode,
      country
    } = req.body;

    // Проверяем пользователя
    let user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      user = await prisma.user.create({
        data: { id: userId, telegramId: telegramId }
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
      totalAmount = 49.99;
    } else if (orderType === 'CUSTOM_VIDEO') {
      totalAmount = 99.99;
    } else if (orderType === 'VIDEO_CALL') {
      totalAmount = 149.99;
    } else if (orderType === 'RATING') {
      totalAmount = 19.99;
    }

    // Создаем заказ
    const order = await prisma.order.create({
      data: {
        userId: user.id,
        telegramId: user.telegramId,
        orderType,
        totalAmount,
        firstName,
        lastName,
        address,
        paymentMethod,
        username,
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
    await notifyAdmins(order, username);
    res.status(201).json(order);
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// PATCH /api/orders/:id — прикрепить скриншот
router.patch('/:id-rating', upload.single('rating'), async (req, res) => {
  try {
    const { id } = req.params;
    const existingOrder = await prisma.order.findUnique({ where: { id } });

    if (!existingOrder) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'rating file is required' });
    }

    // ... остальной код загрузки в Supabase как у тебя ...
    const fileExt = req.file.originalname.split('.').pop();
    const fileName = `orders/${Date.now()}-${Math.random()
      .toString(36)
      .substring(7)}.${fileExt}`;

    const { data, error: uploadError } = await supabase.storage
      .from(process.env.SUPABASE_BUCKET)
      .upload(fileName, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false,
      });

    if (uploadError) {
      console.error('Supabase upload error:', uploadError);
      return res.status(500).json({ error: 'Failed to upload rating' });
    }

    const { data: publicUrlData } = supabase.storage
      .from(process.env.SUPABASE_BUCKET)
      .getPublicUrl(fileName);

    const ratingUrl = publicUrlData.publicUrl;

    const updatedOrder = await prisma.order.update({
      where: { id },
      data: { rating: ratingUrl, updatedAt: new Date() },
      include: { user: true, orderItems: { include: { product: true, bundle: true } } },
    });

    res.json(updatedOrder);
  } catch (err) {
    console.error('Error updating order rating:', err);
    res.status(500).json({ error: 'Failed to update order rating' });
  }
});

// PATCH /api/orders/:id — прикрепить скриншот
router.patch('/:id', upload.single('screenshot'), async (req, res) => {
  try {
    const { id } = req.params;
    const existingOrder = await prisma.order.findUnique({ where: { id } });

    if (!existingOrder) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Screenshot file is required' });
    }

    // ... остальной код загрузки в Supabase как у тебя ...
    const fileExt = req.file.originalname.split('.').pop();
    const fileName = `orders/${Date.now()}-${Math.random()
      .toString(36)
      .substring(7)}.${fileExt}`;

    const { data, error: uploadError } = await supabase.storage
      .from(process.env.SUPABASE_BUCKET)
      .upload(fileName, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false,
      });

    if (uploadError) {
      console.error('Supabase upload error:', uploadError);
      return res.status(500).json({ error: 'Failed to upload screenshot' });
    }

    const { data: publicUrlData } = supabase.storage
      .from(process.env.SUPABASE_BUCKET)
      .getPublicUrl(fileName);

    const screenshotUrl = publicUrlData.publicUrl;

    const updatedOrder = await prisma.order.update({
      where: { id },
      data: { screenshot: screenshotUrl, updatedAt: new Date() },
      include: { user: true, orderItems: { include: { product: true, bundle: true } } },
    });

    res.json(updatedOrder);
  } catch (err) {
    console.error('Error updating order screenshot:', err);
    res.status(500).json({ error: 'Failed to update order screenshot' });
  }
});

// PATCH /api/orders/:id/payment-status - обновить статус платежа
router.patch('/:id/payment-status', [
  body('paymentStatus').isIn(['PENDING', 'AWAITING_CHECK', 'CONFIRMED', 'FAILED'])
    .withMessage('Invalid payment status'),
], async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentStatus } = req.body;

    const order = await prisma.order.update({
      where: { id },
      data: { paymentStatus, updatedAt: new Date() },
      include: {
        orderItems: {
          include: { product: true, bundle: true },
        },
      },
    });

    res.json(order);
  } catch (error) {
    console.error('Error updating payment status:', error);
    res.status(500).json({ error: 'Failed to update payment status' });
  }
});

// PATCH /api/orders/:id/status - обновить статус заказа
// PATCH /api/orders/:id/status - обновить статус заказа
router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Валидация статуса заказа
    const validStatuses = ['PENDING', 'PROCESSING', 'COMPLETED', 'CANCELLED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        error: 'Invalid order status',
        validStatuses: validStatuses
      });
    }

    // Обновляем только статус заказа, НЕ трогая paymentStatus
    const updatedOrder = await prisma.order.update({
      where: { id },
      data: {
        status,  // обновляем только статус заказа
        updatedAt: new Date()
      },
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

    res.json(updatedOrder);
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ error: 'Failed to update order status' });
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
