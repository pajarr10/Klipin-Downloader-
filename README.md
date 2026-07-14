# KLIPIN

Universal media downloader dengan tema UI Minecraft Java Edition.
Developer: **PAJAR**

Dokumen ini mencakup perubahan besar terbaru: migrasi downloader ke
`btch-downloader` (scraper lama yang diblokir Cloudflare sudah dihapus total)
dan penambahan bot Telegram sebagai panel monitoring/admin berbasis webhook.

---

## 1. Ringkasan Perubahan

### File yang diubah/dibuat

**Diganti total:**
- `api/download.js` — sekarang pakai `KlipinDownloader` (`btch-downloader`), bukan proxy ke `download.amane-acel.web.id` yang lama.
- `js/main.js` — parser hasil disesuaikan ke response contract baru (`status`, `media[]` dengan `quality`/`size`, `author` object).
- `lib/redis.js` — ditulis ulang pakai POST command (binary-safe) + tambahan `hash/set/list/sorted-set` untuk kebutuhan analytics & admin.

**Baru:**
- `lib/klipinDownloader.js` — class downloader (validasi URL, SSRF-guard, timeout 60 detik, normalisasi response).
- `lib/admins.js` — sistem owner/admin Telegram (Redis set, owner via ID numerik dari env).
- `lib/analytics.js` — pencatat & agregator statistik (request, sukses/gagal, platform, browser/OS/device, activity log, error summary — semua dengan retensi terbatas).
- `lib/ipHash.js` — hashing IP (privacy-preserving, tidak pernah simpan IP mentah).
- `lib/userAgent.js` — parser User-Agent sisi server (OS/browser/device), tidak percaya data dari frontend.
- `lib/telegramApi.js` — client minimal Telegram Bot API (`sendMessage`, `editMessageText`, `answerCallbackQuery`, `setWebhook`) pakai `fetch`.
- `api/telegram.js` — webhook Telegram (bukan polling), menu inline keyboard, admin management owner-only.
- `api/health.js` — health check ringan (`GET /api/health`).
- `scripts/set-telegram-webhook.js` — helper CLI untuk daftar webhook.

**Dihapus:**
- `lib/normalize.js` (parser response upstream lama) — sudah tidak relevan, digantikan `normalize()` di dalam `KlipinDownloader`.
- Seluruh referensi ke `download.amane-acel.web.id` dan `axios` (sudah dicek dengan `grep -r`, bersih — lihat bagian "Verifikasi" di bawah).

**Disesuaikan:**
- `css/style.css` — style untuk baris author (avatar/nama/username), empty-state, perbaikan overflow judul/kualitas media panjang, breakpoint tambahan untuk layar <400px.
- `package.json` — dependency `axios` diganti `btch-downloader`.
- `vercel.json` — tambah `functions.maxDuration` (60 detik untuk `/api/download`, 30 detik untuk `/api/telegram`).
- `.env.example` — tambah semua variabel Telegram + `IP_HASH_SALT`.
- `server.js` (preview lokal) — tidak perlu diubah strukturnya karena sudah generik men-dispatch semua file di `api/*.js`; endpoint baru otomatis ikut jalan.

### Bug yang ditemukan

1. **Scraper lama gagal karena Cloudflare** — akar masalah yang diminta untuk diperbaiki; seluruh integrasi lama sudah dihapus.
2. **Bug urutan validasi di `KlipinDownloader.download()`** (ditemukan saat smoke test internal): pengecekan "modul downloader tersedia" dijalankan **sebelum** validasi URL, sehingga input kosong/tidak valid/SSRF ikut mengembalikan pesan generik 500 alih-alih pesan validasi 400 yang benar. Sudah diperbaiki — validasi URL sekarang selalu jalan duluan.
3. **State in-memory tidak aman untuk serverless** — desain awal yang dihindari sejak awal dengan menaruh semua counter/admin list di Redis (Upstash), bukan variabel Node biasa, karena instance Vercel bisa mati/berganti kapan saja.
4. **Body request tanpa batas ukuran** pada `api/admin/login.js` dan `api/telegram.js` — berpotensi disalahgunakan untuk mengirim payload raksasa. Sudah ditambahkan cap ukuran (64KB untuk login, 1MB untuk webhook Telegram).
5. **Response contract lama (`ok`, `data.medias`, `data.photos`) tidak cocok** dengan format baru yang diwajibkan (`status`, `media[]`, `author`). `js/main.js` ditulis ulang total untuk field ini, termasuk memastikan field `null` (thumbnail/author/quality/size kosong) tidak pernah dirender sebagai teks `"null"`/`"undefined"`.

### Bug yang diperbaiki
Lihat daftar di atas — kelima bug tersebut sudah diperbaiki langsung di kode, bukan sekadar dicatat.

---

## 2. Struktur Endpoint

| Method | Path | Fungsi |
|---|---|---|
| GET | `/api/download?url=<encoded-url>` | Proses URL media lewat `btch-downloader`, kembalikan JSON ternormalisasi |
| GET | `/api/health` | Health check ringan, tidak memanggil downloader |
| POST | `/api/telegram` | Webhook Telegram (butuh header `X-Telegram-Bot-Api-Secret-Token` yang cocok) |
| POST | `/api/admin/login` | Login admin panel web `/adm` (terpisah dari sistem admin Telegram) |
| GET | `/api/admin/verify` | Cek sesi admin web aktif |
| POST | `/api/admin/logout` | Hapus sesi admin web |

> Catatan: sistem admin **web** (`/adm`, `ADMIN_KEY_HASH`) dan sistem
> **owner/admin Telegram** (`TELEGRAM_OWNER_ID`, `lib/admins.js`) adalah dua
> hal terpisah yang sengaja tidak digabung — satu untuk panel web, satu untuk
> bot monitoring.

### Contoh response `/api/download`

Sukses:
```json
{
  "status": true,
  "platform": "tiktok",
  "title": "Ransomware My server...",
  "thumbnail": "https://...",
  "author": { "username": "fsociety067", "name": "Ryzen Fsociety", "avatar": "https://..." },
  "media": [
    { "type": "video", "quality": "MP4 1018p [1018x576]", "size": "147.7 KB", "url": "https://..." },
    { "type": "audio", "quality": "Audio [MP3]", "size": null, "url": "https://..." }
  ]
}
```

Gagal:
```json
{ "status": false, "message": "URL wajib diisi" }
```

HTTP status code yang dipakai: `400` (input tidak valid), `405` (method salah),
`422` (media tidak ditemukan), `429` (rate limit), `500` (modul downloader
tidak tersedia), `502` (downloader gagal memproses), `504` (timeout 60 detik).

---

## 3. Environment Variables

Isi lewat dashboard Vercel (Project Settings → Environment Variables) atau
file `.env` lokal (lihat `.env.example`). **Tidak ada nilai secret yang
ditulis di sini** — hanya nama variabel dan penjelasannya:

| Variabel | Wajib? | Keterangan |
|---|---|---|
| `UPSTASH_REDIS_REST_URL` | Ya, untuk analytics/admin/rate-limit persisten | REST endpoint Upstash Redis |
| `UPSTASH_REDIS_REST_TOKEN` | Ya (bersamaan dengan di atas) | Token REST Upstash |
| `ADMIN_KEY_HASH` | Opsional | Fallback SHA-256 hash admin key untuk panel `/adm` |
| `TELEGRAM_BOT_TOKEN` | Ya, untuk fitur bot | Token dari @BotFather |
| `TELEGRAM_OWNER_ID` | Ya, untuk fitur bot | ID numerik Telegram owner (bukan username) |
| `TELEGRAM_OWNER_USERNAME` | Opsional | Hanya untuk referensi/dokumentasi, tidak dipakai untuk autentikasi |
| `TELEGRAM_WEBHOOK_SECRET` | Ya, untuk fitur bot | String acak untuk validasi header webhook |
| `IP_HASH_SALT` | Sangat disarankan | Salt untuk hashing IP di analytics |

Tidak ada token/secret yang di-hardcode di source code, frontend, atau
response API mana pun — semua dibaca dari `process.env` di sisi server.

---

## 4. Cara Set Telegram Webhook

1. Deploy dulu ke Vercel (lihat bagian 5) supaya kamu punya domain, misalnya
   `https://klipin.vercel.app`.
2. Isi environment variables `TELEGRAM_BOT_TOKEN` dan `TELEGRAM_WEBHOOK_SECRET`
   di Vercel, lalu redeploy.
3. Jalankan helper script dari komputer kamu:

   ```bash
   TELEGRAM_BOT_TOKEN=xxxxx TELEGRAM_WEBHOOK_SECRET=yyyyy \
     node scripts/set-telegram-webhook.js https://klipin.vercel.app
   ```

   Ini akan memanggil `setWebhook` Telegram dan mendaftarkan
   `https://klipin.vercel.app/api/telegram` sebagai endpoint webhook, dengan
   `secret_token` yang sama seperti `TELEGRAM_WEBHOOK_SECRET` — Telegram akan
   mengirim secret ini di header `X-Telegram-Bot-Api-Secret-Token` pada setiap
   request, dan `api/telegram.js` menolak request yang headernya tidak cocok.

4. Tes dengan mengirim `/start` ke bot dari akun Telegram dengan ID yang sama
   seperti `TELEGRAM_OWNER_ID`. Menu admin (dengan tombol "Admin Management")
   akan muncul.

Bot ini **tidak** memakai `bot.launch()` atau long polling — semua update
masuk lewat webhook HTTP POST yang stateless, sesuai model serverless Vercel.

---

## 5. Preview Lokal & Deploy

### Preview lokal (tanpa Vercel CLI)

```bash
npm install
npm start
```

Buka `http://localhost:3000`. `server.js` men-dispatch semua file di `api/`
persis seperti serverless function Vercel — endpoint baru (`/api/telegram`,
`/api/health`) otomatis ikut berjalan tanpa perubahan tambahan.

### Deploy ke Vercel

```bash
npm i -g vercel
vercel
```

Set semua environment variable di atas lewat dashboard Vercel, lalu
`vercel --prod` (atau redeploy dari dashboard).

> Catatan jujur: `functions.maxDuration: 60` di `vercel.json` untuk
> `/api/download` mengikuti batas timeout 60 detik yang diminta. Ketersediaan
> durasi function 60 detik tergantung plan Vercel yang kamu pakai saat
> deploy — ini **belum bisa diverifikasi** dari sandbox pengembangan ini
> karena tidak ada akses ke akun Vercel sungguhan. Kalau deploy-mu di plan
> yang membatasi durasi lebih pendek, turunkan juga `this.timeout` di
> `lib/klipinDownloader.js` supaya sinkron.

---

## 6. Font

Font resmi "Minecraft" adalah properti Mojang dan tidak didistribusikan
bebas. `css/style.css` memuat **Monocraft** (font pixel open-source, lisensi
MIT, dibuat fans) dari CDN jsDelivr sebagai default, dan otomatis memakai
`fonts/minecraft-heading.woff2` / `fonts/minecraft-body.woff2` duluan kalau
kamu menaruh file font sendiri di situ.

---

## 7. Keamanan

- **Input & SSRF**: `KlipinDownloader.validateUrl()` menolak non-http(s),
  serta menolak target localhost/IP privat/hostname internal lewat
  `lib/urlGuard.js` sebelum URL pernah disentuh oleh `btch-downloader`.
- **Rate limiting**: per-IP untuk `/api/download` (15 req/menit) dan
  `/api/admin/login` (8 req/menit), lewat `lib/rateLimit.js` + Redis
  (fallback in-memory kalau Redis belum dikonfigurasi, hanya untuk dev).
- **Timeout**: 60 detik keras di `KlipinDownloader.download()` lewat
  `Promise.race`, supaya request yang menggantung tidak menahan function
  Vercel selamanya.
- **Error handling**: pesan error ke client selalu dari daftar pesan yang
  sudah ditentukan (`publicMessage()` di `api/download.js`) — stack trace,
  path file, dan detail internal lain hanya masuk `console.error` di log
  server, tidak pernah ke response.
- **Telegram webhook**: wajib header secret yang cocok (`401` kalau tidak),
  body size capped 1MB, otorisasi berbasis ID numerik (bukan username),
  admin management (`/addadmin`, `/removeadmin`) hanya bisa dipanggil owner
  — dicek dua lapis (di `api/telegram.js` dan lagi di `lib/admins.js`).
- **Analytics privasi**: IP di-hash (SHA-256 + salt, dipotong 16 karakter)
  sebelum disimpan, User-Agent diparsing sendiri di server (tidak percaya
  data dari frontend), `media` URL bertoken dari hasil download **tidak**
  pernah disimpan ke activity log — hanya platform/judul(dipotong)/jenis/status.
  Retensi: activity log 200 entri terakhir, error log 50 entri terakhir
  (auto-trim via `LTRIM`, bukan disimpan selamanya).
- **Body size limit & method validation**: semua endpoint POST mengecek
  `req.method` dan membatasi ukuran body sebelum parsing.
- **Security headers**: CSP, `X-Frame-Options`, `X-Content-Type-Options`,
  `Referrer-Policy`, `Permissions-Policy` diset lewat `vercel.json`.
- **Tidak ada arbitrary fetch/proxy**: `/api/download` hanya pernah
  memanggil `btch-downloader`, tidak pernah melakukan fetch bebas ke URL apa
  pun secara langsung dari kode kita sendiri.

---

## 8. Verifikasi yang Sudah & Belum Dilakukan

**Sudah diverifikasi di sandbox ini (bisa direproduksi):**
- Seluruh file JavaScript lolos `node --check` (syntax valid).
- `manifest.json`, `vercel.json`, `package.json` valid JSON.
- Server preview lokal (`node server.js`) berhasil menyajikan semua halaman
  statis (`/`, `/cara-penggunaan`, `/larangan`, `/adm`) dengan status 200.
- `GET /api/health` mengembalikan JSON yang benar.
- `GET /api/download` dengan input kosong/tidak valid/SSRF mengembalikan
  `400` dengan pesan yang sesuai (bug urutan validasi sudah ditemukan & diperbaiki
  lewat pengetesan ini).
- `POST /api/telegram` menolak request tanpa header secret yang benar
  (`401`), sesuai desain.
- `grep -r` untuk `axios` dan `amane` di seluruh project mengonfirmasi tidak
  ada sisa referensi scraper/dependency lama.

**BELUM bisa diverifikasi di sandbox ini** (perlu akses eksternal/kredensial
yang tidak tersedia di lingkungan pengembangan ini) — jangan dianggap sudah
lolos test sampai kamu coba sendiri:
- Panggilan nyata ke `btch-downloader` (`aio()`) ke TikTok/YouTube/dst,
  karena `npm install` di sandbox ini tidak punya akses registry npm
  (`403 Forbidden` saat mencoba). Instal dependency ini di mesin/CI kamu
  sendiri sebelum deploy.
- Koneksi nyata ke Upstash Redis (analytics, admin list, rate limit
  persisten) — kode sudah menangani kasus "Redis belum dikonfigurasi" dengan
  aman (fallback/tanpa crash), tapi perilaku dengan Redis sungguhan perlu
  kamu tes setelah mengisi kredensial asli.
- Alur end-to-end bot Telegram (kirim `/start`, klik tombol inline, dsb.)
  karena butuh token bot asli dan webhook yang benar-benar terdaftar di
  Telegram — tidak bisa disimulasikan tanpa token nyata.
- Perilaku `functions.maxDuration: 60` di plan Vercel yang sebenarnya kamu
  pakai (lihat catatan di bagian Deploy).

Silakan jalankan `npm install` lalu `npm start` di mesin kamu sendiri (yang
punya akses internet) untuk memverifikasi bagian-bagian di atas sebelum
deploy ke production.

---

## 9. Lisensi

Internal project milik PAJAR.
