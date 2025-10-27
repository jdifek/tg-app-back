
// server.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { PrismaClient } = require('@prisma/client');

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
// Webhook for Telegram payment notifications
app.post('/webhook/telegram', async (req, res) => {
  try {
    const { pre_checkout_query, successful_payment } = req.body;

    // ✅ Обработка pre_checkout_query
    if (pre_checkout_query) {
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerPreCheckoutQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pre_checkout_query_id: pre_checkout_query.id,
          ok: true
        })
      });

      return res.sendStatus(200);
    }

    // ✅ Обработка успешной оплаты
    if (successful_payment) {
      const { invoice_payload } = successful_payment;

      // payload должен быть JSON: { "orderId": "..." }
      let orderId;
      try {
        orderId = JSON.parse(invoice_payload).orderId;
      } catch (err) {
        console.error("Ошибка парсинга invoice_payload:", err);
        return res.sendStatus(400);
      }

      await prisma.order.update({
        where: { id: orderId },
        data: {
          paymentStatus: 'CONFIRMED',
          status: 'PROCESSING',
          updatedAt: new Date()
        }
      });

      return res.sendStatus(200);
    }

    // Если это какой-то другой апдейт
    res.sendStatus(200);
  } catch (err) {
    console.error('Ошибка в Telegram Webhook:', err);
    res.sendStatus(500);
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
