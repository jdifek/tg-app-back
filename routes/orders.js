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
  📦 <b>New order created!</b>
  ───────────────
  🆔 <b>Order ID:</b> ${order.id}
  👤 <b>User:</b> ${order.firstName}${username ? ` (@${username})` : ''} 
  📗 <b>Type:</b> ${order.orderType}
  💰 <b>Amount:</b> ${order.totalAmount} USD
  ${order.orderType === "DONATION" && order.donationMessage ? `💌 <b>Message:</b> ${order.donationMessage}` : ""}
  ───────────────
  ⚙️ Go to admin panel to process.
  `;

  for (const adminId of ADMIN_IDS) {
    try {
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: adminId,
        text: message,
        parse_mode: 'HTML',
      });
    } catch (err) {
      console.error(`❌ Error sending notification to admin ${adminId}:`, err.response?.data || err.message);
    }
  }
}

router.get('/payments', async (req, res) => {
  try {
    const response = await prisma.payments.findUnique({ where: { id: 1 } })
    res.status(200).json({
      success: true,
      payments: response
    })
  } catch (error) {
    console.log(error);
    res.status(500).json({
      details: error.response?.data || error.message,
    })
  }
})

// POST /api/orders/stars - Create Stars invoice
router.post("/stars", async (req, res) => {
  const { title, description, amount, userId, orderType, donationMessage } = req.body;

  console.log("📥 Stars payment request:", { title, description, amount, userId, orderType, donationMessage });

  if (!userId) {
    return res.status(400).json({ error: "UserId is required" });
  }

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: "Valid amount is required" });
  }

  try {
    // Find or create user
    let user = await prisma.user.findUnique({
      where: { telegramId: String(userId) }
    });

    if (!user) {
      user = await prisma.user.create({
        data: { telegramId: String(userId) }
      });
      console.log("✅ Created new user:", user.id);
    }

    // Create order with STARS payment type
    const order = await prisma.order.create({
      data: {
        userId: user.id,
        orderType: orderType,
        paymentMethod: "STARS",
        totalAmount: amount / 100, // Convert stars to USD (approximate)
        status: "PENDING",
        paymentStatus: "PENDING",
        donationMessage: donationMessage || null, // <-- Сохраняем сообщение, если есть
      },
    });

    console.log("✅ Order created:", order.id);

    // Create invoice via Telegram Bot API
    const telegramResponse = await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`,
      {
        title: title || "Order Payment",
        description: description || `Payment for order ${order.id}`,
        payload: JSON.stringify({ orderId: order.id }),
        currency: "XTR",
        prices: [{
          label: title || "Payment",
          amount: Math.round(amount)
        }],
      }
    );

    if (!telegramResponse.data.ok) {
      console.error("❌ Telegram API error:", telegramResponse.data);
      return res.status(400).json({
        error: telegramResponse.data.description || "Failed to create invoice"
      });
    }

    const invoiceUrl = telegramResponse.data.result;
    console.log("✅ Invoice created:", invoiceUrl);

    // Update order with invoice URL
    await prisma.order.update({
      where: { id: order.id },
      data: {
        screenshot: invoiceUrl,
        updatedAt: new Date()
      }
    });

    const response = {
      invoice_url: invoiceUrl,
      order_id: order.id
    };

    console.log("📤 Sending response to client:", response);

    res.json(response);

  } catch (err) {
    console.error("❌ Error creating Stars invoice:", err);

    if (err.response) {
      console.error("Telegram API error details:", err.response.data);
    }

    res.status(500).json({
      error: "Failed to create invoice",
      details: err.message
    });
  }
});

// POST /api/orders - Create order
router.post('/', [
  body('userId').notEmpty().withMessage('User ID is required'),
  body('orderType').isIn(['PRODUCT', 'BUNDLE', 'VIP', 'CUSTOM_VIDEO', 'VIDEO_CALL', 'RATING', 'DONATION']).withMessage('Invalid order type'),
], async (req, res) => {
  try {
    console.log('🔍 Incoming order request:', req.body);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.warn('⚠️ Validation errors:', errors.array());
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
      country,
      donationMessage,
      totalAmount: customAmount
    } = req.body;

    console.log(`🧾 Processing order type: ${orderType}`);

    // Check user
    let user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      console.log(`👤 User not found. Creating new user with ID: ${userId}`);
      user = await prisma.user.create({
        data: { id: userId, telegramId: telegramId }
      });
    } else {
      console.log(`👤 User found: ${user.username || 'No username'}`);
    }

    let totalAmount = 0;
    const orderItems = [];

    // Process different order types
    if (orderType === 'PRODUCT' || orderType === 'BUNDLE') {
      if (!items || items.length === 0) {
        console.error('❌ No items provided for PRODUCT or BUNDLE order');
        return res.status(400).json({ error: 'Items are required for PRODUCT or BUNDLE order' });
      }

      for (const item of items) {
        console.log(`🔎 Processing item:`, item);

        if (item.type === 'product') {
          const product = await prisma.product.findUnique({
            where: { id: item.id }
          });

          if (product) {
            const quantity = item.quantity || 1;
            totalAmount += product.price * quantity;
            orderItems.push({
              productId: product.id,
              quantity,
              price: product.price
            });
            console.log(`✅ Added product: ${product.name}, Quantity: ${quantity}, Subtotal: ${product.price * quantity}`);
          } else {
            console.warn(`⚠️ Product not found: ${item.id}`);
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
            console.log(`✅ Added bundle: ${bundle.name}, Price: ${bundle.price}`);
          } else {
            console.warn(`⚠️ Bundle not found: ${item.id}`);
          }
        }
      }
    } else if (orderType === 'VIP') {
      totalAmount = 49.99;
      console.log(`🎖️ VIP order, Price: ${totalAmount}`);
    } else if (orderType === 'CUSTOM_VIDEO') {
      totalAmount = 99.99;
      console.log(`🎬 Custom video order, Price: ${totalAmount}`);
    } else if (orderType === 'VIDEO_CALL') {
      totalAmount = 149.99;
      console.log(`📞 Video call order, Price: ${totalAmount}`);
    } else if (orderType === 'RATING') {
      totalAmount = 19.99;
      console.log(`⭐ Rating order, Price: ${totalAmount}`);
    }else if (orderType === 'DONATION') {
      totalAmount = customAmount || (items?.[0]?.price ?? 0);
      console.log(`💖 Donation order, Amount: ${totalAmount}`);
    }

    console.log(`💰 Total calculated amount: ${totalAmount}`);

    if ((orderType === 'PRODUCT' || orderType === 'BUNDLE') && orderItems.length === 0) {
      console.error('❌ No valid order items were created for PRODUCT or BUNDLE');
      return res.status(400).json({ error: 'No valid items found for order' });
    }

    // Create order
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
        donationMessage,
        zipCode,
        country,
        orderItems: orderItems.length > 0 ? { create: orderItems } : undefined
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

    console.log(`✅ Order created successfully: ID ${order.id}`);
    await notifyAdmins(order, username);
    res.status(201).json(order);
  } catch (error) {
    console.error('🔥 Error creating order:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});


// PATCH /api/orders/:id-rating - Attach rating screenshot
router.patch('/:id-rating', upload.single('rating'), async (req, res) => {
  try {
    const { id } = req.params;
    const existingOrder = await prisma.order.findUnique({ where: { id } });

    if (!existingOrder) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Rating file is required' });
    }

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

// PATCH /api/orders/:id - Attach screenshot
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

// PATCH /api/orders/:id/payment-status - Update payment status
// PATCH /api/orders/:id/payment-status - Update payment status (admin/manual)
router.patch('/:id/payment-status', [
  body('paymentStatus')
    .isIn(['PENDING', 'AWAITING_CHECK', 'CONFIRMED', 'FAILED'])
    .withMessage('Invalid payment status'),
], async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentStatus } = req.body;

    const updatedOrder = await prisma.order.update({
      where: { id },
      data: { paymentStatus, updatedAt: new Date() },
      include: {
        user: true,
        orderItems: {
          include: {
            product: true,
            bundle: {
              include: {
                images: true,
                videos: true,
              },
            },
          },
        },
      },
    });

    console.log(`🧾 Payment status for order #${id} updated to ${paymentStatus}`);

    // --- If admin confirms payment manually, send content via Telegram ---
    if (paymentStatus === 'CONFIRMED' && updatedOrder.user?.telegramId) {
      const userId = updatedOrder.user.telegramId;

      try {
        if (updatedOrder.orderType === 'DONATION') {
          // 💖 Special handling for donations
          let thankYouMessage = `🙏 Thank you so much for your donation of $${updatedOrder.totalAmount}! ❤️`;

          if (updatedOrder.donationMessage) {
            thankYouMessage += `\n\n📩 Your message:\n"${updatedOrder.donationMessage}"`;
          }

          await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: userId,
            text: thankYouMessage,
          });

          console.log(`✅ Donation thank-you message sent to user ${userId}`);
        } else {
          // Notify user
          await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: userId,
            text: `✅ Your payment for order #${id} has been confirmed!\n\n🎉 Thank you for your purchase!`,
          });

          // Send order content
          for (const item of updatedOrder.orderItems) {
            if (item.product) {
              await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
                chat_id: userId,
                photo: item.product.image,
                caption: `📦 ${item.product.name}\n💰 Price: ${item.product.price} USD\n\n${item.product.description || ''}`,
              });
            } else if (item.bundle) {
              if (item.bundle.image) {
                await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
                  chat_id: userId,
                  photo: item.bundle.image,
                  caption: `🎁 ${item.bundle.name}\n💰 Price: ${item.bundle.price} USD\n\n${item.bundle.description || ''}`,
                });
              }

              for (const img of item.bundle.images || []) {
                await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
                  chat_id: userId,
                  photo: img.url,
                });
              }

              for (const vid of item.bundle.videos || []) {
                await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendVideo`, {
                  chat_id: userId,
                  video: vid.url,
                });
              }
            }
          }

          // Handle special order types
          if (updatedOrder.orderType === 'CUSTOM_VIDEO') {
            await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
              chat_id: userId,
              text: `📹 Your personalized video will be ready soon! We’ll notify you once it’s completed.`,
            });
          } else if (updatedOrder.orderType === 'VIDEO_CALL') {
            await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
              chat_id: userId,
              text: `📞 Thank you! Our manager will contact you soon to schedule your video call.`,
            });
          } else if (updatedOrder.orderType === 'VIP') {
            await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
              chat_id: userId,
              text: `👑 You are now a VIP client! Access exclusive materials here: https://t.me/your_vip_channel`,
            });
          } else if (updatedOrder.orderType === 'RATING') {
            await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
              chat_id: userId,
              text: `⭐ Thank you for your support! Your rating has been successfully recorded.`,
            });
          }

          console.log(`✅ Content successfully delivered to user ${userId}`);
        }
      } catch (err) {
        console.error('❌ Error sending content to user:', err.response?.data || err.message);
      }
    }

    res.json(updatedOrder);
  } catch (error) {
    console.error('Error updating payment status:', error);
    res.status(500).json({ error: 'Failed to update payment status' });
  }
});



// PATCH /api/orders/:id/status - Update order status
router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['PENDING', 'PROCESSING', 'COMPLETED', 'CANCELLED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        error: 'Invalid order status',
        validStatuses: validStatuses
      });
    }

    const updatedOrder = await prisma.order.update({
      where: { id },
      data: {
        status,
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

// GET /api/orders/:userId - Get user orders
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

// GET /api/orders/detail/:id - Get order details
router.get('/detail/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`🔍 Fetching order details for ID: ${id}`);

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
      console.log(`❌ Order not found: ${id}`);
      return res.status(404).json({ error: 'Order not found' });
    }

    console.log(`✅ Order found:`, {
      id: order.id,
      status: order.status,
      paymentStatus: order.paymentStatus,
      totalAmount: order.totalAmount
    });

    res.json(order);
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// POST /webhook/telegram - Webhook for Telegram payments
// Note: This should be registered at the root level, not under /api/orders
// If your webhook is at /webhook/telegram, create a separate route file
router.post('/telegram-payment-webhook', async (req, res) => {
  try {
    console.log('📥 Telegram webhook received:', JSON.stringify(req.body, null, 2));

    const update = req.body;

    // Handle pre_checkout_query (answer "OK" to allow payment)
    if (update.pre_checkout_query) {
      const { id, invoice_payload } = update.pre_checkout_query;

      console.log('✅ Pre-checkout query received:', id);

      // Answer pre-checkout query (required!)
      await axios.post(
        `https://api.telegram.org/bot${BOT_TOKEN}/answerPreCheckoutQuery`,
        {
          pre_checkout_query_id: id,
          ok: true,
        }
      );

      return res.sendStatus(200);
    }

    // Handle successful payment
    if (update.message?.successful_payment) {
      const { invoice_payload, total_amount, telegram_payment_charge_id } =
        update.message.successful_payment;

      console.log('💰 Successful payment received!');
      console.log('Payload:', invoice_payload);
      console.log('Amount:', total_amount, 'stars');

      try {
        const payload = JSON.parse(invoice_payload);
        const { orderId } = payload;

        if (orderId) {
          // Update order status in database
          const updatedOrder = await prisma.order.update({
            where: { id: orderId },
            data: {
              paymentStatus: 'CONFIRMED',
              status: 'PROCESSING',
              screenshot: telegram_payment_charge_id, // Save Telegram charge ID
              updatedAt: new Date(),
            },
            include: {
              orderItems: {
                include: {
                  product: true,
                  bundle: {
                    include: {
                      images: true,
                      videos: true,
                    },
                  },
                },
              },
            },
          });

          console.log('✅ Order updated:', orderId);

          const userId = update.message.from.id;

          // Notify user about successful payment
          await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: userId,
            text: `✅ Payment confirmed!\n\n💫 Order #${orderId}\n💰 Amount: ${total_amount} Stars\n\n🎉 Thank you for your purchase!`,
            parse_mode: 'HTML',
          });

          // Notify admins
          await notifyAdmins(updatedOrder, update.message.from.username);

          // --- Send content to user after payment confirmation ---
          try {
            await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
              chat_id: userId,
              text: `🎉 Thank you for your payment!\nYour order #${orderId} has been confirmed ✅`,
            });

            // Send purchased products or bundles
            for (const item of updatedOrder.orderItems) {
              if (item.product) {
                // Send single product
                await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
                  chat_id: userId,
                  photo: item.product.image,
                  caption: `📦 ${item.product.name}\n💰 Price: ${item.product.price} USD\n\n${item.product.description || ''}`,
                });
              } else if (item.bundle) {
                // Send main bundle image
                if (item.bundle.image) {
                  await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
                    chat_id: userId,
                    photo: item.bundle.image,
                    caption: `🎁 ${item.bundle.name}\n💰 Price: ${item.bundle.price} USD\n\n${item.bundle.description || ''}`,
                  });
                }

                // Send all additional images
                for (const img of item.bundle.images || []) {
                  await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
                    chat_id: userId,
                    photo: img.url,
                  });
                }

                // Send all videos
                for (const vid of item.bundle.videos || []) {
                  await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendVideo`, {
                    chat_id: userId,
                    video: vid.url,
                  });
                }
              }
            }

            // Handle special order types
            if (updatedOrder.orderType === 'CUSTOM_VIDEO') {
              await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                chat_id: userId,
                text: `📹 Your personalized video will be ready soon! We’ll notify you once it’s completed.`,
              });
            } else if (updatedOrder.orderType === 'VIDEO_CALL') {
              await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                chat_id: userId,
                text: `📞 Thank you! Our manager will contact you soon to schedule your video call.`,
              });
            } else if (updatedOrder.orderType === 'VIP') {
              await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                chat_id: userId,
                text: `👑 You are now a VIP client! Access exclusive materials here: https://t.me/your_vip_channel`,
              });
            } else if (updatedOrder.orderType === 'RATING') {
              await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                chat_id: userId,
                text: `⭐ Thank you for your support! Your rating has been successfully recorded.`,
              });
            }

            console.log(`✅ Content successfully delivered to user ${userId}`);
          } catch (err) {
            console.error(
              '❌ Error sending content to user:',
              err.response?.data || err.message
            );
          }
        }
      } catch (err) {
        console.error('❌ Error processing payment:', err);
      }
    }


    res.sendStatus(200);
  } catch (err) {
    console.error('❌ Webhook error:', err);
    res.sendStatus(500);
  }
});

module.exports = router;