import * as express from "express";
import * as io from "socket.io";
import * as http from "http";

import { SocketServer } from "../core/SocketServer";
import { LoggerService } from "../services/LoggerService";

const path = require("path");
// Use port 4500 for development, 3000 for production (Render)
const isDevelopment = process.env.NODE_ENV !== "production";
const DEFAULT_PORT = isDevelopment ? 4500 : 3000;
const PORT = process.env.PORT || DEFAULT_PORT;
const app = express();

app.use(express.static(path.join(__dirname, "../../client")));

app.get("/", (req, res, next) => res.sendFile(path.join(__dirname, "../../client/index.html")));

const httpServer = http.createServer(app);
const ioServer = io(httpServer, { 
  pingTimeout: 200000, 
  pingInterval: 300000 
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
      `Server started and listening at port ${PORT}`
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
