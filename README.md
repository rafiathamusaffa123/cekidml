# ATHA STORE Telegram Bot

Telegram bot webhook for Vercel + Supabase.

## Features
- /start customer menu, catalog, best sellers, promos, iPhone service, website and WhatsApp buttons
- Admin commands: /admin, /addproduct, /editprice, /delproduct, /best, /products, /addpromo, /delpromo, /broadcast, /stats
- Supabase persistence for users, products, promos
- Telegram webhook secret validation

## Setup
1. Create a Telegram bot with @BotFather using /newbot. Save token privately.
2. Get your Telegram numeric user ID from a trusted ID bot or Telegram client; set it as ADMIN_IDS.
3. Create a Supabase project. Open SQL Editor and run `supabase.sql`.
4. Create a Vercel project from this folder/repository. Add all variables from `.env.example` in Project Settings > Environment Variables.
5. Deploy. Your webhook URL is `https://YOUR-PROJECT.vercel.app/api/webhook`.
6. Register webhook in a browser (replace values):
   `https://api.telegram.org/botBOT_TOKEN/setWebhook?url=https://YOUR-PROJECT.vercel.app/api/webhook&secret_token=WEBHOOK_SECRET`
7. Open your bot in Telegram and send `/start`.

## Admin commands
- `/admin`
- `/addproduct Kategori|Nama|Harga|Deskripsi`
- `/editprice ID|HargaBaru`
- `/delproduct ID`
- `/best ID`
- `/products`
- `/addpromo Kode|DiskonPersen|Deskripsi`
- `/delpromo KODE`
- `/broadcast Pesan`
- `/stats`

## Notes
- Bot's promo list is informational only. It does NOT automatically apply a discount on the ATHA STORE website. Website checkout must be separately connected to the same promo table and validate promo codes server-side.
- Broadcast sends one message per registered bot user. Use responsibly; Telegram users must have started the bot first, and users can block it.
- Supabase Free projects may pause after a week of inactivity. Vercel Hobby is free within its current usage limits. Check current provider terms.
- The supplied sample catalog uses the prices from the conversation. Verify them before going live.
- Keep BOT_TOKEN and SUPABASE_SERVICE_ROLE_KEY secret. Never publish `.env` or expose service-role keys in frontend code.
