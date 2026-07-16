# KLIPIN

Universal media downloader dengan tema UI Minecraft Java Edition.
Developer: **PAJAR**

Klipin memungkinkan pengguna menempel satu tautan (TikTok, YouTube, Instagram,
Douyin, Pinterest, Facebook, CapCut, Spotify) dan mendapatkan link unduhan
media asli tanpa proses ribet — dibungkus dalam antarmuka pixel ala menu
Minecraft.

---

## 1. Struktur Project

```
klipin/
├── index.html                 halaman utama + downloader
├── cara-penggunaan/index.html panduan 3 langkah
├── larangan/index.html        aturan layanan
├── adm/index.html             halaman identitas developer PAJAR (PUBLIK, bukan admin panel)
├── css/style.css              seluruh styling + tema
├── js/
│   ├── main.js                intro loading, downloader flow, render aman
│   ├── theme.js                theme switcher (localStorage)
│   ├── pwa.js                  install prompt & service worker registration
│   └── adm.js                  interaksi kecil di halaman /adm
├── api/
│   ├── download.js             endpoint utama downloader (server-side)
│   ├── telegram/webhook.js     bot Telegram owner-only untuk monitoring
│   └── admin/                  mekanisme session internal opsional (terpisah dari /adm)
├── lib/                        helper server-side (Redis, validasi URL, IP hashing, Telegram)
├── manifest.json, sw.js        PWA
├── vercel.json                 clean routes + security headers
├── package.json
└── .env.example
```

## 2. Environment Variables

Salin `.env.example` menjadi `.env` (untuk `vercel dev`) atau isi langsung di
dashboard Vercel → Project → Settings → Environment Variables:

| Variable                     | Keterangan                                          |
|-------------------------------|------------------------------------------------------|
| `KYZZ_API_URL`                | URL upstream downloader (default sudah benar)        |
| `KYZZ_API_KEY`                | API key upstream (`kyzz8337536735`, jangan diubah)   |
| `TELEGRAM_BOT_TOKEN`          | Token dari BotFather                                  |
| `TELEGRAM_OWNER_ID`           | `5641187072` (numeric ID owner, wajib)                |
| `TELEGRAM_WEBHOOK_SECRET`     | Secret token untuk verifikasi webhook Telegram        |
| `UPSTASH_REDIS_REST_URL`      | Dari dashboard Upstash                                |
| `UPSTASH_REDIS_REST_TOKEN`    | Dari dashboard Upstash                                |
| `IP_HASH_SECRET`              | String acak untuk hashing IP (rate-limit/abuse)       |
| `ADMIN_INTERNAL_SECRET`       | (Opsional) hanya jika ingin mengaktifkan session internal terpisah di `api/admin/*` — TIDAK terkait dengan halaman publik `/adm` |

API key upstream **hanya** dipakai di `api/download.js` (server-side) dan
tidak pernah dikirim ke frontend.

## 3. Font

Klipin memuat **Press Start 2P** dari Google Fonts (pixel font open-source
yang paling mirip tipografi Minecraft) lewat `<link>` di `<head>` setiap
halaman. Tidak perlu file font lokal atau setup tambahan — cukup deploy dan
langsung tampil. `vercel.json` sudah mengizinkan `fonts.googleapis.com` dan
`fonts.gstatic.com` di CSP.

## 4. Telegram Bot Setup

1. Buat bot lewat [@BotFather](https://t.me/BotFather), simpan token ke
   `TELEGRAM_BOT_TOKEN`.
2. Set webhook setelah deploy:
   ```
   curl -X POST https://api.telegram.org/bot<TOKEN>/setWebhook \
     -d url=https://domain-anda.vercel.app/api/telegram/webhook \
     -d secret_token=<TELEGRAM_WEBHOOK_SECRET>
   ```
3. Bot **hanya** merespons Telegram numeric ID `5641187072`. Username
   `JarzGoslingF` hanyalah identitas tampilan, bukan metode autentikasi.
4. Command yang tersedia: `/start /status /stats /today /errors /platforms
   /recent /help`. Tidak ada command shell/eval/backdoor.

## 5. Redis (Upstash)

Buat database di [Upstash](https://upstash.com), salin REST URL & token ke
environment variables. Redis dipakai untuk:
- Rate limit endpoint `/api/download` (per-IP yang di-hash, bukan IP mentah)
- Counter total/success/failed, statistik harian, statistik per platform
- Log event monitoring ringkas (TTL 7 hari, maksimal 50 entri)

Jika Redis belum dikonfigurasi, aplikasi tetap berjalan (fail-open) — hanya
statistik dan rate limit yang tidak aktif.

## 6. Deploy ke Vercel

```
npm install
vercel deploy
```

Atau hubungkan repository ke Vercel dashboard. `vercel.json` sudah
mengatur clean URL routing (`/cara-penggunaan`, `/larangan`, `/adm`) dan
security headers (CSP, X-Frame-Options, dll).

## 7. Keamanan

- Validasi URL ketat: hanya `http`/`https`, menolak localhost, `127.0.0.1`,
  `::1`, IP privat, hostname internal, dan URL dengan kredensial tertanam
  (lihat `lib/validateUrl.js`).
- IP tidak pernah disimpan mentah — selalu di-hash dengan `IP_HASH_SECRET`
  (lihat `lib/ip.js`).
- Response upstream tidak diteruskan mentah; parser di `api/download.js`
  memvalidasi `status`, `result`, `result.error`, dan `result.medias`
  sebelum menormalisasi ke bentuk aman untuk frontend.
- Rendering hasil di `js/main.js` menggunakan `textContent`/pembuatan
  elemen DOM manual, bukan `innerHTML` mentah, untuk mencegah injeksi dari
  metadata media.
- Kegagalan pengiriman Telegram di-catch terpisah dan tidak pernah membuat
  proses download pengguna gagal.

## 8. Catatan tentang `/adm`

`/adm` adalah halaman identitas publik developer PAJAR (portofolio,
Instagram, TikTok, dan link donasi) — **bukan** admin panel atau halaman
login, dan tidak dilindungi oleh Redis atau sesi apa pun. Monitoring
internal murni dilakukan melalui bot Telegram owner-only di atas.
