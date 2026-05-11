# Skill: Bun + Vite Single-Port Architecture

Cara menjalankan backend (Elysia/Bun) dan frontend (React + Vite) pada **satu port** tanpa reverse proxy, menggunakan Vite `middlewareMode`.

---

## Konsep Inti

Normalnya Vite menjalankan dev server sendiri di port 5173. Di arsitektur ini, Vite **tidak punya port** — dia dijalankan sebagai middleware function yang dipanggil oleh Elysia. Semua traffic masuk lewat satu port Bun, lalu di-routing secara internal.

```
Browser → port 3111 (Elysia/Bun)
              │
              ▼  onRequest hook (sebelum route matching)
        isApiRoute(pathname)?
         /api/, /webhooks/, /ws/, /health, /mcp
              │
         YES  │  NO
              ▼  ▼
         Elysia  serveFrontend()
         routes      │
                DEV: Vite middleware
               PROD: static files dari dist/
```

---

## Cara Kerja

### 1. Vite dijalankan dalam `middlewareMode`

```ts
// src/vite.ts
import { createServer as createViteServer } from 'vite'

export async function createVite() {
  return createViteServer({
    server: {
      middlewareMode: true,  // ← tidak buka port, hanya expose middleware handler
      hmr: { port: 24678 }, // ← HMR WebSocket di port terpisah (bukan port utama)
    },
    appType: 'custom',       // ← Vite tidak inject HTML fallback otomatis
  })
}
```

`middlewareMode: true` + `appType: 'custom'` berarti Vite hanya menjadi objek dengan property `.middlewares` (Connect-compatible handler), tanpa membuka port apapun.

### 2. Elysia mengintersep semua request via `onRequest`

```ts
// src/index.tsx
const app = createApp()
  .onRequest(async ({ request }) => {
    const pathname = new URL(request.url).pathname

    // Handler khusus dev (click-to-source)
    if (!isProduction && pathname === '/__open-in-editor' && request.method === 'POST') {
      // ... buka editor
      return new Response('ok')
    }

    // Non-API → tangani sebagai frontend
    if (!isApiRoute(pathname)) {
      return serveFrontend(request)
    }
    // undefined → lanjut ke route matching Elysia normal
  })
  .listen(env.PORT)
```

`onRequest` jalan **sebelum** Elysia melakukan route matching. Jika handler return `Response`, Elysia langsung kirim itu — route Elysia tidak disentuh.

### 3. Routing: API vs Frontend

```ts
const API_PREFIXES = ['/api/', '/webhook/', '/webhooks/', '/ws/', '/health', '/mcp']

function isApiRoute(pathname: string): boolean {
  return API_PREFIXES.some((p) => pathname.startsWith(p)) || pathname === '/health'
}
```

Semua yang tidak masuk daftar ini dianggap frontend (SPA route atau asset Vite).

---

## Dev Mode: Bridge Bun ↔ Vite

Ini bagian paling teknis. Bun menggunakan Web Standard API (`Request`/`Response`), sedangkan Vite `middlewareMode` menggunakan Node.js API (`http.IncomingMessage`/`http.ServerResponse`). Perlu adapter manual:

```ts
async function serveFrontend(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const pathname = url.pathname

  if (!isProduction && vite) {
    // SPA route → transform index.html via Vite (inject HMR scripts, dll)
    if (pathname === '/' || (!pathname.includes('.') && !pathname.startsWith('/@'))) {
      let html = fs.readFileSync('index.html', 'utf-8')
      html = await vite.transformIndexHtml(pathname, html)
      return new Response(html, { headers: { 'Content-Type': 'text/html' } })
    }

    // Asset/module request (misal /@react-refresh, /src/App.tsx?t=123)
    // → Bridge: Bun Request → Node.js-compatible req/res objects → Response
    return new Promise<Response>((resolve) => {
      const req = /* proxy Request sebagai IncomingMessage */ ...
      const chunks: Buffer[] = []
      const res = {
        statusCode: 200,
        headers: {},
        setHeader(name, value) { ... },
        writeHead(code, ...) { ... },
        write(chunk) { chunks.push(chunk); return true },
        end(data?) {
          resolve(new Response(Buffer.concat(chunks), {
            status: this.statusCode,
            headers: this.headers,
          }))
        },
        // ... event emitter stubs (once, on, emit, removeListener)
      }

      vite.middlewares(req, res, (err) => {
        resolve(err
          ? new Response(err.stack, { status: 500 })
          : new Response('Not Found', { status: 404 })
        )
      })
    })
  }

  // === PRODUCTION (lihat bagian bawah) ===
}
```

**Kenapa perlu bridge?** Vite memanggil `res.setHeader()`, `res.write()`, `res.end()` — ini Node.js API. Bun tidak punya `http.ServerResponse`. Bridge ini "pura-pura" jadi Node.js response, mengumpulkan chunk, lalu resolve Promise dengan Web `Response`.

---

## Production Mode: Static Files

Di production, Vite tidak jalan sama sekali. Elysia langsung serve file dari `dist/`:

```ts
// Production: serve static + SPA fallback
const filePath = path.join('dist', pathname === '/' ? 'index.html' : pathname)

if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
  const isHashed = pathname.startsWith('/assets/')
  return new Response(Bun.file(filePath), {
    headers: {
      'Content-Type': contentType[ext] ?? 'application/octet-stream',
      // File di /assets/ punya hash di nama → cache permanen
      'Cache-Control': isHashed ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
    },
  })
}

// SPA fallback: semua route yang tidak match file → index.html
return new Response(Bun.file('dist/index.html'), {
  headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' },
})
```

---

## Port yang Terlibat

| Port | Siapa | Keterangan |
|------|-------|------------|
| `3111` (atau `PORT` env) | Elysia/Bun | Satu-satunya port yang terbuka untuk traffic HTTP |
| `24678` | Vite HMR | WebSocket untuk Hot Module Replacement (dev only, tidak perlu dibuka ke publik) |

---

## Lifecycle Dev Server (`serve.ts`)

Ada masalah Bun-specific: `SO_REUSEPORT` memungkinkan dua proses binding ke port yang sama. Kalau `bun run dev` dijalankan ulang saat proses lama masih hidup, traffic akan tersplit antara dua proses — API bisa 404 di proses yang salah.

```ts
// src/serve.ts
function takeOver() {
  // Baca PID file dari proses sebelumnya
  if (fs.existsSync(PID_FILE)) {
    const prev = Number(fs.readFileSync(PID_FILE, 'utf-8').trim())
    if (Number.isFinite(prev) && prev !== process.pid && isAlive(prev)) {
      process.kill(prev, 'SIGTERM')  // Kill proses lama
    }
  }
  fs.writeFileSync(PID_FILE, String(process.pid))
  // Cleanup PID file saat exit/SIGINT/SIGTERM
}

takeOver()
import('./index.tsx')  // Dynamic import: delay satu microtask agar kernel release socket lama
```

Dynamic import `import('./index.tsx')` juga mengatasi Bun HMR race condition (EADDRINUSE) karena delay satu microtask memberi waktu kernel melepas socket lama.

---

## Dependency

Tidak ada dependency tambahan di luar yang sudah ada:

- **Elysia** — HTTP server + `onRequest` hook
- **Vite** — `createServer` dengan `middlewareMode: true`
- `node:fs`, `node:path` — untuk static file serving

---

## Checklist Implementasi

- [ ] Vite diinisialisasi dengan `middlewareMode: true` dan `appType: 'custom'`
- [ ] HMR WebSocket di port terpisah (`hmr: { port: 24678 }`) — bukan port utama
- [ ] `onRequest` Elysia memeriksa `isApiRoute()` sebelum route matching
- [ ] Bridge Bun↔Vite di `serveFrontend()` untuk asset requests (dev)
- [ ] `vite.transformIndexHtml()` untuk SPA routes (dev)
- [ ] Static file serving + SPA fallback dari `dist/` (production)
- [ ] `serve.ts` dengan PID takeover untuk mencegah dual-instance split traffic

---

## Tanda Implementasi Berhasil

| Tes | Yang Diharapkan |
|-----|----------------|
| `GET /` | HTML dengan HMR script ter-inject (dev) |
| `GET /api/auth/session` | JSON response dari Elysia |
| `GET /src/frontend/App.tsx?t=123` | JS module dari Vite (dev) |
| Edit komponen → save | Browser hot-reload tanpa full refresh |
| `GET /` di production | HTML dari `dist/index.html` |
| `GET /assets/index-abc123.js` | JS dengan `Cache-Control: immutable` |
| `GET /pm` (SPA route) | `dist/index.html` (SPA fallback) |
| Jalankan dev dua kali | Proses lama ter-kill, tidak ada split traffic |
