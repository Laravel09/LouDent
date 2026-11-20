# LouDent — Local Installation Guide

## Prerequisites

- **Node.js**: `>= 20.19.0`
- **npm**: `>= 10.0.0`
- **Supabase Project**: Existing Supabase project (`https://qlsfeqofszmtdkdedkqz.supabase.co`) or a separate development Supabase project.

---

## Step-by-Step Local Setup

### 1. Install Dependencies

From the project root:

```bash
npm install
```

### 2. Configure Local Environment Variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Edit `.env.local` and supply your **publishable** Supabase key (`sb_publishable_...`):

```ini
VITE_SUPABASE_URL=https://qlsfeqofszmtdkdedkqz.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY_HERE
VITE_SITE_URL=http://localhost:5173
```

> **Security Rule**: Never place a `sb_secret_...` or `service_role` key inside `.env.local` or any `VITE_` variable. Both `npm run check:env` and `src/lib/supabase.ts` actively scan for and block secret keys from running in the browser.

### 3. Validate Environment Configuration

```bash
npm run check:env
```

### 4. Start the Local Development Server

```bash
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## Running Verification & Tests Locally

| Command | Purpose |
|---|---|
| `npm run typecheck` | Runs `tsc --noEmit` across the TypeScript codebase |
| `npm test` | Runs Vitest unit tests (`src/test/frontend.test.ts`) |
| `npm run test:db` | Launches an isolated embedded PostgreSQL 17.5 instance, applies all 5 SQL migrations, and runs the 13-part RLS, concurrency, and security test suite |
| `npm run build` | Builds the optimized production bundle into `dist/` |
| `npm run preview` | Previews the production bundle locally on port `4173` |
