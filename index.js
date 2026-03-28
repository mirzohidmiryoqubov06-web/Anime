const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

// --- SOZLAMALAR ---
const BOT_TOKEN = '8241691960:AAGL4lWglguG6dKgYgh7xABkHIbN2uXw3Zg'; // Telegram bot tokeni
const SERIAL_NOMI = 'Sirlar hukmdori'; // Serial nomi (caption da ko'rsatiladi)
const ADMIN_ID = 0; // O'zingizning Telegram ID raqamingiz (Majburiy emas, yozsangiz faqat siz video qo'sha olasiz)

const DB_FILE = path.join(__dirname, 'database.json');

// Botni polling orqali ishga tushirish
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Bazani o'qish
function getDatabase() {
    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, JSON.stringify({}, null, 2));
        return {};
    }
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data);
}

// Bazaga saqlash
function saveDatabase(db) {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// /start komandasi uchun handler
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const db = getDatabase();

    // Bazadagi barcha qismlarni (kalitlarni) raqam ko'rinishida olamiz va o'sish tartibida joylaymiz
    const videos = Object.keys(db).map(k => parseInt(k, 10)).sort((a, b) => a - b);

    if (videos.length === 0) {
        return bot.sendMessage(chatId, "Hozircha botga hech qanday qism yuklanmagan 😔\nYangi qism qo'shish uchun botga videoni yuboring va izoh (caption) qismiga qism raqamini yozing.");
    }

    const keyboard = [];
    let currentRow = [];

    // Videolar uchun tugmalarni dinamik tarzda shakllantirish
    videos.forEach((partNumber) => {
        currentRow.push({
            text: `📺 ${partNumber}-qism`,
            callback_data: `video_${partNumber}`
        });

        // Tugmalar qatorda 3 tadan joylashishi uchun tekshiruv
        if (currentRow.length === 3) {
            keyboard.push(currentRow);
            currentRow = [];
        }
    });

    // Qoldiq bo'lib qolgan (oxirgi qatordagi 1 yoki 2 ta) tugmalarni ro'yxatga qo'shish
    if (currentRow.length > 0) {
        keyboard.push(currentRow);
    }

    const imagePath = path.join(__dirname, 'image', 'sirlar_hukmdori.jpg');
    const messageText = `Assalomu alaykum! <b>${SERIAL_NOMI}</b> serialining qismlarini tanlang:`;
    const messageOptions = {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: keyboard
        }
    };

    if (fs.existsSync(imagePath)) {
        messageOptions.caption = messageText;
        // Windows yo'llarini xato o'qimasligi uchun faylni to'g'ridan-to'g'ri oqim (stream) ko'rinishida yuboramiz
        bot.sendPhoto(chatId, fs.createReadStream(imagePath), messageOptions).catch(err => {
            console.error("Rasm yuborishda xatolik:", err);
            bot.sendMessage(chatId, messageText, messageOptions);
        });
    } else {
        bot.sendMessage(chatId, messageText, messageOptions);
    }
});

// Video qabul qilish handleri (Yangi qismlarni bazaga qo'shish)
bot.on('video', (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    // Agar ADMIN_ID o'rnatilgan bo'lsa va foydalanuvchi IDsi unga mos kelmasa, e'tibor bermaymiz
    if (ADMIN_ID !== 0 && userId !== ADMIN_ID) return;

    // Foydalanuvchi video yuborganda caption (izoh) ga raqam yozgan bo'lishi kerak
    const caption = msg.caption;
    if (!caption) {
        return bot.sendMessage(chatId, "Iltimos, videoni yuborayotganda uning izohiga (caption) raqamini yozing. Masalan: `1` yoki `2`", { parse_mode: 'Markdown' });
    }

    const partNumber = parseInt(caption.trim(), 10);
    if (isNaN(partNumber)) {
        return bot.sendMessage(chatId, "Izohda faqatgina uning vizual qism raqami bo'lishi kerak. Masalan: `3`", { parse_mode: 'Markdown' });
    }

    // Telegram bergan file_id ni olamiz
    const fileId = msg.video.file_id;
    const db = getDatabase();

    // Bazaga saqlaymiz
    db[partNumber] = fileId;
    saveDatabase(db);

    bot.sendMessage(chatId, `✅ <b>${partNumber}-qism</b> bazaga muvaffaqiyatli saqlandi!\nEndi foydalanuvchilar uni /start orqali ko'rishlari mumkin.`, { parse_mode: 'HTML' });
});

// /help komandasi uchun handler
bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "Botdan foydalanish uchun /start komandasini yuboring va ochilgan tugmalardan kerakli qismni tanlasangiz kifoya.\n\nVideo qo'shish uchun: \n1. Botga videoni yuboring.\n2. Yuborishdan oldin izoh (caption) qismiga qism raqamini (masalan `5`) yozing.");
});

// Callback query handler (tugmalar bosilganda ishlash uchun)
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    // Tanlangan harakat callback_data ("video_") dan olinadi
    if (data.startsWith('video_')) {
        const partNumber = parseInt(data.replace('video_', ''), 10);
        const db = getDatabase();

        // file_id ni bazadan qidiramiz
        const fileId = db[partNumber];

        if (fileId) {
            // "⏳ yuklanmoqda..." xabarini foydalanuvchiga yuborish
            const loadingMsg = await bot.sendMessage(chatId, "⏳ yuklanmoqda...");

            try {
                // Videoni file_id orqali yuborish (bu kompyuter fleshkasidan yuklash emas, Telegram serveridan tezkor jo'natishdir)
                await bot.sendVideo(chatId, fileId, {
                    caption: `🎬 <b>${SERIAL_NOMI}</b>\n📺 ${partNumber}-qism`,
                    parse_mode: 'HTML'
                });

                // Yuborib bo'lingach, yuklanmoqda xabarini o'chirib tashlash
                await bot.deleteMessage(chatId, loadingMsg.message_id);
            } catch (error) {
                console.error("Video faylini yuborishda xatolik:", error);
                // Xatolik yuz bersa, yuklanmoqda xabarini xatolik haqida matnga tahrirlaymiz
                await bot.editMessageText(`Kechirasiz, videoni yuborishda xatolik yuz berdi.\nXabar: ${error.message}`, {
                    chat_id: chatId,
                    message_id: loadingMsg.message_id
                });
            }
        } else {
            bot.sendMessage(chatId, "Kechirasiz, ushbu qism topilmadi 😔");
        }
    }

    // Telegram uchun javob qaytarish (tugma yuklanishi animatsiyasini to'xtatadi)
    bot.answerCallbackQuery(query.id);
});

// Polling xatoliklari bo'yicha handler
bot.on('polling_error', (error) => {
    console.error("Polling xatoligi yuz berdi:", error.code, error.message);
});

console.log("Telegram bot ishga tushdi va komandalarni kutmoqda...");
