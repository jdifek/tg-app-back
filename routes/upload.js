// routes/upload.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp'); // Опционально для оптимизации изображений

const router = express.Router();

// Создаем папку uploads если её нет
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Конфигурация Multer для хранения файлов
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Генерируем уникальное имя файла
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

// Фильтр файлов
const fileFilter = (req, file, cb) => {
  // Разрешенные типы файлов
  const allowedMimes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'video/mp4',
    'video/mpeg',
    'video/quicktime',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only images, videos, and documents are allowed.'));
  }
};

// Настройка multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB максимум
  }
});

// POST /api/upload - загрузка одного файла
router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const file = req.file;
    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${file.filename}`;

    // Опционально: оптимизация изображений
    if (file.mimetype.startsWith('image/')) {
      try {
        const optimizedPath = path.join(uploadDir, `opt_${file.filename}`);
        
        await sharp(file.path)
          .resize(1920, 1920, { 
            fit: 'inside',
            withoutEnlargement: true 
          })
          .jpeg({ quality: 85 })
          .toFile(optimizedPath);

        // Удаляем оригинал, переименовываем оптимизированный
        fs.unlinkSync(file.path);
        fs.renameSync(optimizedPath, file.path);
      } catch (sharpError) {
        console.log('Image optimization skipped:', sharpError.message);
        // Продолжаем с оригинальным файлом если оптимизация не удалась
      }
    }

    res.json({
      success: true,
      url: fileUrl,
      filename: file.filename,
      originalName: file.originalname,
      mimetype: file.mimetype,
      size: file.size
    });

  } catch (error) {
    console.error('Upload error:', error);
    
    // Удаляем файл в случае ошибки
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('Error deleting file:', unlinkError);
      }
    }

    res.status(500).json({ 
      error: 'Failed to upload file',
      details: error.message 
    });
  }
});

// POST /api/upload/multiple - загрузка нескольких файлов
router.post('/multiple', upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const uploadedFiles = req.files.map(file => ({
      url: `${req.protocol}://${req.get('host')}/uploads/${file.filename}`,
      filename: file.filename,
      originalName: file.originalname,
      mimetype: file.mimetype,
      size: file.size
    }));

    res.json({
      success: true,
      files: uploadedFiles,
      count: uploadedFiles.length
    });

  } catch (error) {
    console.error('Multiple upload error:', error);

    // Удаляем все загруженные файлы в случае ошибки
    if (req.files) {
      req.files.forEach(file => {
        try {
          fs.unlinkSync(file.path);
        } catch (unlinkError) {
          console.error('Error deleting file:', unlinkError);
        }
      });
    }

    res.status(500).json({ 
      error: 'Failed to upload files',
      details: error.message 
    });
  }
});

// DELETE /api/upload/:filename - удаление файла
router.delete('/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    
    // Проверка на безопасность (path traversal attack)
    if (filename.includes('..') || filename.includes('/')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    const filePath = path.join(uploadDir, filename);

    // Проверяем существование файла
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Удаляем файл
    fs.unlinkSync(filePath);

    res.json({ 
      success: true, 
      message: 'File deleted successfully' 
    });

  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ 
      error: 'Failed to delete file',
      details: error.message 
    });
  }
});

module.exports = router;