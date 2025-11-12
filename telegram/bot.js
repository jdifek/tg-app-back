// telegram/bot.js
import TelegramBot from 'node-telegram-bot-api';
import axios from 'axios';
import prisma from '../prisma/prisma.js';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = 5505526221;

let bot;

// Инициализация бота
export function initBot() {
  try {
    if (!BOT_TOKEN) {
      console.error('TELEGRAM_BOT_TOKEN not found in environment variables');
      return;
    }

    bot = new TelegramBot(BOT_TOKEN, { polling: true });
    
    console.log('✅ Telegram bot started');

    // Команды
    bot.onText(/\/start/, handleStart);
    bot.onText(/\/support/, handleSupport);
    
    // Все остальные сообщения (не команды)
    bot.on('message', async (msg) => {
      try {
        if (msg.text?.startsWith('/')) return; // Пропускаем команды
        await handleUserMessage(msg);
      } catch (error) {
        console.error('Error in message handler:', error);
      }
    });

    // Обработка ошибок
    bot.on('polling_error', (error) => {
      console.error('Telegram polling error:', error);
    });

    return bot;
  } catch (error) {
    console.error('Error initializing bot:', error);
    return null;
  }
}

// Команда /start
async function handleStart(msg) {
  const chatId = msg.chat.id;
  
  try {
    const welcomeText = `
👋 Welcome to our store!

You can:
• Browse products
• Make purchases
• Contact support at any time

Just send a message here to reach our support team!
    `.trim();

    await bot.sendMessage(chatId, welcomeText, {
      parse_mode: 'HTML'
    });
  } catch (error) {
    console.error('Error in /start command:', error);
    try {
      await bot.sendMessage(chatId, '❌ Sorry, there was an error. Please try /start again.');
    } catch (sendError) {
      console.error('Error sending error message:', sendError);
    }
  }
}

// Команда /support
async function handleSupport(msg) {
  const chatId = msg.chat.id;
  
  try {
    const helpText = `
💬 <b>Support</b>

Send any message or media to this chat:
📝 Text messages
📷 Photos
🎥 Videos
📄 Documents

Our team typically responds within 24 hours.
    `.trim();

    await bot.sendMessage(chatId, helpText, {
      parse_mode: 'HTML'
    });
  } catch (error) {
    console.error('Error in /support command:', error);
    try {
      await bot.sendMessage(chatId, '❌ Sorry, there was an error. Please try /support again.');
    } catch (sendError) {
      console.error('Error sending error message:', sendError);
    }
  }
}

// Обработка обычных сообщений пользователей
async function handleUserMessage(msg) {
  const chatId = msg.chat.id;
  const text = msg.text;
  const userId = chatId.toString();

  try {
    // Создаем/обновляем пользователя
    const user = await prisma.user.upsert({
      where: { telegramId: userId },
      update: {
        firstName: msg.from.first_name || 'User',
        lastName: msg.from.last_name || '',
        username: msg.from.username || null
      },
      create: {
        telegramId: userId,
        firstName: msg.from.first_name || 'User',
        lastName: msg.from.last_name || '',
        username: msg.from.username || null
      }
    });

    // Обрабатываем медиа
    let mediaUrl = null;
    let mediaType = null;

    try {
      if (msg.photo) {
        const photo = msg.photo[msg.photo.length - 1];
        mediaUrl = await getFileUrl(photo.file_id);
        mediaType = 'photo';
      } else if (msg.video) {
        mediaUrl = await getFileUrl(msg.video.file_id);
        mediaType = 'video';
      } else if (msg.document) {
        mediaUrl = await getFileUrl(msg.document.file_id);
        mediaType = 'document';
      }
    } catch (mediaError) {
      console.error('Error processing media:', mediaError);
      // Продолжаем без медиа
    }

    // Сохраняем сообщение
    const savedMessage = await prisma.supportMessage.create({
      data: {
        userId: userId,
        message: text || msg.caption || '',
        mediaUrl,
        mediaType,
        isFromAdmin: false,
        isRead: false
      }
    });

    // Обновляем флаг непрочитанных
    try {
      await prisma.user.update({
        where: { telegramId: userId },
        data: { hasUnreadSupport: true }
      });
    } catch (updateError) {
      console.error('Error updating unread flag:', updateError);
      // Не критично, продолжаем
    }

    // Подтверждение пользователю
   

    // Уведомляем админа
    try {
      await notifyAdmin(user, savedMessage);
    } catch (notifyError) {
      console.error('Error notifying admin:', notifyError);
      // Не блокируем работу, если не удалось уведомить админа
    }

  } catch (error) {
    console.error('Error handling user message:', error);
    try {
      await bot.sendMessage(chatId, 
        '❌ Sorry, there was an error. Please try again.'
      );
    } catch (sendError) {
      console.error('Error sending error message:', sendError);
    }
  }
}

// Получить URL файла
async function getFileUrl(fileId) {
  try {
    const response = await axios.get(
      `https://api.telegram.org/bot${BOT_TOKEN}/getFile`,
      { params: { file_id: fileId } }
    );
    
    if (response.data.ok) {
      const filePath = response.data.result.file_path;
      return `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
    }
    
    console.error('Failed to get file:', response.data);
    return null;
  } catch (error) {
    console.error('Error getting file URL:', error);
    return null;
  }
}

// Уведомить админа
async function notifyAdmin(user, message) {
  if (!ADMIN_CHAT_ID) {
    console.warn('ADMIN_CHAT_ID not configured');
    return;
  }

  try {
    const userName = `${user.firstName} ${user.lastName}`.trim();
    const username = user.username ? `@${user.username}` : 'No username';
    
    let text = `🔔 <b>New Support Message</b>\n\n`;
    text += `👤 From: ${userName} (${username})\n`;
    text += `🆔 ID: ${user.telegramId}\n`;
    text += `📝 Message: ${message.message || '[Media]'}\n\n`;
    text += `🔗 <a href="${process.env.FRONTEND_URL}/admin/support">Open Admin Panel</a>`;

    if (message.mediaUrl && message.mediaType) {
      try {
        const methods = {
          photo: 'sendPhoto',
          video: 'sendVideo',
          document: 'sendDocument'
        };
        
        const method = methods[message.mediaType];
        const field = message.mediaType === 'photo' ? 'photo' : 
                      message.mediaType === 'video' ? 'video' : 'document';

        await axios.post(
          `https://api.telegram.org/bot${BOT_TOKEN}/${method}`,
          {
            chat_id: ADMIN_CHAT_ID,
            [field]: message.mediaUrl,
            caption: text,
            parse_mode: 'HTML'
          }
        );
      } catch (mediaError) {
        console.error('Error sending media to admin, sending text instead:', mediaError);
        // Если не удалось отправить с медиа, отправляем просто текст
        await bot.sendMessage(ADMIN_CHAT_ID, text, { parse_mode: 'HTML' });
      }
    } else {
      await bot.sendMessage(ADMIN_CHAT_ID, text, { parse_mode: 'HTML' });
    }
  } catch (error) {
    console.error('Error notifying admin:', error);
  }
}

// Отправить сообщение (используется из API)
export async function sendTelegramMessage(chatId, text, options = {}) {
  try {
    if (!bot) {
      throw new Error('Bot not initialized');
    }
    return await bot.sendMessage(chatId, text, options);
  } catch (error) {
    console.error('Error sending telegram message:', error);
    throw error;
  }
}

export function getBot() {
  return bot;
}