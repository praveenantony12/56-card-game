import * as express from "express";
import * as io from "socket.io";
import * as http from "http";

import { SocketServer } from "../core/SocketServer";
import { LoggerService } from "../services/LoggerService";
import { MetricsService } from "../services/MetricsService";
import { InMemoryStore } from "../persistence/InMemoryStore";

// Initialise Sentry only in production (when SENTRY_DSN is set).
// Not loaded locally to avoid unnecessary overhead and to prevent sending test data to Sentry.
if (process.env.NODE_ENV === "production" && process.env.SENTRY_DSN) {
  // Dynamic require to ts-node never tries to resolve the module locally
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const Sentry = require("@sentry/node");
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 1.0,
  });
}

const path = require("path");
// Port configuration - prioritize NODE_ENV:
// - Production (Render): Always use port 3000
// - Development (local): Use 4500 (or override with PORT env var)
const PORT =
  process.env.NODE_ENV === "production"
    ? 3000
    : process.env.PORT
      ? parseInt(process.env.PORT, 10)
      : 4500;
const app = express();

app.use(express.static(path.join(__dirname, "../../client")));

app.get("/", (req, res, next) =>
  res.sendFile(path.join(__dirname, "../../client/index.html")),
);

/** Live stats endpoint — open in browser or use for uptime monitoring */
app.get("/api/stats", (_req, res) => {
  const snapshot = MetricsService.getSnapshot(InMemoryStore.instance.count);
  res.json(snapshot);
});

const httpServer = http.createServer(app);
const ioServer = io(httpServer, {
  pingTimeout: 600000, // 10 minutes - increased from 200s to handle slow connections and prevent premature disconnections
  pingInterval: 500000, // 8.3 minutes - increased from 300s to reduce frequency of pings while still keeping connection alive
});

let ioHandlers: SocketServer;

/**
 * Starts the server.
 * @param done The callback executes after the server is started.
 */
export function startServer(done: Function) {
  httpServer.listen(PORT, () => {
    LoggerService.log(
      "Server Started:",
      `Server started and listening at port ${PORT}`,
    );
  });

  ioHandlers = new SocketServer(ioServer);
  ioHandlers.watchConnection();

  done();
}

/**
 * Stops the server.
 * @param done The callback executes after the server is stopped.
 */
export function stopServer(done: Function) {
  ioServer.close(() => {
    httpServer.close(() => {
      done();
    });
  });
}
