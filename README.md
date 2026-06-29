# ربات تلگرامی صراف 🏦

ربات رسمی پلتفرم صراف — خرید و فروش طلا، دلار و ارز دیجیتال در ایران

## ✅ ویژگی‌های اصلی

| ویژگی | توضیح |
|---|---|
| 🎁 جایزه ۵۰۰ دلاری | یک‌بار قابل فعال‌سازی — جلوگیری از تقلب |
| 🛡️ احراز هویت KYC | کد ملی + موبایل + تاریخ تولد با اعتبارسنجی |
| 💎 واریز ارز دیجیتال | ۷ ارز: BTC, ETH, BNB, TON, TRX, USDT-BEP20, XRP |
| 👆 کپی با یک ضربه | آدرس ولت‌ها و کدها در قالب `<code>` تلگرام |
| 💰 برداشت دوگانه | کد هدیه یا ارز دیجیتال |
| 👥 سیستم معرفی | پاداش ۲۵٪ از هر واریز موفق دوستان |
| 🛡️ پنل ادمین | آمار، جستجو، تأیید واریز، حذف کاربر، پیام همگانی |
| 💾 دیتابیس JSON | با cache حافظه و delayed write (200ms) |
| 🔄 حالت ادمین در DB | حالت ادمین در دیتابیس ذخیره می‌شود (نه RAM) |

---

## 🚀 نصب سریع

### پیش‌نیاز
- Node.js 20 یا بالاتر
- توکن ربات از [@BotFather](https://t.me/BotFather)
- آیدی عددی تلگرام (از [@userinfobot](https://t.me/userinfobot))

```bash
# ۱. نصب وابستگی‌ها
npm install

# ۲. تنظیم متغیرهای محیطی
cp .env.example .env
nano .env   # توکن و آیدی را وارد کنید

# ۳. Build
npm run build

# ۴. اجرا
npm start
```

---

## 🔐 متغیرهای محیطی

| متغیر | توضیح | اجباری |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | توکن ربات از @BotFather | ✅ |
| `ADMIN_TELEGRAM_ID` | آیدی عددی ادمین | ✅ |
| `PORT` | پورت HTTP (پیش‌فرض: 3000) | ❌ |
| `NODE_ENV` | `production` برای محیط اجرا | ❌ |

---

## 🐳 دیپلوی با Docker

```bash
# Build و اجرای مستقیم
docker build -t saraf-bot .
docker run -d \
  -e TELEGRAM_BOT_TOKEN=your_token \
  -e ADMIN_TELEGRAM_ID=your_id \
  -p 3000:3000 \
  --name saraf-bot \
  saraf-bot

# یا با docker-compose (پیشنهادی)
# ابتدا .env را پر کنید
docker-compose up -d
```

---

## ⚡ دیپلوی روی Railway / Render (راحت‌ترین روش)

1. پروژه را روی GitHub پوش کنید
2. وارد [railway.app](https://railway.app) یا [render.com](https://render.com) شوید
3. «New Project» → «Deploy from GitHub Repo» را بزنید
4. متغیرهای محیطی را اضافه کنید:
   - `TELEGRAM_BOT_TOKEN`
   - `ADMIN_TELEGRAM_ID`
5. Deploy! ربات به صورت خودکار build و اجرا می‌شود.

---

## 🖥️ دیپلوی با PM2 (VPS)

```bash
npm install -g pm2
npm install
npm run build
pm2 start dist/index.mjs --name saraf-bot
pm2 save
pm2 startup
```

---

## 📁 ساختار پروژه

```
saraf-bot/
├── src/
│   ├── bot/
│   │   ├── bot.ts          ← منطق اصلی ربات تلگرام
│   │   └── database.ts     ← دیتابیس JSON با cache
│   ├── lib/
│   │   └── logger.ts       ← لاگر pino
│   ├── routes/
│   │   ├── health.ts       ← GET /api/healthz
│   │   └── index.ts        ← router اصلی
│   ├── app.ts              ← Express setup
│   └── index.ts            ← نقطه ورود
├── .env.example            ← نمونه متغیرها
├── .github/workflows/
│   └── ci.yml              ← GitHub Actions CI
├── Dockerfile              ← Docker image
├── docker-compose.yml      ← Docker Compose
├── build.mjs               ← اسکریپت build
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🛡️ دستورات ادمین

| دستور | توضیح |
|---|---|
| `/admin` | باز کردن پنل مدیریت |
| پنل → لیست کاربران | مشاهده همه کاربران |
| پنل → آمار کلی | آمار واریز، جایزه، برداشت |
| پنل → جستجوی کاربر | جستجو با آیدی عددی |
| پنل → تأیید دستی واریز | تأیید واریز کاربر و صدور لایسنس |
| پنل → حذف کاربر | حذف کاربر از دیتابیس |
| پنل → پیام همگانی | ارسال پیام به همه کاربران |

---

## 💾 پشتیبان‌گیری

فایل `bot_db.json` همه داده‌های کاربران را دارد. منظم backup بگیرید:

```bash
# Cron هر روز ساعت ۳ صبح
0 3 * * * cp /app/bot_db.json /backup/bot_db_$(date +%Y%m%d).json
```

---

## ⚙️ جریان کاربری

```
/start ──► منوی اصلی
   │
   ├─ 💳 واریز ─────► انتخاب ارز ─► آدرس ولت ─► ارسال رسید ─► ادمین تأیید ─► لایسنس
   │
   ├─ 🎁 جایزه ──────► KYC (کد ملی + موبایل + تولد) ─► وارد کردن لایسنس ─► جایزه فعال
   │
   ├─ 💰 برداشت ─────► وارد کردن لایسنس ─► انتخاب روش ─► کد هدیه | ارز دیجیتال
   │
   └─ 👥 معرفی ──────► لینک اختصاصی ─► ۲۵٪ پاداش از هر واریز دوستان
```
