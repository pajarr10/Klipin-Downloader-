# KLIPIN

Universal media downloader dengan tema UI Minecraft Java Edition.
Developer: **PAJAR**

## Fitur

- Download video/audio/foto dari TikTok, YouTube, Instagram, Douyin, Pinterest,
  Facebook, CapCut, dan Spotify melalui satu input link.
- UI bertema Minecraft: pixel border button, panel HUD, loading screen ala
  Mojang, options menu ala Minecraft, 6 pilihan tema warna.
- PWA installable dengan custom install prompt.
- Backend serverless di Vercel, proxy aman ke API upstream (tidak pernah
  di-request langsung dari browser).
- Validasi anti-SSRF, rate limiting, security headers, admin session berbasis
  Upstash Redis + HTTP-only cookie.

## Struktur Project

```
klipin/
├── index.html
├── cara-penggunaan/index.html
├── larangan/index.html
├── adm/index.html
├── css/style.css
├── js/{main,theme,pwa,adm}.js
├── fonts/{minecraft-heading,minecraft-body}.woff2
├── lib/{urlGuard,redis,rateLimit,normalize,cookies}.js
├── api/download.js
├── api/admin/{login,verify,logout}.js
├── manifest.json
├── sw.js
├── vercel.json
├── package.json
├── .env.example
└── README.md
```

## Font

Font resmi "Minecraft" (Minecrafter/Mojangles) adalah properti Mojang dan
tidak didistribusikan bebas, jadi tidak disertakan di project ini.

Sebagai gantinya, `css/style.css` sudah otomatis memuat **Monocraft** —
font pixel open-source (lisensi MIT, dibuat fans, bukan produk resmi Mojang)
dari CDN jsDelivr:

```
https://cdn.jsdelivr.net/gh/IdreesInc/Monocraft@main/dist/Monocraft-ttf/Monocraft.ttf
```

Jadi website langsung tampil dengan font pixel tanpa setup tambahan.

Kalau kamu punya font pixel lain yang lebih kamu suka (mis. beli/legal punya
sendiri), cukup taruh file `.woff2` di:

```
fonts/minecraft-heading.woff2   ← dipakai untuk heading & teks PAJAR di loading
fonts/minecraft-body.woff2      ← dipakai untuk body text
```

Karena `@font-face` sudah didaftarkan dengan urutan: file lokal dulu, baru
CDN Monocraft sebagai fallback — begitu file lokal ada, browser otomatis
pakai itu duluan tanpa perlu ubah CSS.

## Preview / Menjalankan Secara Lokal

Tidak perlu install Vercel CLI. Cukup:

```bash
npm install
npm start
```

Buka **http://localhost:3000** di browser.

`server.js` di root project itu server preview lokal (Node `http` polos,
tanpa Express) yang serve semua halaman static dan otomatis menjalankan
setiap file di `api/*.js` persis seperti Vercel serverless function.
File ini **hanya untuk preview lokal** — saat deploy ke Vercel, `server.js`
tidak dipakai; Vercel otomatis mengubah tiap file di `api/` jadi function-nya
sendiri.

Kalau kamu tetap mau simulasi environment Vercel yang lebih presisi (routing,
headers dari `vercel.json`, dll), bisa juga pakai:

```bash
npx vercel dev
```

Keduanya sama-sama jalan di `http://localhost:3000`.

## Environment Variables

Salin `.env.example` menjadi `.env` lalu isi:

- `UPSTASH_REDIS_REST_URL` dan `UPSTASH_REDIS_REST_TOKEN` — dari dashboard
  [Upstash](https://console.upstash.com). Redis dipakai untuk rate limit dan
  sesi admin.
- `ADMIN_KEY_HASH` — fallback SHA-256 hash dari admin key, dipakai jika belum
  ada `admin:key_hash` di Redis. Generate dengan:

  ```bash
  node -e "console.log(require('crypto').createHash('sha256').update('KEY_KAMU').digest('hex'))"
  ```

Tanpa Redis, endpoint download tetap berjalan (fallback rate-limit di memori,
hanya untuk instance tunggal), tapi login admin akan menolak akses sampai
Redis dikonfigurasi.

## Deploy ke Vercel

```bash
npm i -g vercel
vercel
```

Set environment variables di dashboard Vercel (Project Settings → Environment
Variables) sesuai `.env.example`, lalu deploy ulang.

## Endpoint API

- `GET /api/download?url=<encoded-url>` — proxy aman ke scraper upstream,
  mengembalikan JSON ternormalisasi:

  ```json
  {
    "ok": true,
    "data": {
      "platform": "tiktok",
      "title": "...",
      "author": "...",
      "thumbnail": "...",
      "photos": [],
      "medias": [{ "type": "video", "label": "NO WATERMARK", "url": "..." }]
    }
  }
  ```

- `POST /api/admin/login` — body `{ "key": "..." }`, set cookie sesi jika key
  valid.
- `GET /api/admin/verify` — cek status sesi admin aktif.
- `POST /api/admin/logout` — hapus sesi admin.

## Keamanan

- Hanya `http`/`https` yang diizinkan; `localhost`, `127.0.0.1`, `::1`, IP
  privat, dan hostname internal ditolak sebelum request diteruskan ke
  upstream (lihat `lib/urlGuard.js`).
- Rate limit per-IP untuk `/api/download` dan `/api/admin/login`.
- Semua data dinamis dari API dirender lewat `textContent`, bukan
  `innerHTML` mentah.
- Security headers (CSP, X-Frame-Options, X-Content-Type-Options,
  Referrer-Policy, Permissions-Policy) diset lewat `vercel.json`.
- Admin key tidak pernah disimpan di frontend/localStorage — hanya dikirim
  sekali via POST, lalu server menyimpan sesi di Redis dan mengirim token
  lewat cookie `HttpOnly`.

## Lisensi

Internal project milik PAJAR.
