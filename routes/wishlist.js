const express = require('express');
const { PrismaClient } = require('@prisma/client');
const multer = require('multer');
const supabase = require('../supabaseClient');

const router = express.Router();
const prisma = new PrismaClient();
const storage = multer.memoryStorage();
const upload = multer({ storage });
// GET /api/wishlist - получить все активные элементы wishlist
router.get('/', async (req, res) => {
  try {
    const wishlistItems = await prisma.wishlistItem.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(wishlistItems);
  } catch (error) {
    console.error('Error fetching wishlist:', error);
    res.status(500).json({ error: 'Failed to fetch wishlist' });
  }
});

// POST /api/wishlist - добавить новый элемент в wishlist
router.post('/', upload.single('image'), async (req, res) => {
  try {
    const { name, description, price } = req.body;
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
    const newItem = await prisma.wishlistItem.create({
      data: { name, description, image: imageUrl, price: +price },
    });
    res.status(201).json({
      result: true,
      wishlist: newItem,
    });
  } catch (error) {
    console.error('Error creating wishlist item:', error);
    res.status(400).json({
      result: false,
      error: 'Invalid data format',
    });
  }
});

// DELETE /api/wishlist/:id - удалить элемент wishlist по id
router.delete('/:id' , async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.wishlistItem.delete({ where: { id: id } });
    res.status(200).json({
      result: true,
    });
  } catch (error) {
    console.error('Error deleting wishlist item:', error);
    res.status(404).json({
      result: false,
      error: 'Wishlist item not found',
    });
  }
});

router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const response = await prisma.wishlistItem.findUnique({
      where: { id: id },
    });

    if (!response) {
      return res.status(404).json({
        result: false,
        error: 'Wishlist item not found',
      });
    }

    res.status(200).json({
      result: true,
      wishlist: response,
    });
  } catch (error) {
    console.error('Error fetching wishlist item:', error);
    res.status(500).json({
      result: false,
      error: 'Failed to fetch wishlist item',
    });
  }
});
// PATCH /api/wishlist/:id - обновить элемент wishlist по id (частичное обновление)
router.patch('/:id' , upload.single('image'), async (req, res) => {
  const { id } = req.params;
  const { name, description, price, isActive } = req.body;
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
  try {
    const updatedItem = await prisma.wishlistItem.update({
      where: { id: id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(image !== undefined && { image: imageUrl }),
        ...(price !== undefined && { price: +price }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    res.status(200).json({
      result: true,
      wishlist: updatedItem,
    });
  } catch (error) {
    console.error('Error updating wishlist item:', error);
    res.status(404).json({
      result: false,
      error: 'Wishlist item not found or invalid data',
    });
  }
});

module.exports = router;
