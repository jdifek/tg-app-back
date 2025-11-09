
// server.js
const express = require('express');
const path = require('path');

const cors = require('cors');
const helmet = require('helmet');
const uploadRoutes = require('./routes/upload');
const rateLimit = require('express-rate-limit');
const { PrismaClient } = require('@prisma/client');
const { initBot } = require('./telegram/bot');

require('dotenv').config();

const app = express();
const prisma = new PrismaClient();

const PORT = process.env.PORT || 3001;
app.set('trust proxy', 1);
// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);
initBot();
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api/upload', uploadRoutes);

// Webhook for Telegram payment notifications
app.post('/webhook/telegram', async (req, res) => {
  console.log('\n🔔 === TELEGRAM WEBHOOK RECEIVED ===');
  console.log('📥 Full request body:', JSON.stringify(req.body, null, 2));

  try {
    const { pre_checkout_query, message, update_id } = req.body;

    console.log('🆔 Update ID:', update_id);
    console.log('📋 Has message:', !!message);
    console.log('📋 Has pre_checkout_query:', !!pre_checkout_query);

    // ✅ SUCCESSFUL_PAYMENT ПРИХОДИТ ВНУТРИ MESSAGE
    if (message?.successful_payment) {
      console.log('💰 === SUCCESSFUL PAYMENT DETECTED ===');

      const payment = message.successful_payment;
      console.log('💳 Payment details:');
      console.log('  - Currency:', payment.currency);
      console.log('  - Total amount:', payment.total_amount);
      console.log('  - Invoice payload:', payment.invoice_payload);
      console.log('  - Telegram payment charge ID:', payment.telegram_payment_charge_id);
      console.log('  - Provider payment charge ID:', payment.provider_payment_charge_id);

      const { invoice_payload } = payment;

      // Парсим orderId из payload
      let orderId;
      try {
        const parsed = JSON.parse(invoice_payload);
        orderId = parsed.orderId;
        console.log('🆔 Extracted orderId from payload:', orderId);

        if (!orderId) {
          console.error('❌ orderId is missing in payload');
          return res.sendStatus(400);
        }
      } catch (err) {
        console.error("❌ Failed to parse invoice_payload:", invoice_payload);
        console.error("Parse error:", err.message);
        return res.sendStatus(400);
      }

      // Проверяем существование заказа
      console.log('🔍 Searching for order in database...');
      const existingOrder = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          user: true
        }
      });

      if (!existingOrder) {
        console.error(`❌ Order ${orderId} NOT FOUND in database!`);

        // Показываем последние заказы для отладки
        const recentOrders = await prisma.order.findMany({
          take: 5,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            telegramId: true,
            orderType: true,
            paymentStatus: true,
            totalAmount: true,
            createdAt: true
          }
        });
        console.log('📋 Last 5 orders in database:');
        recentOrders.forEach(order => {
          console.log(`  - ID: ${order.id}, Type: ${order.orderType}, Status: ${order.paymentStatus}, Amount: ${order.totalAmount}`);
        });

        return res.sendStatus(404);
      }

      console.log('✅ Order found in database:');
      console.log('  - Order ID:', existingOrder.id);
      console.log('  - User:', existingOrder.user?.telegramId);
      console.log('  - Order type:', existingOrder.orderType);
      console.log('  - Current status:', existingOrder.status);
      console.log('  - Current payment status:', existingOrder.paymentStatus);
      console.log('  - Total amount:', existingOrder.totalAmount);

      // Обновляем заказ
      console.log('🔄 Updating order status to CONFIRMED...');
      const updatedOrder = await prisma.order.update({
        where: { id: orderId },
        data: {
          paymentStatus: 'CONFIRMED',
          status: 'PROCESSING',
          updatedAt: new Date()
        }
      });

      console.log('✅ Order updated successfully!');
      console.log('  - New status:', updatedOrder.status);
      console.log('  - New payment status:', updatedOrder.paymentStatus);
      console.log('🎉 === PAYMENT PROCESSING COMPLETED ===\n');

      return res.sendStatus(200);
    }

    // Обычное сообщение (не платёж)
    if (message && !message.successful_payment) {
      console.log('💬 Regular message received (not a payment)');
      console.log('  - From:', message.from?.id, message.from?.username);
      console.log('  - Text:', message.text?.substring(0, 50));
      return res.sendStatus(200);
    }

    // Pre-checkout query (перед оплатой)
    if (pre_checkout_query) {
      console.log('💳 === PRE-CHECKOUT QUERY ===');
      console.log('  - Query ID:', pre_checkout_query.id);
      console.log('  - From:', pre_checkout_query.from?.id);
      console.log('  - Currency:', pre_checkout_query.currency);
      console.log('  - Total amount:', pre_checkout_query.total_amount);
      console.log('  - Invoice payload:', pre_checkout_query.invoice_payload);

      // Валидация payload
      try {
        const parsed = JSON.parse(pre_checkout_query.invoice_payload);
        console.log('  - Parsed payload:', parsed);

        if (!parsed.orderId) {
          console.error('❌ orderId missing in pre-checkout payload');
          await fetch(
            `https://api.telegram.org/bot${BOT_TOKEN}/answerPreCheckoutQuery`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                pre_checkout_query_id: pre_checkout_query.id,
                ok: false,
                error_message: "Invalid order ID"
              })
            }
          );
          return res.sendStatus(400);
        }
      } catch (err) {
        console.error('❌ Invalid JSON in pre-checkout payload');
      }

      // Отвечаем Telegram, что всё ок
      const answerResponse = await fetch(
        `https://api.telegram.org/bot${BOT_TOKEN}/answerPreCheckoutQuery`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pre_checkout_query_id: pre_checkout_query.id,
            ok: true
          })
        }
      );

      const answerData = await answerResponse.json();
      console.log('✅ Pre-checkout answer sent:', answerData);
      console.log('🎉 === PRE-CHECKOUT COMPLETED ===\n');
      return res.sendStatus(200);
    }

    console.log('⚠️ Unknown webhook type - neither payment nor pre-checkout');
    res.sendStatus(200);
  } catch (err) {
    console.error('❌ === ERROR IN TELEGRAM WEBHOOK ===');
    console.error('Error name:', err.name);
    console.error('Error message:', err.message);
    console.error('Error code:', err.code);

    if (err.meta) {
      console.error('Prisma meta:', JSON.stringify(err.meta, null, 2));
    }

    console.error('Stack trace:', err.stack);
    console.log('💥 === WEBHOOK PROCESSING FAILED ===\n');
    res.sendStatus(500);
  }
});
app.post('/setup-webhook', async (req, res) => {
  try {
    const webhookUrl = `${process.env.WEBHOOK_URL}/webhook/telegram`;

    const response = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: webhookUrl,
          allowed_updates: ['pre_checkout_query', 'message'] // ✅ Указываем типы
        })
      }
    );

    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Проверка webhook
app.get('/webhook-info', async (req, res) => {
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`
    );
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// Routes
app.use('/api/users', require('./routes/users'));
app.use('/api/products', require('./routes/products'));
app.use('/api/bundles', require('./routes/bundles'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/wishlist', require('./routes/wishlist'));
app.use('/api/services', require('./routes/services'));
app.use('/api/subscriptions', require('./routes/subscriptions'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/support', require('./routes/support'));
app.use('/api/girl', require('./routes/girl'));


// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
