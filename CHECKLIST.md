# Pre-Deployment Checklist

Before deploying your card game, verify the following:

## ✅ Code Readiness

- [ ] All dependencies are listed in package.json files
- [ ] TypeScript compiles without errors (`npm run build:common && npm run build:serv
- [ ] Tests pass (if any)`cd packages/game-server && npm test
- [ ] No hardcoded localhost URLs in client code (checked ✔️)
- [ ] Socket.I0 connection uses environment-aware URL (fixed ✔️)

## ✅ Build Configuration

- [ ] Dockerfile is present and valid (✔️)
- [ ] render.yaml is configured (✔️)
- [ ] fly.toml is configured (✔️)
- [ ] deploy.sh script is executable (✔️)

## ✅ Git Repository

- [ ] Code is pushed to GitHub/GitLab
  ```bash
  git add .
  git commit -m "Ready for deployment"
  git push origin main
  ```
- [ ] Repository is public (or hosting platform has access)
- [ ].gitignore excludes node_modules, dist, build, env files (✔️)

## ✅ Environment Variables

- [ ] Review.env.example for required variables
- [ ] For production, no additional env vars needed (server and client on same domain)
- [ ] If hosting client separately, set REACT_APP_SERVER_URL

## ✅ Security Considerations

- [ ] No sensitive data in code (API keys, passwords, etc.)
- [ ] CORS is configured if hosting client/server separately
- [ ] WebSocket connections use secure protocol (wss://) in production

## ✅ Testing Plan

Once deployed, test:

- [ ] Single player can connect
- [ ] Multiple players can join a game
- [ ] Game logic works correctly
- [ ] Create multiple games in parallel
- [ ] Test timer behavior across games
- [ ] Check for memory leaks or performance issues
- [ ] Test reconnection after network interruption

## ✅ Monitoring Setup

- [ ] Know how to access server logs on your hosting platform
- [ ] Set up error alerts (optional, but recommended for production)
- [ ] Monitor memory/CPU usage

## 🚀 Ready to Deploy!

Choose your platform and follow the guide:

- [Quick Deploy Guide](QUICKSTART-DEPLOY.md) - Fast setup
- [Full Deployment Guide](DEPLOYMENT.md) Detailed instructions

### Test Local Build First:

```bash
./deploy.sh
cd packages/game-server && node dist/index.js
```

Then open http://localhost:4500 to verify everything works.

### Deploy Commands:

**Render.com:**

```bash
git push origin main
# Then connect repo in Render dashboard
```

**Railway.app:**

```bash
git push origin main
#Then connect repo in Railway dashboard
```

**Fly.io:**

```bash
/deploy,sh
flyctl launch
flyctl open
```

---

## 🎯 Post-Deployment

After deploying:

1. ✅ Test the live URL
2. ✅ Create a few test games
3. ✅ Monitor logs for errors
4. ✅ Test multi-game scenarios
5. ✅ Share the URL and get feedback!

## ⚠️ Troubleshooting

### Build fails?

- Check Node.js version (18+ recommended)
- Verify all packages build locally
- Check hosting platform logs

### WebSocket connection issues?

- Verify server logs show connections
- Check browser console for errors
- Ensure WebSocket support is enabled on host

### Timer issues in multi-game?

- This is a known issue being investigated
- Check game isolation in server code
- Look for global timers or shared state

---
