# LouDent — Vercel Hobby Deployment Guide

> **Note**: Vercel Hobby is free ($0/month) and intended for personal, academic, and non-commercial demonstrations. Should LouDent later be operated commercially by a dental clinic, upgrade to Vercel Pro or host the static Vite `dist/` bundle on an appropriate commercial static host.

---

## 1. Included `vercel.json` Configuration

The project root includes `vercel.json` pre-configured for Vite + Supabase Auth callbacks:

- **Build command**: `npm run build` (`tsc --noEmit && vite build`)
- **Output directory**: `dist`
- **SPA Routing**:
  - `/auth/confirm` and all non-asset routes rewrite to `/index.html`.
- **Security Headers**:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin` (and `no-referrer` + `Cache-Control: no-store` on `/auth/confirm` so one-time verification/recovery tokens are never leaked via `Referer` headers or cached).
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`

---

## 2. Environment Variables on Vercel

In **Vercel Dashboard → Project Settings → Environment Variables**, configure only these three public variables:

| Name | Value | Environment |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://qlsfeqofszmtdkdedkqz.supabase.co` | Production, Preview, Development |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_...` | Production, Preview, Development |
| `VITE_SITE_URL` | `https://<your-project>.vercel.app` | Production |

> **Never** add `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` to Vercel Environment Variables. The frontend bundle runs entirely in the user's browser and relies on PostgreSQL Row Level Security and `SECURITY DEFINER` RPCs.

---

## 3. Update Supabase Auth Redirect URLs

After Vercel assigns your domain (`https://<your-project>.vercel.app`), update **Supabase Dashboard → Authentication → URL Configuration**:

1. **Site URL**: `https://<your-project>.vercel.app`
2. **Redirect URLs**:
   - `https://<your-project>.vercel.app/auth/confirm`
   - `http://localhost:5173/auth/confirm` (keep for local testing)

If you deployed the `provision-dentist` Edge Function, also update its allowed origin secret:

```bash
npx supabase secrets set \
  LOUDENT_SITE_URL=https://<your-project>.vercel.app \
  LOUDENT_ALLOWED_ORIGINS=http://localhost:5173,https://<your-project>.vercel.app
```
