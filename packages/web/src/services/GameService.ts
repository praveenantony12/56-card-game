import {
  deckWonByTeamAPayload,
  deckWonByTeamBPayload,
  dropCardPayload,
  loginPayload,
  pingPayload,
  ResponseType,
  restartGamePayload,
  selectPlayerPayload,
  SuccessResponse
} from "@rcg/common";
import * as io from "socket.io-client";

const ifDevelopment = process.env.NODE_ENV === "development";
const connection = ifDevelopment
  ? "http://75.177.132.239:90"
  : // "http://192.168.1.220:4500/"
    document.location.protocol + "//" + document.location.host;

const ioClient: SocketIOClient.Socket = io(connection, {
  timeout: 200000
});

class GameService {
  /**
   * Initializes a new instance of the GameService.
   * @param subscribeToNotifications The callback to subscribe notifications
   */
  constructor(
    private subscribeToNotifications: (data: SuccessResponse, cb: any) => void
  ) {
    ioClient.on("data", this.subscribeToNotifications);

    setInterval(() => {
      this.ping().then(() => "");
    }, 10000);
  }

  /**
   * Sigin to the game.
   * @param userId The user id.
   */
  public signIn(userId: string): Promise<any> {
    return this.sendRequest(loginPayload(userId));
  }

  /**
   * Sends the dropped card to the game server.
   * @param card The card need to drop
   * @param gameId The gameId
   * @param token The user token
   */
  public dropCard(card: string, gameId: string, token: string): Promise<any> {
    return this.sendRequest(dropCardPayload(card, gameId, token));
  }

  /**
   * Sends the team A card to the game server.
   * @param cards The cards won by team A
   * @param gameId The gameId
   */
  public deckWonByTeamA(gameId: string): Promise<any> {
    return this.sendRequest(deckWonByTeamAPayload(gameId));
  }

  /**
   * Sends the team B card to the game server.
   * @param cards The cards won by team B
   * @param gameId The gameId
   */
  public deckWonByTeamB(gameId: string): Promise<any> {
    return this.sendRequest(deckWonByTeamBPayload(gameId));
  }

  /**
   * Sends the selected player to the game server.
   * @param playerId The player Id selected
   * @param gameId The gameId
   * @param token The user token
   */
  public selectPlayer(
    playerId: string,
    gameId: string,
    token: string
  ): Promise<any> {
    return this.sendRequest(selectPlayerPayload(playerId, gameId, token));
  }

  /**
   * Restarts Game.
   * @param playerId The player Id selected
   * @param gameId The gameId
   */
  public restartGame(gameId: string): Promise<any> {
    return this.sendRequest(restartGamePayload(gameId));
  }

  /**
   * Leave game. It will disconnect the socket from server.
   */
  public leaveGame() {
    ioClient.disconnect();
  }

  /**
   * Checks the connection is alive or not.
   */
  public ping(): Promise<boolean> {
    return this.sendRequest(pingPayload());
  }

  /**
   * Opens the socket connection.
   */
  private openConnection() {
    if (!ioClient.connected) {
      ioClient.connect();
    }
  }

  /**
   * Helper to communicate with the socket server.
   * @param payload The payload needs to send
   */
  private sendRequest(payload: any): Promise<any> {
    this.openConnection();

    return new Promise((resolve, reject) => {
      ioClient.emit("data", payload, (error: any, result: any) => {
        if (error) {
          reject(error);
          return;
        }

        if (result.type === ResponseType.error) {
          reject(result.message);
        }

        resolve(result.payload || true);
      });
    });
  }
}

export default GameService;
