# Deploying to Render.com - Complete Guide

## ✅ Pre-Deployment Status

Your project is **READY FOR DEPLOYMENT** after the following fixes were applied:

### ✅ Issues Fixed

- **TypeScript 3.0.3 → 4.9.4**: Updated TypeScript version to be compatible with modern type definitions
- **Package versions aligned**: Removed incompatible @types/bluebird and @types/node conflicts
- **Build process streamlined**: Removed problematic web client rebuild (using pre-built files)
- **ReconnectRequestPayload fixed**: TypeScript interface consistency
- **Server tsconfig updated**: Proper Jest type declarations and test exclusion

## 📋 Step-by-Step Deployment (5 minutes)

### Step 1: Verify Local Build Works

```bash
# Go to project directory
cd /Users/praveenantony/dev/repos/56-card-game

# Test the production build locally
npm run build:common && npm run build:server

# Verify output
echo "✅ Build successful if no errors above"
```

**Expected output**: No errors, compilation completes silently.

---

### Step 2: Commit and Push to GitHub

```bash
# Check what changed
git status

# Stage all changes
git add .

# Commit with deployment message
git commit -m "Deploy to Render: Fix TypeScript version, align dependencies"

# Push to GitHub (assumes origin is set)
git push origin main
```

**If git remote is not set:**

```bash
# Add your GitHub repository
git remote add origin https://github.com/YOUR_USERNAME/56-card-game.git
git push origin main
```

---

### Step 3: Create Render Account (if needed)

1. Go to **[render.com](https://render.com)**
2. Click **"Sign up"** (or login if you have an account)
3. Use GitHub to signup (recommended for easy repo connection)

---

### Step 4: Deploy on Render

#### Option A: Quick Deploy (Recommended for First Time)

1. Go to **[render.com/dashboard](https://render.com/dashboard)**
2. Click **"New +" → "Web Service"**
3. Click **"Connect Repository"**
4. Select your **56-card-game** repository
5. Click **"Connect"**
6. Render will auto-fill settings from `render.yaml`:
   - **Service Name**: 56-card-game
   - **Environment**: Node
   - **Build Command**: `npm install && npm run build:common && npm run build:server`
   - **Start Command**: `cd packages/game-server && node dist/index.js`
   - **Port**: 3000
   - **Plan**: Free
7. Click **"Create Web Service"**
8. **Wait 2-3 minutes** for build and deployment

#### Option B: Manual Configuration (if auto-fill doesn't work)

1. Create a new Web Service on Render
2. Set these values exactly:

| Setting           | Value                                                         |
| ----------------- | ------------------------------------------------------------- |
| **Name**          | 56-card-game                                                  |
| **Environment**   | Node                                                          |
| **Build Command** | `npm install && npm run build:common && npm run build:server` |
| **Start Command** | `cd packages/game-server && node dist/index.js`               |
| **Port**          | 3000                                                          |
| **Instance Type** | Free                                                          |
| **Region**        | US East (or your preference)                                  |

3. Click **"Create Web Service"**

---

### Step 5: Wait for Deployment

Watch the **Logs** tab:

```
Building...
Installing dependencies...
Building common package...
Building server package...
Launching application...
Server started and listening at port 3000 ✅
```

✅ When you see **"Service is running"**, deployment is complete!

---

### Step 6: Test Your Deployment

1. **Get your URL**: Render shows it at the top of the page (e.g., `https://56-card-game.onrender.com`)
2. **Open in browser**: Click the URL or copy-paste it
3. **You should see**: The card game UI loads in the browser

#### Test Gameplay

- [ ] Load the game UI
- [ ] Start a new game
- [ ] Join as multiple players (open multiple browser windows)
- [ ] Play a few rounds
- [ ] Check that bidding, card play, and scoring work

---

## 🔴 If Deployment Fails

### Check the Logs

1. Go to Render dashboard → Your service
2. Click **"Logs"** tab
3. Scroll down to see errors

### Common Issues & Fixes

#### ❌ **Build Command Failed**

```
npm ERR! Cannot find module
npm ERR! Call to /usr/bin/npm failed
```

**Fix**:

- Verify all files were committed: `git status`
- Push again: `git add . && git commit -m "Fix" && git push origin main`
- Click "Manual Deploy" in Render to rebuild

---

#### ❌ **Port Binding Error**

```
Error: Port 4500 already in use
```

**Fix**:

- Go to Settings → Environment Variables
- Verify `PORT=4500` is set
- Click "Manual Deploy"

---

#### ❌ **Server Crashes After Starting**

```
Error: Cannot find module '@rcg/common'
```

**Fix**:

- Modules weren't built correctly
- Check `packages/common/dist` exists locally
- Rebuild locally and push: `npm run build:common && git add . && git commit -m "Rebuild" && git push`

---

## 📊 Monitoring Your Deployment

### Check Logs

```
Render Dashboard → Your Service → Logs (continuous feed)
```

### Common Log Messages

✅ **Good**: `Server started and listening at port 3000`

⚠️ **Warning**: First request takes 5-10 seconds (free tier cold start)

🔴 **Bad**: `Error`, `failed`, `exit code 1`

---

## 🆘 Troubleshooting

### Server Won't Start

1. Check logs for error message
2. Verify your code builds locally: `npm run build:common && npm run build:server`
3. Common causes:
   - Missing environment variables
   - Port conflicts
   - Missing dependencies

### Game Doesn't Load

1. Open browser's Developer Tools (F12)
2. Look for errors in Console tab
3. Check if server is running (status should say "Running")
4. Wait 10 seconds and refresh

### Multiple Game Sessions Don't Work

- Known limitation: timer issues with concurrent games
- Check `CHECKLIST.md` for more info

---

## 🔄 Redeploying (After Making Changes)

```bash
# Make changes to code
# ... edit files ...

# Test locally
npm run build:common && npm run build:server

# Commit and push
git add .
git commit -m "Your change description"
git push origin main

# Go to Render and click "Manual Deploy"
# OR Render auto-deploys if autoDeploy is enabled
```

---

## 💰 Important Notes

### Render Free Tier Limitations

- ✅ Free to deploy
- ⚠️ Spins down after 15 minutes of inactivity
- ⚠️ Takes 3-5 seconds to wake up on first request
- ✅ No credit card required

### To Remove Sleep Behavior

Upgrade to **Paid Plan** (~$6/month):

- Render Dashboard → Service Settings → Plan
- Select "Standard" or higher
- Prevents automatic spin-down

---

## 📞 Need Help?

- [Render Docs](https://render.com/docs)
- [Node.js on Render](https://render.com/docs/deploy-node-express-app)
- [Socket.IO Deployment](https://socket.io/docs/v4/socket-io-can-be-used-with-various-nodejs-frameworks/)

---

## ✨ You're Done!

Share your deployed URL with friends and start playing!

Example URL: `https://56-card-game.onrender.com`

Enjoy your card game! 🎴
