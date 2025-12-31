import {
  deckWonByTeamAPayload,
  deckWonByTeamBPayload,
  dropCardByPlayerPayload,
  dropCardPayload,
  incrementBetByPlayerPayload,
  loginPayload,
  reconnectPayload,
  pingPayload,
  reconnectApprovePayload,
  reconnectDenyPayload,
  ResponseType,
  restartGamePayload,
  selectPlayerPayload,
  selectTrumpSuitPayload,
  SuccessResponse,
  updateGameScorePayload,
} from "@rcg/common";

import * as io from "socket.io-client";

const ifDevelopment = process.env.NODE_ENV === "development";
const connection = ifDevelopment
  // ? "http://24.211.235.185:90" 
  ? "http://localhost:4500/"
  : // "http://192.168.1.220:4500/"
  // "http://localhost:4500/"
  document.location.protocol + "//" + document.location.host;

const ioClient: SocketIOClient.Socket = io(connection, {
  timeout: 200000,
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
   * Sign in to the game.
   * @param userId The user id.
   */
  public signIn(userId: string): Promise<any> {
    return this.sendRequest(loginPayload(userId));
  }

  /**
   * Reconnect to an existing game.
   * @param playerId The player id.
   * @param token The token.
   * @param gameId The game id.
   */
  public reconnect(playerId: string, token?: string, gameId?: string): Promise<any> {
    return this.sendRequest(reconnectPayload(playerId, token, gameId));
  }

  /**
   * Approve for a reconnection request.
   * @param gameId The game id.
   * @param playerId The playerId id requesting connection.
   * @param approvingPlayerId The Id of player giving approval.
   */
  public approveReconnection(gameId: string, playerId: string, approvingPlayerId: string): Promise<any> {
    return this.sendRequest(reconnectApprovePayload(gameId, playerId, approvingPlayerId));
  }

  /**
   * Deny a reconnection request.
   * @param gameId The game id.
   * @param playerId The playerId id requesting connection.
   * @param denyingPlayerId The Id of player denying approval.
   */
  public denyReconnection(gameId: string, playerId: string, denyingPlayerId: string): Promise<any> {
    return this.sendRequest(reconnectDenyPayload(gameId, playerId, denyingPlayerId));
  }

  /**
   * Sends the dropped card to the game server.
   * @param card The card need to drop
   * @param gameId The gameId
   * @param token The user token
   */
  public dropCard(
    card: string,
    gameId: string,
    token: string,
    playerId: string
  ): Promise<any> {
    return this.sendRequest(dropCardPayload(card, gameId, token, playerId));
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
   * Sends the increased bet to the game server.
   * @param playerId The player Id selected
   * @param gameId The gameId
   * @param token The user token
   */
  public incrementBetByPlayer(
    playerBet: string,
    gameId: string,
    token: string
  ): Promise<any> {
    return this.sendRequest(
      incrementBetByPlayerPayload(playerBet, gameId, token)
    );
  }

  /**
   * Sends the update game score to the game server.
   * @param gameScore The updated score for all games combined
   * @param gameId The gameId
   * @param token The user token
   */
  public updateGameScore(
    gameScore: string,
    gameId: string,
    token: string
  ): Promise<any> {
    return this.sendRequest(updateGameScorePayload(gameScore, gameId, token));
  }

  /**
   * Sends the dropped cards by player to the game server.
   * @param dropCardPlayer Player-Card array
   */
  public dropCardPlayer(dropCardPlayer: string[]): Promise<any> {
    return this.sendRequest(dropCardByPlayerPayload(dropCardPlayer));
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
   * Sends the selected trump suit to the game server.
   * @param trumpSuit The trump suit selected
   * @param gameId The gameId
   * @param token The user token
   * @param playerId The player id
   */
  public selectTrumpSuit(
    trumpSuit: string,
    gameId: string,
    token: string,
    playerId: string
  ): Promise<any> {
    return this.sendRequest(
      selectTrumpSuitPayload(trumpSuit, gameId, token, playerId)
    );
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

        // Handle specific success responses that should not be treated as errors
        if (result.code === "RECONNECT_PENDING_APPROVAL" ||
          result.code === "RECONNECT_APPROVED" ||
          result.code === "RECONNECT_DENIED") {
          resolve(result);
          return;
        }

        if (result.type === ResponseType.error) {
          reject(result.message);
          return;
        }

        resolve(result.payload || result || true);
      });
    });
  }
}

export default GameService;
