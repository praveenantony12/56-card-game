# 56-card-game

A multiplayer card game built with Socket.IO + React + Node.js + TypeScript.

## 🚀 Deployment

### Quick Deploy

1. **Build and test locally:** `./deploy.sh`
2. **Push to GitHub:** `git push origin main`
3. **Choose a platform:**
   - **Render.com** (FREE, sleeps after 15 min): https://render.com ➡ New Web Service ➡ Select repo
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

### Bot training mode (local only)

Training mode silently compares the moves human players make with what the
current bot would have played in the same situation. It is for local
development: players see no hints, nothing about the game changes, and the
bot's strategy is never modified.

```bash
npm run start:training # Same as npm start, with training enabled on the server
```

It is enabled only by this server start-up command (`BOT_TRAINING_MODE=true` in
`packages/game-server/nodemon.training.json`). Clients cannot turn it on, and
it is forced off when `NODE_ENV=production`. `npm start` is unchanged.

Card plays by humans are written to `training-data/<game-id>--<hand-id>.jsonl`
(relative to `packages/game-server`; git-ignored), one line per decision. Each
record holds the player-visible state, the legal cards, the human's card, the
bot's card and rationale, and whether the two cards were identical
(`exactActionAgreement`). Players are pseudonymized as `seat_0`..`seat_5`; real
names and tokens are never written.

When a game finishes, the server console prints a summary: decisions captured,
evaluations completed and failed, exact-action matches and mismatches (overall
and by phase), any evaluations still pending, and the file location. The
summary never delays the game. A match only means both chose the same card; it
does not say who was right.

Bot-training scope today: human card plays only (not bidding or doubling).

### Tests

```bash
cd packages/game-server && npm run test:ci
```

If you change how `TeamBotAgent` plays, bump `BOT_POLICY_VERSION`
(`packages/game-server/src/agents/botPolicyVersion.ts`) and update the golden
decisions in `src/__tests__/bot-golden.spec.ts`; the test fails until you do.

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
