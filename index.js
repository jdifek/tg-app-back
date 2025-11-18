
// server.js
const express = require('express');
const path = require('path');

const cors = require('cors');
const helmet = require('helmet');
const uploadRoutes = require('./routes/upload');
const rateLimit = require('express-rate-limit');
const { initBot } = require('./telegram/bot');
const prisma = require('./prisma/prisma');

require('dotenv').config();

const app = express();

const PORT = process.env.PORT || 3001;
app.set('trust proxy', 1);
// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);
initBot();
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api/upload', uploadRoutes);
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

// ✅ Автоматическая установка webhook при старте
async function setupWebhook() {
  if (!WEBHOOK_URL) {
    console.log('⚠️ WEBHOOK_URL not set, skipping webhook setup');
    return;
  }

  try {
    const webhookUrl = `${WEBHOOK_URL}/webhook/telegram`;
    
    console.log('🔧 Setting up webhook:', webhookUrl);
    
    const response = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: webhookUrl,
          allowed_updates: ['message', 'pre_checkout_query']
        })
      }
    );

    const data = await response.json();
    
    if (data.ok) {
      console.log('✅ Webhook set successfully:', webhookUrl);
    } else {
      console.error('❌ Failed to set webhook:', data);
    }

    // Проверяем статус
    const infoResponse = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`
    );
    const info = await infoResponse.json();
    console.log('📋 Webhook info:', JSON.stringify(info, null, 2));
    
  } catch (err) {
    console.error('❌ Error setting up webhook:', err.message);
  }
}

// Webhook for Telegram payment notifications
// server.js - ИСПРАВЛЕННЫЙ WEBHOOK
app.post('/webhook/telegram', async (req, res) => {
  console.log('\n🔔 === TELEGRAM WEBHOOK RECEIVED ===');
  console.log('📥 Full request body:', JSON.stringify(req.body, null, 2));

  try {
    const { pre_checkout_query, message, update_id } = req.body;

    console.log('🆔 Update ID:', update_id);

    // ✅ PRE-CHECKOUT QUERY
    if (pre_checkout_query) {
      console.log('💳 === PRE-CHECKOUT QUERY ===');
      
      try {
        const parsed = JSON.parse(pre_checkout_query.invoice_payload);
        
        if (!parsed.orderId) {
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

      await fetch(
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

      console.log('✅ Pre-checkout answer sent');
      return res.sendStatus(200);
    }

    // ✅ SUCCESSFUL PAYMENT
    if (message?.successful_payment) {
      console.log('💰 === SUCCESSFUL PAYMENT DETECTED ===');

      const payment = message.successful_payment;
      const { invoice_payload, total_amount, telegram_payment_charge_id } = payment;

      let orderId;
      try {
        const parsed = JSON.parse(invoice_payload);
        orderId = parsed.orderId;
        console.log('🆔 Extracted orderId:', orderId);

        if (!orderId) {
          console.error('❌ orderId is missing');
          return res.sendStatus(400);
        }
      } catch (err) {
        console.error("❌ Failed to parse invoice_payload");
        return res.sendStatus(400);
      }

      // Получаем заказ с полными данными
      const existingOrder = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          user: true,
          orderItems: {
            include: {
              product: true,
              bundle: {
                include: {
                  images: true,
                  videos: true
                }
              }
            }
          }
        }
      });

      if (!existingOrder) {
        console.error(`❌ Order ${orderId} NOT FOUND`);
        return res.sendStatus(404);
      }

      console.log('✅ Order found:', existingOrder.id);

      // Обновляем статус заказа
      const updatedOrder = await prisma.order.update({
        where: { id: orderId },
        data: {
          paymentStatus: 'CONFIRMED',
          status: 'PROCESSING',
          screenshot: telegram_payment_charge_id,
          updatedAt: new Date()
        }
      });

      console.log('✅ Order status updated to CONFIRMED');

      // 🎁 ОТПРАВКА КОНТЕНТА ПОЛЬЗОВАТЕЛЮ
      const userId = message.from.id;

      try {
        // Отправка благодарности
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: userId,
            text: `✅ Payment confirmed!\n\n💫 Order #${orderId}\n💰 Amount: ${total_amount} Stars\n\n🎉 Thank you for your purchase!`,
            parse_mode: 'HTML'
          })
        });

        // 💖 Обработка DONATION
        if (existingOrder.orderType === 'DONATION') {
          let thankYouMessage = `🙏 Thank you so much for your donation of $${existingOrder.totalAmount}! ❤️`;

          if (existingOrder.donationMessage) {
            thankYouMessage += `\n\n📩 Your message:\n"${existingOrder.donationMessage}"`;
          }

          await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: userId,
              text: thankYouMessage
            })
          });

          console.log(`✅ Donation thank-you sent to user ${userId}`);
        } else {
          // Отправка товаров/бандлов
          for (const item of existingOrder.orderItems) {
            if (item.product) {
              await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: userId,
                  photo: item.product.image,
                  caption: `📦 ${item.product.name}\n💰 Price: ${item.product.price} USD\n\n${item.product.description || ''}`
                })
              });
            } else if (item.bundle) {
              if (item.bundle.image) {
                await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    chat_id: userId,
                    photo: item.bundle.image,
                    caption: `🎁 ${item.bundle.name}\n💰 Price: ${item.bundle.price} USD\n\n${item.bundle.description || ''}`
                  })
                });
              }

              for (const img of item.bundle.images || []) {
                await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    chat_id: userId,
                    photo: img.url
                  })
                });
              }

              for (const vid of item.bundle.videos || []) {
                await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendVideo`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    chat_id: userId,
                    video: vid.url
                  })
                });
              }
            }
          }

          // Обработка специальных типов заказов
          if (existingOrder.orderType === 'CUSTOM_VIDEO') {
            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: userId,
                text: `📹 Your personalized video will be ready soon!`
              })
            });
          } else if (existingOrder.orderType === 'VIDEO_CALL') {
            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: userId,
                text: `📞 Thank you! Our manager will contact you soon.`
              })
            });
          } else if (existingOrder.orderType === 'VIP') {
            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: userId,
                text: `👑 You are now a VIP client!`
              })
            });
          } else if (existingOrder.orderType === 'RATING') {
            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: userId,
                text: `⭐ Thank you for your support!`
              })
            });
          }

          console.log(`✅ Content delivered to user ${userId}`);
        }

      } catch (err) {
        console.error('❌ Error sending content:', err);
      }

      console.log('🎉 === PAYMENT PROCESSING COMPLETED ===\n');
      return res.sendStatus(200);
    }

    console.log('⚠️ Unknown webhook type');
    res.sendStatus(200);
  } catch (err) {
    console.error('❌ === ERROR IN WEBHOOK ===');
    console.error('Error:', err.message);
    console.error('Stack:', err.stack);
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
    // Устанавливаем webhook после запуска сервера
    setTimeout(() => {
      setupWebhook();
    }, 2000); // Ждём 2 секунды, чтобы сервер точно запустился
});
