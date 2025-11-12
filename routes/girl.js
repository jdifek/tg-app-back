const express = require('express');
const { PrismaClient } = require('@prisma/client');
const multer = require('multer');
const supabase = require('../supabaseClient');

const router = express.Router();
const prisma = new PrismaClient();
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ⚙️ Получить данные модели Girl (у тебя всегда 1 запись с id = 1)
router.get('/', async (req, res) => {
  try {
    const girl = await prisma.girl.findUnique({
      where: { id: 1 },
    });

    if (!girl) {
      return res.status(404).json({
        result: false,
        error: 'Girl data not found',
      });
    }

    res.status(200).json({
      result: true,
      girl,
    });
  } catch (error) {
    console.error('Error fetching girl:', error);
    res.status(500).json({
      result: false,
      error: 'Failed to fetch girl data',
    });
  }
});

// ⚙️ Обновить данные (баннер, логотип, tgLink)
router.patch('/', upload.fields([
  { name: 'banner', maxCount: 1 },
  { name: 'logo', maxCount: 1 },
]), async (req, res) => {
  try {
    const { tgLink, name, link } = req.body;
    const files = req.files;
    let bannerUrl = null;
    let logoUrl = null;

    // 🔹 Если загружен баннер — отправляем в Supabase
    if (files && files.banner) {
      const file = files.banner[0];
      const ext = file.originalname.split('.').pop();
      const fileName = `banner-${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;

      const { data, error: uploadError } = await supabase.storage
        .from(process.env.SUPABASE_BUCKET)
        .upload(fileName, file.buffer, {
          contentType: file.mimetype,
          upsert: true,
        });

      if (uploadError) {
        console.error('Supabase banner upload error:', uploadError);
        return res.status(500).json({ error: 'Failed to upload banner' });
      }

      const { data: publicUrlData } = supabase.storage
        .from(process.env.SUPABASE_BUCKET)
        .getPublicUrl(fileName);

      bannerUrl = publicUrlData.publicUrl;
    }

    // 🔹 Если загружен логотип — отправляем в Supabase
    if (files && files.logo) {
      const file = files.logo[0];
      const ext = file.originalname.split('.').pop();
      const fileName = `logo-${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;

      const { data, error: uploadError } = await supabase.storage
        .from(process.env.SUPABASE_BUCKET)
        .upload(fileName, file.buffer, {
          contentType: file.mimetype,
          upsert: true,
        });

      if (uploadError) {
        console.error('Supabase logo upload error:', uploadError);
        return res.status(500).json({ error: 'Failed to upload logo' });
      }

      const { data: publicUrlData } = supabase.storage
        .from(process.env.SUPABASE_BUCKET)
        .getPublicUrl(fileName);

      logoUrl = publicUrlData.publicUrl;
    }

    // 🔹 Обновляем запись в базе
    const updatedGirl = await prisma.girl.update({
      where: { id: 1 },
      data: {
        ...(bannerUrl && { banner: bannerUrl }),
        ...(logoUrl && { logo: logoUrl }),
        ...(tgLink && { tgLink }),
        ...(name && { name }),
        ...(link && { link }),
      },
    });

    res.status(200).json({
      result: true,
      girl: updatedGirl,
    });
  } catch (error) {
    console.error('Error updating girl data:', error);
    res.status(500).json({
      result: false,
      error: 'Failed to update girl data',
    });
  }
});

module.exports = router;
