import {
  MESSAGES,
  Request,
  SignInRequest,
  DropCardRequestPayload,
  IncrementBetByPlayerRequestPayload,
  UpdateGameScoreRequestPayload,
  DeckWonByTeamARequestPayload,
  DeckWonByTeamBRequestPayload,
  SelectPlayerRequestPayload,
  SelectTrumpSuitRequestPayload,
  RestartGameRequestPayload,
  // TableCardsRequestPayload
} from "@rcg/common";
import { GameCore } from "../core/GameCore";
import { LoggerService } from "../services/LoggerService";
import { Server as IOServer, Socket as IOSocket } from "socket.io";

/**
 * Socket server class.
 */
export class SocketServer {
  /**
   * The instance of the GameCore class.
   */
  private gameCore: GameCore;

  /**
   * The socket server.
   */
  public ioServer: IOServer;

  /**
   * Initializes a new instance of the class SocketServer.
   * @param ioServer The socket server instance.
   */
  constructor(ioServer: any) {
    this.ioServer = ioServer;
    this.gameCore = new GameCore(this.ioServer);
  }

  /**
   * Listen socket
   */
  public watchConnection() {
    this.ioServer.on("connection", (socket: IOSocket) => {
      LoggerService.log("Connected", `"Socket connected - ${socket.id}"`);
      this.subscribe(socket);
    });
  }

  /**
   * Subscribes to the socket events.
   * @param socket The socket instance
   */
  private subscribe(socket: IOSocket) {
    socket.on("data", (data, cb) => this.onDataHandler(socket, data, cb));

    socket.on("error", (error) => this.onErrorHandler(socket, error));

    socket.on("disconnect", () => this.onDisconnectHandler(socket));
  }

  /**
   * The handler listens to the events emitted by the clients.
   * @param socket The socket instance
   * @param request The data recieved from the client
   * @param cb The callback method.
   */
  private async onDataHandler(
    socket: IOSocket,
    request: Request,
    cb: Function
  ) {
    const { payload = {} } = request;
    switch (request.operation) {
      case MESSAGES.ping:
        cb(null, MESSAGES.pong);
        break;

      case MESSAGES.login:
        const userId = (payload as SignInRequest).userId;
        await this.gameCore.addPlayerToGamePool(socket, userId, cb);
        break;

      case MESSAGES.selectPlayer:
        const selectPlayerRequest = payload as SelectPlayerRequestPayload;
        this.gameCore.onSelectPlayer(selectPlayerRequest, cb);
        break;

      case MESSAGES.dropCard:
        const dropCardRequest = payload as DropCardRequestPayload;
        this.gameCore.onDropCard(dropCardRequest, cb);
        break;

      case MESSAGES.incrementBetByPlayer:
        const incrementBetByPlayerRequest = payload as IncrementBetByPlayerRequestPayload;
        this.gameCore.onIncrementBetByPlayer(incrementBetByPlayerRequest, cb);
        break;

      case MESSAGES.updateGameScore:
        const updateGameScoreRequest = payload as UpdateGameScoreRequestPayload;
        this.gameCore.onUpdateGameScore(updateGameScoreRequest, cb);
        break;

      case MESSAGES.deckWonByTeamA:
        const deckWonByTeamARequest = payload as DeckWonByTeamARequestPayload;
        this.gameCore.onDeckWonByTeamA(deckWonByTeamARequest, cb);
        break;

      case MESSAGES.deckWonByTeamB:
        const deckWonByTeamBRequest = payload as DeckWonByTeamBRequestPayload;
        this.gameCore.onDeckWonByTeamB(deckWonByTeamBRequest, cb);
        break;

      case MESSAGES.restartGame:
        const restartGameRequest = payload as RestartGameRequestPayload;
        this.gameCore.onRestartGame(restartGameRequest, cb);
        break;

      case MESSAGES.selectTrumpSuit:
        const selectTrumpSuitRequest = payload as SelectTrumpSuitRequestPayload;
        this.gameCore.onSelectTrumpSuit(selectTrumpSuitRequest, cb);
        break;

      default:
        break;
    }
  }

  /**
   * Error handler
   * @param socket The socket instance
   * @param error The error message
   */
  private onErrorHandler(socket: IOSocket, error: any) {
    LoggerService.logError("Error in socket", error);
  }

  /**
   * The handler gets called on socket disconnect.
   * Can be used to close or clean gracefully when required.
   * @param socket The socket instance.
   */
  private onDisconnectHandler(socket: IOSocket) {
    LoggerService.log("Disconnected", `Socket disconnected - ${socket.id}`);

    const { gameInfo } = socket as any;

    if (gameInfo) {
      LoggerService.log("Disconnected", `Player ID - ${gameInfo.playerId}`);
      this.gameCore.abortGame((socket as any).gameInfo.gameId);
    }
  }
}
