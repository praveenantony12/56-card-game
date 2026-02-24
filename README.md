# 56-card-game

A multiplayer card game built with Socket.IO + React + Node.js + TypeScript.

## 🚀 Deployment

### Quick Deploy

1. **Build and test locally:** `./deploy.sh`
2. **Push to GitHub:** `git push origin main`
3. **Choose a platform:**
   - **Render.com** (FREE, Bleeps after 15 min): https://render.com ➡ New Web Service ➡ Select repo
   - **Fly.io** (FREE, no sleep): `brew install flyctl && flyct launch`
   - **Railway.app** ($5/mo, no sleep): https://railway.app ➡ New Project ➡ Deploy from GitHub

Config files (`render.yaml`, `fly.toml`) are already set up.

## 🎮 Local Development

### Installation

```bash
npm install
```

### Run

```bash
npm start # Runs server (port 4500) and client (port 3000)
```

### Build

```bash
./deploy.sh # Builds all packages
```

## 🏗️ Project Structure

```
56-card-game/
|-packages/
| |-common/          # Shared types and models
| |-game-server/     # Node.js + Socket.IO server
| |-web/             # React client
|-deploy.sh          # Build script
```

---

## 📝 License

MIT

---

## 🔶 Contributing

Issues and pull requests are welcome.
