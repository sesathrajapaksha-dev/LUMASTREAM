# LumaStream Backend — Setup Guide

## What This Does
- Moves your Luma Keys **off the frontend** (no more hardcoded passwords in HTML)
- Gives users a **7-day session token** so they don't re-enter the key every visit
- Lets you **add/remove keys** without touching the HTML file
- Free to host on **Vercel**

---

## Folder Structure
```
lumastream-backend/       ← deploy THIS to Vercel
  api/
    index.js              ← the API server
  package.json
  vercel.json
  .env.example

index.html                ← your frontend (goes to GitHub Pages / LUMASTREAM repo)
```

---

## Step 1 — Deploy the Backend to Vercel

1. Create a free account at https://vercel.com
2. Install Vercel CLI:
   ```bash
   npm install -g vercel
   ```
3. Go into the backend folder:
   ```bash
   cd lumastream-backend
   ```
4. Deploy:
   ```bash
   vercel
   ```
   - Select "No" to existing project
   - Name it `lumastream-backend`
   - It will give you a URL like: `https://lumastream-backend.vercel.app`

---

## Step 2 — Set Environment Variables in Vercel

Go to: **Vercel Dashboard → lumastream-backend → Settings → Environment Variables**

Add these three:

| Name | Value |
|------|-------|
| `LUMA_KEYS` | `luma26,sesathr` (comma-separated, add more anytime) |
| `ADMIN_TOKEN` | A long secret password only you know, e.g. `MySecret@2026!` |
| `TOKEN_SECRET` | Another random string, e.g. `xK9#mP2$qL8nR5vT` |

After adding, click **Redeploy**.

---

## Step 3 — Update index.html

Open `index.html`, find this line near the top of the JavaScript:

```javascript
const LUMASTREAM_API = 'https://lumastream-backend.vercel.app';
```

Replace the URL with **your actual Vercel deployment URL**.

---

## Step 4 — Push index.html to GitHub

```bash
git add index.html
git commit -m "connect to backend API"
git push
```

---

## Managing Keys (Adding / Removing Users)

Use these API calls with your ADMIN_TOKEN:

### List all keys
```bash
curl https://lumastream-backend.vercel.app/api/admin/keys \
  -H "Authorization: Bearer MySecret@2026!"
```

### Add a new key
```bash
curl -X POST https://lumastream-backend.vercel.app/api/admin/keys \
  -H "Authorization: Bearer MySecret@2026!" \
  -H "Content-Type: application/json" \
  -d '{"key": "newkey123"}'
```
Then copy the `envVar` value from the response and update `LUMA_KEYS` in Vercel.

### Remove a key (revoke access)
```bash
curl -X DELETE https://lumastream-backend.vercel.app/api/admin/keys/oldkey \
  -H "Authorization: Bearer MySecret@2026!"
```
Then update `LUMA_KEYS` in Vercel with the new list.

---

## How Session Tokens Work

- When a user logs in, the API returns a **signed token** valid for 7 days
- The token is stored in `localStorage` in the browser
- Next visit: the frontend checks the token automatically — no re-login needed
- Revoking a key **immediately invalidates** all tokens for that key
- No database needed — it's all stateless HMAC signing

---

## Local Development (optional)

```bash
cd lumastream-backend
npm install
cp .env.example .env        # edit .env with your values
node api/index.js
```
API runs at `http://localhost:3000`
