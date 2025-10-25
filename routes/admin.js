const express = require('express');
const { body, validationResult } = require('express-validator');
const axios = require('axios');
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

const router = express.Router();
const multer = require('multer');
const supabase = require('../supabaseClient');
const prisma = require('../prisma/prisma');

// Настраиваем multer (в память, без сохранения на диск)
const storage = multer.memoryStorage();
const upload = multer({ storage });
// PATCH /api/orders/:id/payment-status - обновить статус платежа
router.patch('/:id/payment-status', async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentStatus } = req.body;

    // Валидация статуса платежа
    const validPaymentStatuses = ['PENDING', 'AWAITING_CHECK', 'CONFIRMED', 'FAILED'];
    if (!validPaymentStatuses.includes(paymentStatus)) {
      return res.status(400).json({ 
        error: 'Invalid payment status',
        validStatuses: validPaymentStatuses 
      });
    }

    const updatedOrder = await prisma.order.update({
      where: { id },
      data: { 
        paymentStatus,
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
    console.error('Error updating payment status:', error);
    res.status(500).json({ error: 'Failed to update payment status' });
  }
});
// ==================== CREATE PRODUCT ====================
router.post(
  '/products',
  upload.single('image'), // принимаем файл с фронта
  [
    body('name').notEmpty().withMessage('Name is required'),
    body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { name, price, description } = req.body;
      let imageUrl = null;

      // Если есть файл, загружаем в Supabase
      if (req.file) {
        const fileExt = req.file.originalname.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { data, error: uploadError } = await supabase.storage
          .from(process.env.SUPABASE_BUCKET)
          .upload(fileName, req.file.buffer, {
            contentType: req.file.mimetype,
            upsert: false,
          });

        if (uploadError) {
          console.error('Supabase upload error:', uploadError);
          return res.status(500).json({ error: 'Failed to upload image' });
        }

        const { data: publicUrlData } = supabase.storage
          .from(process.env.SUPABASE_BUCKET)
          .getPublicUrl(fileName);

        imageUrl = publicUrlData.publicUrl;
      }

      // Сохраняем продукт в базу
      const product = await prisma.product.create({
        data: {
          name,
          price: parseFloat(price),
          description,
          image: imageUrl,
        },
      });

      res.status(201).json(product);
    } catch (error) {
      console.error('Error creating product:', error);
      res.status(500).json({ error: 'Failed to create product' });
    }
  }
);

// ==================== UPDATE PRODUCT ====================
router.put('/products/:id', upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, description } = req.body;

    let imageUrl = undefined;

    // Если новое фото загружено — заливаем в Supabase
    if (req.file) {
      const fileExt = req.file.originalname.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from(process.env.SUPABASE_BUCKET)
        .upload(fileName, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false,
        });

      if (uploadError) {
        console.error('Supabase upload error:', uploadError);
        return res.status(500).json({ error: 'Failed to upload new image' });
      }

      const { data: publicUrlData } = supabase.storage
        .from(process.env.SUPABASE_BUCKET)
        .getPublicUrl(fileName);

      imageUrl = publicUrlData.publicUrl;
    }

  
    // Обновляем продукт
    const updated = await prisma.product.update({
      where: { id },
      data: {
        name,
        price: price ? parseFloat(price) : undefined,
        description,
        image: imageUrl,
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});
// ==================== CREATE BUNDLE ====================
router.post(
  '/bundles',
  upload.single('image'),
  [
    body('name').notEmpty().withMessage('Name is required'),
    body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { name, price, description, photos, videos, exclusive } = req.body;

      let imageUrl = null;

      // Загружаем фото в Supabase
      if (req.file) {
        const fileExt = req.file.originalname.split('.').pop();
        const fileName = `bundles/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from(process.env.SUPABASE_BUCKET)
          .upload(fileName, req.file.buffer, {
            contentType: req.file.mimetype,
            upsert: false,
          });

        if (uploadError) {
          console.error('Supabase upload error:', uploadError);
          return res.status(500).json({ error: 'Failed to upload image' });
        }

        const { data: publicUrlData } = supabase.storage
          .from(process.env.SUPABASE_BUCKET)
          .getPublicUrl(fileName);

        imageUrl = publicUrlData.publicUrl;
      }

      // Создаём бандл
      const bundle = await prisma.bundle.create({
        data: {
          name,
          price: parseFloat(price),
          description,
          photos: photos ? parseInt(photos) : 0,
          videos: videos ? parseInt(videos) : 0,
          exclusive: exclusive === 'true',
          image: imageUrl,
        },
      });

      res.status(201).json(bundle);
    } catch (error) {
      console.error('Error creating bundle:', error);
      res.status(500).json({ error: 'Failed to create bundle' });
    }
  }
);

// ==================== UPDATE BUNDLE ====================
router.put('/bundles/:id', upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, description, photos, videos, exclusive } = req.body;

    let imageUrl = undefined;

    // Если новое фото загружено — обновляем в Supabase
    if (req.file) {
      const fileExt = req.file.originalname.split('.').pop();
      const fileName = `bundles/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from(process.env.SUPABASE_BUCKET)
        .upload(fileName, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false,
        });

      if (uploadError) {
        console.error('Supabase upload error:', uploadError);
        return res.status(500).json({ error: 'Failed to upload new image' });
      }

      const { data: publicUrlData } = supabase.storage
        .from(process.env.SUPABASE_BUCKET)
        .getPublicUrl(fileName);

      imageUrl = publicUrlData.publicUrl;
    }

    // Обновляем бандл
    const updatedBundle = await prisma.bundle.update({
      where: { id },
      data: {
        name,
        price: price ? parseFloat(price) : undefined,
        description,
        photos: photos ? parseInt(photos) : 0,
        videos: videos ? parseInt(videos) : 0,
        exclusive: exclusive === 'true',
        image: imageUrl,
      },
    });

    res.json(updatedBundle);
  } catch (error) {
    console.error('Error updating bundle:', error);
    res.status(500).json({ error: 'Failed to update bundle' });
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

// POST /api/admin/send-feedback
router.post('/send-feedback', async (req, res) => {
  try {
    const { userId, orderId, message } = req.body;

    if (!userId || !orderId || !message?.trim()) {
      return res.status(400).json({
        error: 'userId, orderId, and non-empty message are required',
      });
    }

    // 1️⃣ Получаем Telegram ID пользователя
    const user = await prisma.user.findUnique({
      where: { telegramId: userId.toString() },
      select: { telegramId: true },
    });
    

    if (!user || !user.telegramId) {
      return res.status(404).json({
        error: 'User not found or missing Telegram ID',
      });
    }

    // 2️⃣ Формируем сообщение
    const feedbackMessage = `
🌟 <b>Dick Rating Feedback</b>
━━━━━━━━━━━━━━━━━━━━
📦 <b>Order ID:</b> <code>${orderId.slice(0, 8)}...</code>

📝 <b>Your Rating:</b>
${message}

━━━━━━━━━━━━━━━━━━━━
💜 Thank you for using our service!
    `.trim();

    // 3️⃣ Отправляем через Telegram API
    const telegramResponse = await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        chat_id: user.telegramId,
        text: feedbackMessage,
        parse_mode: 'HTML',
      }
    );

    if (!telegramResponse.data.ok) {
      throw new Error('Failed to send Telegram message');
    }

    res.json({ success: true, message: 'Feedback sent successfully' });
  } catch (error) {
    console.error('Error sending feedback:', error);
    res.status(500).json({
      error: 'Failed to send feedback',
      details: error.response?.data || error.message,
    });
  }
});

module.exports = router;