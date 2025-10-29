// routes/support.js
import express from 'express';
import axios from 'axios';
import prisma from '../prisma/prisma';

const router = express.Router();
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Получить все чаты с пользователями (для админа)
router.get('/chats', async (req, res) => {
  try {
    // Получаем уникальных пользователей с сообщениями
    const chats = await prisma.user.findMany({
      where: {
        supportMessages: {
          some: {}
        }
      },
      select: {
        telegramId: true,
        firstName: true,
        lastName: true,
        username: true,
        hasUnreadSupport: true,
        supportMessages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            message: true,
            createdAt: true,
            isFromAdmin: true
          }
        }
      },
      orderBy: {
        supportMessages: {
          _count: 'desc'
        }
      }
    });

    // Подсчитываем непрочитанные для каждого чата
    const chatsWithUnread = await Promise.all(
      chats.map(async (chat) => {
        const unreadCount = await prisma.supportMessage.count({
          where: {
            userId: chat.telegramId,
            isFromAdmin: false,
            isRead: false
          }
        });

        return {
          ...chat,
          unreadCount,
          lastMessage: chat.supportMessages[0] || null
        };
      })
    );

    res.json(chatsWithUnread);
  } catch (error) {
    console.error('Error fetching chats:', error);
    res.status(500).json({ error: 'Failed to fetch chats' });
  }
});

// Получить сообщения конкретного чата
router.get('/messages/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 50, before } = req.query;

    const messages = await prisma.supportMessage.findMany({
      where: {
        userId: userId
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit),
      ...(before && {
        cursor: { id: before },
        skip: 1
      })
    });

    // Отмечаем сообщения пользователя как прочитанные
    await prisma.supportMessage.updateMany({
      where: {
        userId: userId,
        isFromAdmin: false,
        isRead: false
      },
      data: { isRead: true }
    });

    // Обновляем флаг непрочитанных
    await prisma.user.update({
      where: { telegramId: userId },
      data: { hasUnreadSupport: false }
    });

    res.json(messages.reverse());
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Отправить сообщение пользователю
router.post('/send', async (req, res) => {
  try {
    const { userId, message, mediaUrl, mediaType, orderId } = req.body;

    if (!userId || (!message?.trim() && !mediaUrl)) {
      return res.status(400).json({
        error: 'userId and message or mediaUrl are required'
      });
    }

    // Проверяем существование пользователя
    const user = await prisma.user.findUnique({
      where: { telegramId: userId }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Сохраняем в БД
    const savedMessage = await prisma.supportMessage.create({
      data: {
        userId: userId,
        message: message || '',
        mediaUrl,
        mediaType,
        orderId: orderId || null, // Связываем с заказом если передан
        isFromAdmin: true,
        isRead: true
      }
    });

    // Отправляем через Telegram
    let telegramResponse;

    if (mediaUrl && mediaType) {
      // Отправка медиа
      const methodMap = {
        photo: 'sendPhoto',
        video: 'sendVideo',
        document: 'sendDocument'
      };

      const method = methodMap[mediaType] || 'sendDocument';
      const mediaField = mediaType === 'photo' ? 'photo' : 
                         mediaType === 'video' ? 'video' : 'document';

      telegramResponse = await axios.post(
        `https://api.telegram.org/bot${BOT_TOKEN}/${method}`,
        {
          chat_id: userId,
          [mediaField]: mediaUrl,
          caption: message || '',
          parse_mode: 'HTML'
        }
      );
    } else {
      // Отправка текста
      telegramResponse = await axios.post(
        `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
        {
          chat_id: userId,
          text: `💬 <b>Support Team:</b>\n\n${message}`,
          parse_mode: 'HTML'
        }
      );
    }

    if (!telegramResponse.data.ok) {
      throw new Error('Failed to send Telegram message');
    }

    res.json({ success: true, message: savedMessage });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({
      error: 'Failed to send message',
      details: error.response?.data || error.message
    });
  }
});

// Получить количество непрочитанных чатов
router.get('/unread-count', async (req, res) => {
  try {
    const count = await prisma.user.count({
      where: {
        hasUnreadSupport: true
      }
    });

    res.json({ count });
  } catch (error) {
    console.error('Error getting unread count:', error);
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

// Отметить чат как прочитанный
router.patch('/mark-read/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    await prisma.supportMessage.updateMany({
      where: {
        userId: userId,
        isFromAdmin: false,
        isRead: false
      },
      data: { isRead: true }
    });

    await prisma.user.update({
      where: { telegramId: userId },
      data: { hasUnreadSupport: false }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error marking as read:', error);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

export default router;