const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { body, validationResult } = require('express-validator');

const router = express.Router();
const multer = require('multer');
const supabase = require('../supabaseClient');
const prisma = new PrismaClient();

// Настраиваем multer (в память, без сохранения на диск)
const storage = multer.memoryStorage();
const upload = multer({ storage });

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
// PUT /api/admin/bundles/:id - обновить бандл
router.post(
  '/bundles',
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

      const { name, price, description,content } = req.body;
      let imageUrl = null;
      let parsedContent;
      try {
        parsedContent = content ? JSON.parse(content) : undefined;
      } catch (e) {
        return res.status(400).json({ error: "Invalid JSON in content" });
      }
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
          content,
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
    const { name, price, description, content } = req.body;

    let imageUrl = undefined;
    let parsedContent;
    try {
      parsedContent = content ? JSON.parse(content) : undefined;
    } catch (e) {
      return res.status(400).json({ error: "Invalid JSON in content" });
    }
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
        content,
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

// GET /api/admin/orders - получить все заказы
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

module.exports = router;