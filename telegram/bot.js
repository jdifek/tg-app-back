// telegram/bot.js - ИСПРАВЛЕНО: CommonJS вместо ES6
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const prisma = require('../prisma/prisma');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = 6970790362;

let bot;

// ✅ Инициализация бота БЕЗ polling (только webhook)
function initBot() {
  try {
    if (!BOT_TOKEN) {
      console.error('TELEGRAM_BOT_TOKEN not found in environment variables');
      return;
    }

    // 🔴 ВАЖНО: polling: false - работаем ТОЛЬКО с webhook
    bot = new TelegramBot(BOT_TOKEN, { polling: false });
    
    console.log('✅ Telegram bot initialized (webhook mode)');

    return bot;
  } catch (error) {
    console.error('Error initializing bot:', error);
    return null;
  }
}

// ✅ Обработка обычных сообщений (вызывается из server.js webhook)
async function handleUserMessage(msg) {
  const chatId = msg.chat.id;
  const text = msg.text;
  const userId = chatId.toString();

  try {
    console.log(`📨 Processing message from user ${userId}`);

    // Пропускаем команды - они обрабатываются отдельно
    if (text?.startsWith('/')) {
      if (text === '/start') {
        await handleStart(msg);
      } else if (text === '/support') {
        await handleSupport(msg);
      }
      return;
    }

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

    console.log(`✅ User upserted: ${user.telegramId}`);

    // Обрабатываем медиа
    let mediaUrl = null;
    let mediaType = null;

    try {
      if (msg.photo) {
        const photo = msg.photo[msg.photo.length - 1];
        mediaUrl = await getFileUrl(photo.file_id);
        mediaType = 'photo';
        console.log(`📷 Photo processed: ${mediaUrl}`);
      } else if (msg.video) {
        mediaUrl = await getFileUrl(msg.video.file_id);
        mediaType = 'video';
        console.log(`🎥 Video processed: ${mediaUrl}`);
      } else if (msg.document) {
        mediaUrl = await getFileUrl(msg.document.file_id);
        mediaType = 'document';
        console.log(`📄 Document processed: ${mediaUrl}`);
      }
    } catch (mediaError) {
      console.error('Error processing media:', mediaError);
      // Продолжаем без медиа
    }

    // Сохраняем сообщение в БД
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

    console.log(`✅ Message saved: ${savedMessage.id}`);

    // Обновляем флаг непрочитанных
    try {
      await prisma.user.update({
        where: { telegramId: userId },
        data: { hasUnreadSupport: true }
      });
      console.log(`✅ Unread flag updated`);
    } catch (updateError) {
      console.error('Error updating unread flag:', updateError);
    }

    // Отправляем подтверждение пользователю
    try {
      await sendTelegramMessage(chatId, '✅ Message received! Our team will respond soon.');
      console.log(`✅ Confirmation sent to user ${userId}`);
    } catch (confirmError) {
      console.error('Error sending confirmation:', confirmError);
    }

    // Уведомляем админа
    try {
      await notifyAdmin(user, savedMessage);
      console.log(`✅ Admin notified`);
    } catch (notifyError) {
      console.error('Error notifying admin:', notifyError);
    }

  } catch (error) {
    console.error('Error handling user message:', error);
    try {
      await sendTelegramMessage(chatId, '❌ Sorry, there was an error. Please try again.');
    } catch (sendError) {
      console.error('Error sending error message:', sendError);
    }
  }
}

// ✅ Команда /start (вызывается из server.js webhook)
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

    await sendTelegramMessage(chatId, welcomeText, {
      parse_mode: 'HTML'
    });
    console.log(`✅ /start command processed for user ${chatId}`);
  } catch (error) {
    console.error('Error in /start command:', error);
    try {
      await sendTelegramMessage(chatId, '❌ Sorry, there was an error. Please try /start again.');
    } catch (sendError) {
      console.error('Error sending error message:', sendError);
    }
  }
}

// ✅ Команда /support (вызывается из server.js webhook)
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

    await sendTelegramMessage(chatId, helpText, {
      parse_mode: 'HTML'
    });
    console.log(`✅ /support command processed for user ${chatId}`);
  } catch (error) {
    console.error('Error in /support command:', error);
    try {
      await sendTelegramMessage(chatId, '❌ Sorry, there was an error. Please try /support again.');
    } catch (sendError) {
      console.error('Error sending error message:', sendError);
    }
  }
}

// ✅ Получить URL файла
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

// ✅ Уведомить админа о новом сообщении
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

        // Используем axios вместо bot.sendPhoto для webhook режима
        await axios.post(
          `https://api.telegram.org/bot${BOT_TOKEN}/${method}`,
          {
            chat_id: ADMIN_CHAT_ID,
            [field]: message.mediaUrl,
            caption: text,
            parse_mode: 'HTML'
          }
        );

        console.log(`✅ Media sent to admin via ${method}`);
      } catch (mediaError) {
        console.error('Error sending media to admin, sending text instead:', mediaError);
        // Если не удалось отправить с медиа, отправляем просто текст
        await sendTelegramMessage(ADMIN_CHAT_ID, text, { parse_mode: 'HTML' });
      }
    } else {
      await sendTelegramMessage(ADMIN_CHAT_ID, text, { parse_mode: 'HTML' });
    }
  } catch (error) {
    console.error('Error notifying admin:', error);
  }
}

// ✅ Отправить сообщение (используется везде)
async function sendTelegramMessage(chatId, text, options = {}) {
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

function getBot() {
  return bot;
}

// CommonJS экспорт
module.exports = {
  initBot,
  handleUserMessage,
  handleStart,
  handleSupport,
  sendTelegramMessage,
  getBot
};

// ✅ КРИТИЧЕСКИ ВАЖНО: Экспортируем функцию для отправки invoice
async function sendStarsInvoice(chatId, orderId, title, description, amount) {
  try {
    if (!bot) {
      throw new Error('Bot not initialized');
    }

    // Конвертируем USD в звезды (1 USD = 100 звезд примерно)
    const starsAmount = Math.round(amount * 100);

    console.log(`💫 Sending invoice to ${chatId}: ${starsAmount} stars for order ${orderId}`);

    return await bot.sendInvoice(chatId, {
      title: title,
      description: description,
      payload: JSON.stringify({ orderId }),
      provider_token: '', // Пусто для Telegram Stars
      currency: 'XTR', // ⚠️ КРИТИЧНО: XTR для Stars
      prices: [
        {
          label: title,
          amount: starsAmount
        }
      ]
    });
  } catch (error) {
    console.error('Error sending invoice:', error);
    throw error;
  }
}

module.exports = {
  initBot,
  handleUserMessage,
  handleStart,
  handleSupport,
  sendTelegramMessage,
  sendStarsInvoice,
  getBot
};