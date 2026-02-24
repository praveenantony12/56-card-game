# Debugging: Socket Connection to Port 3000

## Problem

The app appears to be trying to connect to port 4500 instead of port 3000 after deployment.

## Root Cause

The pre-built client files in `packages/game-server/client/` were built before the port was changed to 3000. Depending on when they were built, they may contain:

1. Hardcoded localhost:4500 for development
2. Logic to use `document.location.host` in production (which should work correctly)

## How to Debug

### Step 1: Check Browser Console

1. Open your deployed app: `https://your-app.onrender.com`
2. Open Developer Tools: **F12** or **Right-click → Inspect**
3. Go to **Console** tab
4. Look for messages that say:
   - ✅ **Good**: `🔌 Connecting to server at : https://your-app.onrender.com`
   - ❌ **Bad**: `🔌 Connecting to server at : http://localhost:4500`

### Step 2: Check Network Tab

1. Still in Developer Tools, go to **Network** tab
2. Look for WebSocket connections
3. Under **Type** column, look for `websocket`
4. Click on it and check **Request URL**:
   - ✅ **Good**: `wss://your-app.onrender.com/socket.io/...`
   - ❌ **Bad**: `ws://localhost:4500/socket.io/...`

### Step 3: Check Server Logs in Render

1. Go to **Render Dashboard** → Your Service
2. Click **Logs** tab
3. Look for Socket.IO connection messages:
   - ✅ **Good**: `A new player connected` (appears when client connects)
   - ❌ **Bad**: No connection messages (client can't reach server)

---

## Solutions

### Solution 1: Rebuild Client Files (Recommended)

The clean solution is to rebuild the web client with the correct configuration:

```bash
# First, try to fix TypeScript issues in web build
cd packages/web

# Clear any cached builds
rm -rf build/

# Try building with this environment
NODE_ENV=production npm run build

# If it fails with TypeScript errors:
# - Update @types/express dependencies
# - Or upgrade TypeScript version further
```

If successful, copy built files to server:

```bash
cp -r build/* ../game-server/client/
```

Then commit and redeploy to Render.

### Solution 2: Manual Fix (Temporary Workaround)

If web client can't be rebuilt, you can manually patch the connection:

1. **Open**: `packages/game-server/client/index.html`
2. **Add this script before `</head>`**:

   ```html
   <script>
     // Override Socket.IO connection to use current host
     window.SOCKET_HOST =
       window.location.protocol + "//" + window.location.host;
     console.log("🔌 Socket will connect to:", window.SOCKET_HOST);
   </script>
   ```

3. Edit the main JavaScript file `packages/game-server/client/static/js/main.*.js`
4. Find any hardcoded `localhost:4500` or `http://localhost:` references
5. Replace with: `window.location.protocol + '//' + window.location.host`

6. Commit and redeploy

### Solution 3: Check Environment Variables

Ensure Render has the correct environment variables:

1. **Render Dashboard** → Your Service → **Settings**
2. **Environment** section, verify:
   - `NODE_ENV` = `production`
   - `PORT` = `3000`
3. If changed, click **Save** and **Manual Deploy**

---

## What Fixed in Latest Update

✅ Fixed `.env.example` with correct variable names (`REACT_APP_SERVER_URL` instead of `REACT APP_SERVER_URL`)  
✅ Updated port references from 4500 to 3000 in all configs  
✅ Fixed `server.ts` path issue for `index.html`  
✅ Created `.env.production` for React app

---

## Next Steps

1. **Trigger a manual rebuild on Render**:
   - Render Dashboard → Your Service → **Manual Deploy**

2. **Test the connection**:
   - Open the app
   - Check browser console for the connection URL
   - Verify it says `https://your-app.onrender.com` (not `localhost:4500`)

3. **If still not working**:
   - Share the console message you see
   - And the WebSocket URL from Network tab
   - This will help identify the exact issue

---

## Technical Details

### How Socket Connection Works

**Development** (`NODE_ENV=development`):

- Falls back to `http://localhost:4500`
- This is intentional for local development

**Production** (`NODE_ENV=production`):

- Uses `document.location.protocol + '//' + document.location.host`
- Means: `https://your-app.onrender.com` (same domain, port 3000)
- No hardcoding needed - connects to wherever the page was served from

### Why This Matters

When you deploy to Render:

- ✅ Your server runs on `https://your-app.onrender.com:3000`
- ✅ Client HTML/JS served from same server
- ✅ Client should connect to same host automatically
- ❌ If client has hardcoded `localhost:4500`, connection fails

---

## Common Error Messages & Fixes

### "WebSocket is closed before the connection is established"

**Cause**: Client can't establish connection to server
**Fix**: Verify server is running, check firewall/CORS

### "Cross-Origin Request Blocked"

**Cause**: Client trying to connect to different domain
**Fix**: Ensure Socket connection uses same hostname as page

### "ERR_CONNECTION_REFUSED"

**Cause**: Server not listening on the port client is trying
**Fix**: Verify `PORT` environment variable, check Render logs

### "Failed to get answer from the server"

**Cause**: Socket connection timeout
**Fix**: Check server performance, increase `pingTimeout`, reduce `pingInterval`

---

## Prevention for Future Deploys

1. **Always set NODE_ENV=production** in production deployments
2. **Rebuild client** with production environment variables
3. **Test Socket connection** before deploying to production
4. **Monitor Render logs** after each deployment
5. **Use environment-specific URLs**, not hardcoded

---

Questions? Check:

- [Socket.IO Documentation](https://socket.io/docs/)
- [Render Deployment Guide](https://render.com/docs)
- Browser Developer Tools (Console + Network tabs)
