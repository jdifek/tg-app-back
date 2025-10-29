// telegram/support-handler.js
import axios from 'axios';
import prisma from '../prisma/prisma';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = 5505526221; // ID админа в Telegram

/**
 * Обработчик входящих сообщений от пользователей
 */
export async function handleUserMessage(msg) {
  const chatId = msg.chat.id;
  const text = msg.text;
  const userId = chatId.toString();

  // Проверяем, это команда или обычное сообщение
  if (text?.startsWith('/')) {
    return; // Команды обрабатываются отдельно
  }

  try {
    // Проверяем/создаем пользователя
    const user = await prisma.user.upsert({
      where: { telegramId: userId },
      update: {},
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
      const photo = msg.photo[msg.photo.length - 1]; // Берем самое большое фото
      const fileId = photo.file_id;
      mediaUrl = await getFileUrl(fileId);
      mediaType = 'photo';
    } else if (msg.video) {
      const fileId = msg.video.file_id;
      mediaUrl = await getFileUrl(fileId);
      mediaType = 'video';
    } else if (msg.document) {
      const fileId = msg.document.file_id;
      mediaUrl = await getFileUrl(fileId);
      mediaType = 'document';
    }

    // Сохраняем сообщение в БД
    const savedMessage = await prisma.supportMessage.create({
      data: {
        userId: userId,
        message: text || (msg.caption || ''),
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

    // Отправляем подтверждение пользователю
    await sendMessage(chatId, 
      '✅ Your message has been received! Our support team will respond shortly.'
    );

    // Уведомляем админа
    await notifyAdmin(user, savedMessage);

  } catch (error) {
    console.error('Error handling user message:', error);
    await sendMessage(chatId, 
      '❌ Sorry, there was an error processing your message. Please try again.'
    );
  }
}

/**
 * Получить URL файла из Telegram
 */
async function getFileUrl(fileId) {
  try {
    const response = await axios.get(
      `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`
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

/**
 * Отправить сообщение в Telegram
 */
async function sendMessage(chatId, text, options = {}) {
  try {
    await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML',
        ...options
      }
    );
  } catch (error) {
    console.error('Error sending message:', error);
  }
}

/**
 * Уведомить админа о новом сообщении
 */
async function notifyAdmin(user, message) {
  if (!ADMIN_CHAT_ID) return;

  try {
    const userName = `${user.firstName} ${user.lastName}`.trim();
    const username = user.username ? `@${user.username}` : 'No username';
    
    let notificationText = `🔔 <b>New Support Message</b>\n\n`;
    notificationText += `👤 From: ${userName} (${username})\n`;
    notificationText += `🆔 User ID: ${user.telegramId}\n`;
    notificationText += `📝 Message: ${message.message || '[Media]'}\n\n`;
    notificationText += `🔗 View in admin panel: ${process.env.FRONTEND_URL}/admin/support`;

    if (message.mediaUrl && message.mediaType) {
      // Отправляем медиа с подписью
      const methodMap = {
        photo: 'sendPhoto',
        video: 'sendVideo',
        document: 'sendDocument'
      };

      const method = methodMap[message.mediaType];
      const mediaField = message.mediaType === 'photo' ? 'photo' : 
                         message.mediaType === 'video' ? 'video' : 'document';

      await axios.post(
        `https://api.telegram.org/bot${BOT_TOKEN}/${method}`,
        {
          chat_id: ADMIN_CHAT_ID,
          [mediaField]: message.mediaUrl,
          caption: notificationText,
          parse_mode: 'HTML'
        }
      );
    } else {
      await sendMessage(ADMIN_CHAT_ID, notificationText);
    }
  } catch (error) {
    console.error('Error notifying admin:', error);
  }
}

/**
 * Команда /support для пользователей
 */
export async function handleSupportCommand(msg) {
  const chatId = msg.chat.id;
  
  const helpText = `
💬 <b>Support</b>

You can send any message or media to this chat, and our support team will respond.

📝 Text messages
📷 Photos
🎥 Videos
📄 Documents

We typically respond within 24 hours.
  `.trim();

  await sendMessage(chatId, helpText);
}

// Добавьте в основной bot handler:
/*
bot.on('message', async (msg) => {
  if (msg.text === '/support') {
    await handleSupportCommand(msg);
  } else if (!msg.text?.startsWith('/')) {
    await handleUserMessage(msg);
  }
});
*/