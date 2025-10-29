// telegram/bot.js
import TelegramBot from 'node-telegram-bot-api';
import prisma from '../prisma/client.js';
import axios from 'axios';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = 5505526221;

let bot;

// Инициализация бота
export function initBot() {
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
    if (msg.text?.startsWith('/')) return; // Пропускаем команды
    await handleUserMessage(msg);
  });

  // Обработка ошибок
  bot.on('polling_error', (error) => {
    console.error('Telegram polling error:', error);
  });

  return bot;
}

// Команда /start
async function handleStart(msg) {
  const chatId = msg.chat.id;
  
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
}

// Команда /support
async function handleSupport(msg) {
  const chatId = msg.chat.id;
  
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
    await prisma.user.update({
      where: { telegramId: userId },
      data: { hasUnreadSupport: true }
    });

    // Подтверждение пользователю
    await bot.sendMessage(chatId, 
      '✅ Message received! Our support team will respond shortly.',
      { parse_mode: 'HTML' }
    );

    // Уведомляем админа
    await notifyAdmin(user, savedMessage);

  } catch (error) {
    console.error('Error handling user message:', error);
    await bot.sendMessage(chatId, 
      '❌ Sorry, there was an error. Please try again.'
    );
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
  } catch (error) {
    console.error('Error getting file URL:', error);
  }
  return null;
}

// Уведомить админа
async function notifyAdmin(user, message) {
  if (!ADMIN_CHAT_ID) return;

  try {
    const userName = `${user.firstName} ${user.lastName}`.trim();
    const username = user.username ? `@${user.username}` : 'No username';
    
    let text = `🔔 <b>New Support Message</b>\n\n`;
    text += `👤 From: ${userName} (${username})\n`;
    text += `🆔 ID: ${user.telegramId}\n`;
    text += `📝 Message: ${message.message || '[Media]'}\n\n`;
    text += `🔗 <a href="${process.env.FRONTEND_URL}/admin/support">Open Admin Panel</a>`;

    if (message.mediaUrl && message.mediaType) {
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
    } else {
      await bot.sendMessage(ADMIN_CHAT_ID, text, { parse_mode: 'HTML' });
    }
  } catch (error) {
    console.error('Error notifying admin:', error);
  }
}

// Отправить сообщение (используется из API)
export async function sendTelegramMessage(chatId, text, options = {}) {
  if (!bot) {
    throw new Error('Bot not initialized');
  }
  return bot.sendMessage(chatId, text, options);
}

export function getBot() {
  return bot;
}