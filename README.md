# Jadwal Decoder

Public Gunadarma schedule decoder: GitHub Pages frontend + Cloudflare Worker OCR API.

## Cost design

- **GitHub Pages:** $0 for public repositories.
- **Cloudflare Workers:** use the Free plan. Requests stop at the free-plan limit instead of silently creating usage charges unless billing is deliberately enabled.
- **Workers AI:** one multimodal call per uploaded image; all date/time/course/room transforms run locally in the browser. Keep the Cloudflare account on the Free plan to hard-stop at the included daily allocation.
- **Lecturer matching:** no AI call; the Worker fetches and caches Gunadarma's public directory.

## Local setup

```bash
npm install
cp .env.example .env
npm run dev
npm test
npm run build
```

Pasted table text works even without an OCR backend.

## Deploy the Worker (free tier)

1. Create/login to a Cloudflare account and install Wrangler through this project (`npm install` already does it).
2. Run `npx wrangler login`.
3. Check `worker/wrangler.toml`; `ALLOWED_ORIGIN` is restricted to `https://mrchuntxt.github.io`.
4. Run `npm run worker:deploy` and copy the resulting `workers.dev` URL.

The Worker uses the Workers AI binding, so no AI key is stored in GitHub or sent to browsers.

## Deploy GitHub Pages

1. In the GitHub repository, open **Settings → Pages** and choose **GitHub Actions** as source.
2. Open **Settings → Secrets and variables → Actions → Variables**.
3. Create repository variable `VITE_OCR_API_URL` with the Worker URL, without a trailing slash.
4. Re-run the **Deploy GitHub Pages** workflow.

Public URL: `https://mrchuntxt.github.io/jadwal-decoder/`

## Input rules

Image upload accepts JPEG, PNG, or WebP and resizes client-side before the single OCR request. Pasted rows are parsed locally and can be separated with tabs, pipes, semicolons, or 2+ spaces.
