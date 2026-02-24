# Port Conflict & UI Display Issues - Solution

## Issue 1: Port Conflict (npm start fails)

### ❌ What Was Wrong

- Server was hardcoded to port 3000
- React dev server also uses port 3000 by default
- Conflict when running `npm start` locally

### ✅ Fixed

Server now uses smart port logic:

- **Development** (NODE_ENV ≠ production): Port **4500**
- **Production** (Render): Port **3000**

### 🚀 Local Development Now Works

```bash
npm start
# Server runs on: http://localhost:4500
# React client runs on: http://localhost:3000
# They communicate via Socket.IO on port 4500
```

---

## Issue 2: GameModeSelection Not Showing

### ❌ The Problem

When accessing the Render deployment URL, it shows **Rules.tsx** (from GameGrid) instead of **GameModeSelection**.

### 🔍 Root Cause

The pre-built client files in `packages/game-server/client/` are OLD and don't include the GameModeSelection component. They were built before this component was added.

### ✅ Solutions

#### Option A: Quick Fix (For Testing Render)

1. Go to **Render Dashboard** → Your Service
2. Click **"Manual Deploy"** to rebuild with the new port configuration
3. Try accessing the URL again
4. If GameModeSelection still doesn't show, the pre-built files need to be regenerated

#### Option B: Rebuild Web Client (Recommended Long-term)

The web client needs to be rebuilt to include GameModeSelection. However, the web build has TypeScript issues.

**Workaround Steps:**

1. **Fix TypeScript issues** in packages/web/:

   ```bash
   cd packages/web

   # Update problematic dependencies
   npm install --save-dev @types/express@4.17.21
   npm install --save-dev typescript@5.0.2
   ```

2. **Build the client**:

   ```bash
   cd packages/web
   NODE_ENV=production npm run build
   ```

3. **Copy new build to server**:

   ```bash
   cp -r build/* ../game-server/client/
   cd ../..
   ```

4. **Test locally**:

   ```bash
   npm run build:common && npm run build:server
   npm start
   ```

5. **Commit and deploy**:
   ```bash
   git add .
   git commit -m "Update client with GameModeSelection component"
   git push origin master
   # Then Manual Deploy on Render
   ```

---

## ✅ Changes Made in Latest Update

### Port Configuration

- ✅ Server now auto-detects development vs production
- ✅ Local dev: server on 4500, client on 3000
- ✅ Render: both on same port 3000 (as deployed together)

### Socket Connection

- ✅ React client already has correct logic for NODE_ENV
- ✅ Development: connects to `localhost:4500`
- ✅ Production: connects to `document.location.host` (current domain)

### Environment Files

- ✅ `.env.example` has correct variable names
- ✅ `.env.production` created for React
- ✅ Render environment variables configured

---

## 🧪 Testing Checklist

### Local Development

Test with `npm start`:

```bash
✅ Server starts on port 4500
✅ React client starts on port 3000
✅ Socket connects to localhost:4500
✅ No port conflict errors
✅ Game loads and shows GameModeSelection (if web is rebuilt)
```

### Production (Render)

After deploying:

```bash
✅ App loads at https://your-url.onrender.com
✅ Open browser console (F12)
✅ Look for: "🔌 Connecting to server at : https://your-url.onrender.com"
✅ WebSocket connects successfully
✅ GameModeSelection shows (or Rules if old client files)
```

---

## 📋 Next Steps

### Immediate (Test Current State)

1. Run `npm start` locally - **should work now without port conflict**
2. Manual Deploy on Render
3. Check browser console for Socket connection URL

### If GameModeSelection Still Missing on Render

You need to rebuild the web client:

1.  Try to build web: `cd packages/web && npm run build`
2.  If it fails, fix TypeScript issues
3.  If it succeeds, copy to server and redeploy

---

## 🆘 Common Issues

### "Port 3000 already in use"

✅ **Fixed** - Server now uses 4500 for development

### GameModeSelection not showing on Render

**Cause**: Pre-built client files are outdated
**Fix**: Rebuild web client and update pre-built files

### "🔌 Connecting to server at : http://localhost:4500" on Render

**Cause**: NODE_ENV not set to 'production'
**Fix**: Verify Render environment variables

---

## 📞 Key Configuration Files

- **Port Logic**: `packages/game-server/src/core/server.ts`
- **Socket Connection**: `packages/web/src/services/GameService.ts`
- **Render Config**: `render.yaml`
- **Route Logic**: `packages/web/src/components/Header/Header.tsx`

All changes committed and pushed to GitHub.
