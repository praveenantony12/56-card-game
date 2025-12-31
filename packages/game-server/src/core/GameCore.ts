import {
  DeckWonByTeamARequestPayload,
  DeckWonByTeamBRequestPayload,
  DropCardRequestPayload,
  IncrementBetByPlayerRequestPayload,
  UpdateGameScoreRequestPayload,
  GameActionResponse,
  RESPONSE_CODES,
  RestartGameRequestPayload,
  SelectPlayerRequestPayload,
  incrementBetByPlayerPayload,
  // TableCardsRequestPayload
} from "@rcg/common";

import { IPlayer } from "../core/models/IPlayer";
import { IDropCardPlayer } from "../core/models/IDropCardPlayer";
import { successResponse, errorResponse } from "../utils/responses";
import { Payloads } from "../core/payloads";
import { Deck } from "../utils/deck";
import { MAX_PLAYERS } from "../constants/misc";
import { ICardGame as GameModel } from "../core/models/ICardGame";
import { getUniqueId, delayed, sleep } from "../utils/misc";
import { Game } from "../core/Game";
import { cardToWeightagePoints, cardToWeightageDict } from "../constants/deck";
import { InMemoryStore } from "../persistence/InMemoryStore";
import { Server as IOServer, Socket as IOSocket } from "socket.io";

/**
 * Game :- A main class that manages all the game actions/logics.
 */
export class GameCore {
  playersPool: IPlayer[] = [];
  dropCardPlayer: string[] = [];
  playersPoolForReGame: IPlayer[] = [];
  currentGameId = getUniqueId();
  deck: Deck;
  inMemoryStore: InMemoryStore = InMemoryStore.instance;
  reachedMaxLoad = false;
  roundTimers: { [gameId: string]: NodeJS.Timeout } = {};
  gameStartIndex: number = 0; // Track which player starts the game

  // Reconnection system
  private disconnectTimeouts: {
    [gameId: string]: {
      [playerId: string]: NodeJS.Timeout
    };
  } = {};
  private readonly DISCONNECT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
  private readonly GAME_ABANDON_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

  /**
   * Initializes a new instance of the class Game.
   * @param ioServer The ioServer instance.
   * @param socket The socket instance.
   * @param gameId The game id.
   */
  constructor(private ioServer: IOServer) {
    this.deck = new Deck();
  }

  /**
   * Adds the player to the game pool.
   * @param socket The socket instance
   * @param playerId The player id
   * @param cb The callback after the action is done.
   *
   * Note: Here we need to get the socket instance everytime and can't be stored as intance
   * variable because we are adding the socket to room (game id).
   */
  public addPlayerToGamePool(
    socket: IOSocket,
    playerId: string,
    cb: Function
  ) {
    try {
      // Validate inputs
      if (!socket || !socket.id) {
        throw new Error("Invalid socket");
      }
      if (!playerId || typeof playerId !== "string") {
        throw new Error("Invalid player ID");
      }

      // Check if this player is reconnecting to an existing game
      const allGameIds = this.inMemoryStore.getAllGameIds();
      for (const gameId of allGameIds) {
        const game = this.inMemoryStore.fetchGame(gameId);
        if (game && game.disconnectedPlayers && game.disconnectedPlayers[playerId]) {
          // Player is reconnecting - use reconnection flow instead
          const disconnectedPlayer = game.disconnectedPlayers[playerId];
          return this.reconnectPlayerToGame(
            socket,
            playerId,
            cb,
            disconnectedPlayer.token,
            gameId
          );
        }
      }

      this.checkValidityAndThrowIfInValid(playerId, socket.id);

      const player: IPlayer = {
        socketId: socket.id,
        playerId,
        token: getUniqueId(),
        gameId: this.currentGameId,
      };

      this.playersPool.push(player);

      socket.join(this.currentGameId);

      (socket as any).gameInfo = player;

      cb(null, successResponse(RESPONSE_CODES.loginSuccess, player));

      if (this.playersPool.length === MAX_PLAYERS) {
        const starvingPlayers = this.playersPool.splice(0, MAX_PLAYERS);
        const starvingGamePoolId = this.currentGameId;
        this.playersPoolForReGame = [...starvingPlayers];
        this.playersPool = [];
        this.currentGameId = getUniqueId();

        // Reset starter index for the first game
        this.gameStartIndex = 0;

        this.startGame(starvingGamePoolId, [...starvingPlayers]);
      }
    } catch (error) {
      cb(null, errorResponse(RESPONSE_CODES.loginFailed, error && error.message ? error.message : "Unknown error"));
    }
  }

  /** 
   * Handles player reconnection to an existing game.
   * @param socket The socket instance
   * @param playerId The player id
   * @param token Optional previous session token
   * @param gameId Optional game id to reconnect to
   * @param cb The callback after the action is done.
   */
  public async reconnectPlayerToGame(
    socket: IOSocket,
    playerId: string,
    cb: Function,
    token?: string,
    gameId?: string
  ) {
    try {
      // Validate inputs
      if (!socket || !socket.id) {
        throw new Error("Invalid socket");
      }
      if (!playerId || typeof playerId != "string") {
        throw new Error("Invalid player ID");
      }
      let reconnectedGame: GameModel | null = null;
      let playerToReconnect: IPlayer | null = null;

      // Try to find the game and player to reconnect
      if (gameId) {
        const game = this.inMemoryStore.fetchGame(gameId);
        if (game && game.disconnectedPlayers && game.disconnectedPlayers[playerId]) {
          playerToReconnect = game.disconnectedPlayers[playerId];
          reconnectedGame = game;
        }
      }

      // If not found by gameld, search through all games
      if (!playerToReconnect) {
        // Note: This is a simplified search. In production, you'd want a more efficient way
        // to index games by player for faster lookup
        console.log("Searching for disconnected player $(playerId) across all games");
      }

      if (!playerToReconnect || !reconnectedGame || !gameId) {
        throw new Error("No disconnected player found to reconnect");
      }

      // Check if there are other active players who need to approve the reconnection
      const activePlayers = reconnectedGame.players.filter(
        (p: IPlayer) => !p.isDisconnected && p.playerId != playerId
      );

      if (activePlayers.length > 0) {
        // Store the pending reconnection request 
        if (!reconnectedGame.pendingReconnections) {
          reconnectedGame.pendingReconnections = {};
        }

        reconnectedGame.pendingReconnections[playerId] = {
          playerToReconnect,
          requestingSocket: socket,
          requestTime: new Date(),
          approvals: [],
          requiredApprovals: activePlayers.length
        };

        //Notify other players about the reconnection request
        const reconnectionRequest = {
          playerId: playerId,
          playerName: playerToReconnect.playerId, // Using playerId as display name
          gameId: gameId
        };

        activePlayers.forEach((player: IPlayer) => {
          this.ioServer?.to(player.socketId).emit("data", {
            success: true,
            code: RESPONSE_CODES.gameNotification,
            payload: {
              action: "reconnection_request",
              data: reconnectionRequest
            }
          });
        });

        // Send pending approval response to reconnecting player 
        cb(null, successResponse(RESPONSE_CODES.reconnectPendingApproval, {
          message: "Reconnection request sent to other players for approval",
          gameld: gameId
        }));
        return;
      }

      // No other players, allow immediate reconnection

      // Update player with new socket

      playerToReconnect.socketId = socket.id;
      playerToReconnect.isDisconnected = false;
      playerToReconnect.lastActivity = new Date();
      delete playerToReconnect.disconnectedAt;

      // Update the players array
      const playerIndex = reconnectedGame.players.findIndex(
        (p: IPlayer) => p.playerId = playerId
      );

      if (playerIndex == -1) {
        (reconnectedGame.players as any)[playerIndex] = playerToReconnect;
      }

      // Remove from disconnected players
      delete reconnectedGame.disconnectedPlayers![playerId];

      // Clear disconnect timeout
      if (this.disconnectTimeouts[gameId] && this.disconnectTimeouts[gameId][playerId]) {
        clearTimeout(this.disconnectTimeouts[gameId][playerId]);
        delete this.disconnectTimeouts[gameId][playerId];
      }

      // Add socket to game room
      socket.join(gameId);
      (socket as any).gameinfo = playerToReconnect;

      // Save updated game
      this.inMemoryStore.saveGame(gameId, reconnectedGame);


      // Check if game was paused and can be resumed
      const connectedPlayersCount = reconnectedGame.players.filter(
        (p: IPlayer) => !p.isDisconnected
      ).length;

      if (reconnectedGame.gamePaused && connectedPlayersCount === MAX_PLAYERS) {
        reconnectedGame.gamePaused = false;
        delete reconnectedGame.pausedAt;
        this.inMemoryStore.saveGame(gameId, reconnectedGame);

        // Notify all players that game is resumed const resume 
        const resumePayload = Payloads.sendGameResumed(
          `${playerId} reconnected.Game resumed!`
        );
        const resumeResponse = successResponse(
          RESPONSE_CODES.gameNotification,
          resumePayload
        );
        this.ioServer.to(gameId).emit("data", resumeResponse);
      } else {
        // Notify other players about reconnection 
        const reconnectPayload = Payloads.sendPlayerReconnected(
          `${playerId} has reconnected to the game.`
        );
        const reconnectResponse = successResponse(
          RESPONSE_CODES.gameNotification,
          reconnectPayload
        );
        socket.to(gameId).emit("data", reconnectResponse);
      }

      // Send current game state to reconnected player
      const gameStatePayload = this.buildGameStateForPlayer(
        reconnectedGame,
        playerToReconnect
      );
      cb(null, successResponse(RESPONSE_CODES.loginSuccess, gameStatePayload));

      // Refresh game state for all players 
      this.refreshGameStateForAllPlayers(gameId);
    } catch (error) {
      console.error("Reconnection error:", error);
      cb(errorResponse(RESPONSE_CODES.error, (error as Error).message));
    }
  }


  /**
  * Approve a reconnection request
  * @param socket The socket of the approving player
  * @param gameld The game ID
  * @param playerId The ID of the player to reconnect
  * @param approvingPlayerId The ID of the player giving approval
  * @param cb The callback function
  */
  public async approveReconnection(
    socket: IOSocket,
    gameId: string,
    playerId: string,
    approvingPlayerId: string,
    cb: Function
  ) {
    try {

      const game = this.inMemoryStore.fetchGame(gameId);
      if (!game || !game.pendingReconnections || !game.pendingReconnections[playerId]) {
        throw new Error("No pending reconnection request found");

      }

      const pendingRequest = game.pendingReconnections[playerId];

      // Add approval
      if (!pendingRequest.approvals.includes(approvingPlayerId)) {
        pendingRequest.approvals.push(approvingPlayerId);
      }

      // Check if we have enough approvals
      if (pendingRequest.approvals.length >= pendingRequest.requiredApprovals) {
        // Complete the reconnection

        await this.completeReconnection(gameId, game, playerId, pendingRequest);

        cb(null, successResponse(RESPONSE_CODES.reconnectApproved, {
          message: "Player reconnection approved and completed"
        }));
      } else {

        cb(null, successResponse(RESPONSE_CODES.success, {
          message: `Approval recorded.$(pendingRequest.approvals.length) / ${pendingRequest.requiredApprovals} approvals recieved`
        }));
      }
    } catch (error) {
      cb(null, errorResponse(RESPONSE_CODES.error, (error as Error).message));
    }
  }

  /**
   * Deny a reconnection request
   * @param socket The socket of the denying player
   * @param gameld The game ID
   * @param playerId The ID of the player requesting reconnection
   * @param denyingPlayerId The ID of the player denying
   * @param co The callback function
   */
  public async denyReconnection(
    socket: IOSocket,
    gameId: string,
    playerId: string,
    denyingPlayerId: string,
    cb: Function
  ) {
    try {
      const game = this.inMemoryStore.fetchGame(gameId);
      if (!game || !game.pendingReconnections || !game.pendingReconnections[playerId]) {
        throw new Error("No pending reconnection request found");
      }

      const pendingRequest = game.pendingReconnections(playerId);

      // Notify the requesting player that reconnection was denied 
      pendingRequest.requestingSocket.emit("data", errorResponse(RESPONSE_CODES.reconnectDenied,
        `Reconnection denied by ${denyingPlayerId}`));

      // Clean up the pending request
      delete game.pendingReconnections[playerId];

      cb(null, successResponse(RESPONSE_CODES.success, {
        message: "Reconnection request denied"
      }));

    } catch (error) {
      cb(null, errorResponse(RESPONSE_CODES.error, (error as Error).message));
    }
  }

  /**
   * Complete a reconnection after approval
   * @param gameId The game ID
   * @param game The game instance
   * @param playerId The ID of the player requesting reconnection
   * @param pendingRequest The pending request data
   */
  private async completeReconnection(
    gameId: string,
    game: GameModel,
    playerId: string,
    pendingRequest: any
  ) {
    const { playerToReconnect, requestingSocket } = pendingRequest;

    //Update player with new socket
    playerToReconnect.socketId = requestingSocket.id;
    playerToReconnect.isDisconnected = false;
    playerToReconnect.lastActivity = new Date();
    delete playerToReconnect.disconnectedAt;

    // Update the players array
    const playerIndex = game.players.findIndex(
      (p: IPlayer) => p.playerId === playerId
    );

    if (playerIndex !== -1) {
      (game.players as any)[playerIndex] = playerToReconnect;
    }

    // Remove from disconnected players 
    delete game.disconnectedPlayers![playerId];

    // Clear disconnect timeout
    if (this.disconnectTimeouts[gameId] && this.disconnectTimeouts[gameId][playerId]) {
      clearTimeout(this.disconnectTimeouts[gameId][playerId]);
      delete this.disconnectTimeouts[gameId][playerId];
    }

    // Clean up pending request
    delete game.pendingReconnections[playerId];

    // Save updated game state
    this.inMemoryStore.saveGame(gameId, game);

    // Join the reconnecting player to the game room (use consistent room format) 
    requestingSocket.join(gameId);
    (requestingSocket as any).gameInfo = playerToReconnect;

    // Build and send the current game state to the reconnected player 
    const gameState = this.buildGameStateForPlayer(game, playerToReconnect);

    requestingSocket.emit("data", successResponse(RESPONSE_CODES.reconnectSuccess, gameState))

    // Notify all other players that the player has reconnected 
    this.ioServer?.to(gameId).emit("data",
      successResponse(RESPONSE_CODES.gameNotification, {
        action: "player_reconnected",
        data: {
          playerId: playerId,
          playerName: playerToReconnect.playerId // Using playerId as display name
        }
      })
    );
  }


  /**
   * Starts the game.
   * @param gameId The game id.
   */
  public startGame(gameId: string, players: IPlayer[]) {
    const gameObject = this.createGameObject(players, this.gameStartIndex);
    this.inMemoryStore.saveGame(gameId, gameObject);

    gameObject.players.forEach((player) => {
      this.sendCards(player.socketId, gameObject[player.token]);
    });

    this.sendPlayersInfo(
      gameId,
      players.map((x) => x.playerId)
    );

    const gameObj = this.inMemoryStore.fetchGame(gameId);
    gameObj.dropCardPlayer = [];
    this.inMemoryStore.saveGame(gameId, gameObj);

    this.notifyTurn(gameId);
  }

  /**
   * Starts the game.
   * @param gameId The game id.
   */
  public onRestartGame(req: RestartGameRequestPayload, cb: Function) {
    const { gameId } = req;

    // Move to next player clowkwise for the new game
    if (this.playersPoolForReGame && this.playersPoolForReGame.length > 0) {
      this.gameStartIndex = (this.gameStartIndex + 1) % this.playersPoolForReGame.length;
    }

    // Preserve team score before restarting
    const currentGameObj = this.inMemoryStore.fetchGame(req.gameId);
    const preserveTeamAScore = currentGameObj?.teamAScore || 10;
    const preserveTeamBScore = currentGameObj?.teamBScore || 10;

    this.startGame(req.gameId, this.playersPoolForReGame);

    //Restore the preserved team scores after game creation
    const gameObj = this.inMemoryStore.fetchGame(req.gameId);
    gameObj.teamAScore = preserveTeamAScore;
    gameObj.teamBScore = preserveTeamBScore;

    // Calculate gameScore for slider compatibiility (difference from 10-10 baseline)
    // gameScore represents shifts: positive means Team B is leading, negative means Team A is leading
    const scoreBaseLine = 10;
    const teamADiff = preserveTeamAScore - scoreBaseLine;
    const teamBDiff = preserveTeamBScore - scoreBaseLine;
    gameObj.gameScore = (teamBDiff - teamADiff).toString();

    // Send reset notifications for UI cleanup
    const teamAPayload: GameActionResponse = Payloads.sendTeamACards([]);
    let response = successResponse(
      RESPONSE_CODES.gameNotification,
      teamAPayload
    );
    this.ioServer.to(req.gameId).emit("data", response);

    const teamBPayload: GameActionResponse = Payloads.sendTeamBCards([]);
    response = successResponse(RESPONSE_CODES.gameNotification, teamBPayload);
    this.ioServer.to(req.gameId).emit("data", response);

    const dropCardPayload: GameActionResponse = Payloads.sendDroppedCards([]);
    response = successResponse(
      RESPONSE_CODES.gameNotification,
      dropCardPayload
    );
    this.ioServer.to(req.gameId).emit("data", response);

    // Reset trump suit selection for new game
    gameObj.dropCardPlayer = [];
    gameObj.trumpSuit = undefined;
    gameObj.playerTrumpSuit = {};
    gameObj.isGameCompleted = false;
    gameObj.finalBid = undefined;
    gameObj.biddingTeam = undefined;
    gameObj.biddingPlayer = undefined;
    this.inMemoryStore.saveGame(req.gameId, gameObj);

    // Send game completion reset notification to all players
    const gameCompleteResetData = {
      isGameComplete: false,
      biddingTeam: "",
      finalBid: 0,
      teamAPoints: 0,
      teamBPoints: 0,
      winnerMessage: "",
      biddingTeamAchievedBid: false,
      teamAScore: gameObj.teamAScore,
      teamBScore: gameObj.teamBScore,
      scoreResetOccurred: false
    };
    const gameCompleteResetPayload: GameActionResponse =
      Payloads.sendGameComplete(gameCompleteResetData);
    response = successResponse(
      RESPONSE_CODES.gameNotification,
      gameCompleteResetPayload
    );
    this.ioServer.to(req.gameId).emit("data", response);

    // Send bet notification with current starter
    const incrementBetPayload: GameActionResponse = Payloads.sendBetByPlayer(
      "27",
      gameObj.playerWithCurrentBet
    );
    response = successResponse(
      RESPONSE_CODES.gameNotification,
      incrementBetPayload
    );
    this.ioServer.to(req.gameId).emit("data", response);

    // Reset trump suit selection notification
    const trumpSuitPayload: GameActionResponse = Payloads.sendTrumpSuitSelected(
      {},
      undefined
    );
    response = successResponse(RESPONSE_CODES.gameNotification, trumpSuitPayload);
    this.ioServer.to(req.gameId).emit("data", response);

    // Send updated game score for slider compatibility
    const gameScorePayload: GameActionResponse = Payloads.sendUpdatedGameScore(gameObj.gameScore);
    const gameScoreResponse = successResponse(
      RESPONSE_CODES.gameNotification,
      gameScorePayload
    );
    this.ioServer.to(req.gameId).emit("data", gameScoreResponse);

    this.dropCardPlayer = [];
  }

  /**
   * The event handles on the card drop of a player.
   * @param req The dropCardRequest.
   */
  public onDropCard(req: DropCardRequestPayload, cb: Function) {
    const { card, gameId, token, playerId } = req;
    if (!card) {
      cb(null, errorResponse(RESPONSE_CODES.failed, "Invalid card!!"));
      return;
    }

    const currentGameIns = new Game(this.inMemoryStore, gameId, card, token);

    // Set default bid and trump final bid if not set yet (first card drop indicates game has started)
    const gameObject = this.inMemoryStore.fetchGame(gameId);
    const isFirstCardOfGame = (!gameObject.teamACards || gameObject.teamACards.length === 0) &&
      (!gameObject.teamBCards || gameObject.teamBCards.length === 0) &&
      (!gameObject.droppedCards || gameObject.droppedCards.length === 0);

    if (isFirstCardOfGame && !gameObject.finalBid) {
      // Sets default to 28
      gameObject.finalBid = 28;
      gameObject.currentBet = "28";

      // Set bidding player to the one who is dropping the first card (starting player)
      gameObject.biddingPlayer = playerId;
      gameObject.playerWithCurrentBet = playerId;


      // Determine which team the bidding player belongs to
      const playerIndex = gameObject.players.findIndex(
        p => p.playerId === playerId
      );
      gameObject.biddingTeam = (playerIndex % 2 === 0) ? "A" : "B";

      // Set default trump to "Noes" if not already set
      if (!gameObject.trumpSuit) {
        gameObject.trumpSuit = "N";
        if (!gameObject.playerTrumpSuit) {
          gameObject.playerTrumpSuit = {};
        }
        gameObject.playerTrumpSuit[playerId] = "N";
      }

      this.inMemoryStore.saveGame(gameId, gameObject);

      // Notify all players about the default trump selection
      const trumpSuitPayload: GameActionResponse = Payloads.sendTrumpSuitSelected(
        gameObject.playerTrumpSuit,
        gameObject.trumpSuit
      );
      const trumpResponse = successResponse(
        RESPONSE_CODES.gameNotification,
        trumpSuitPayload
      );
      this.ioServer.to(req.gameId).emit("data", trumpResponse);

      // Notify all players about the default bet selection
      const bidPayload = Payloads.sendBetByPlayer(
        gameObject.currentBet,
        playerId
      );
      const bidResponse = successResponse(
        RESPONSE_CODES.gameNotification,
        bidPayload
      );
      this.ioServer.to(req.gameId).emit("data", bidResponse);
    }

    // This is possible in only hacky way of sending rather than from the UI.
    // So softly deny it and don't operate on this.
    if (!currentGameIns.isHisTurn) {
      cb(null, errorResponse(RESPONSE_CODES.failed, "Its not your turn!!"));
      return;
    }

    // This is to prevent player from cheating by putting a different suit
    // when the player has the same suit card available
    if (currentGameIns.isCheating) {
      cb(
        null,
        errorResponse(
          RESPONSE_CODES.failed,
          "You have the same suit card. Please play one of them!!"
        )
      );
      return;
    }

    // Prevent additional drops if the round already has plays from all players
    const currentGameObj = this.inMemoryStore.fetchGame(req.gameId);
    if (
      currentGameObj &&
      currentGameObj.dropDetails &&
      currentGameObj.players &&
      currentGameObj.dropDetails.length >= currentGameObj.players.length
    ) {
      cb(
        null,
        errorResponse(
          RESPONSE_CODES.failed,
          "Round completed. Please wait for the round result."
        )
      );
      return;
    }

    const gameObj = currentGameObj;
    const dropCardPlayer = `${card}-${playerId}`;
    this.dropCardPlayer.push(dropCardPlayer);
    const DropCardByPlayerPayload: GameActionResponse = Payloads.sendDropCardByPlayer(
      this.dropCardPlayer
    );
    let response = successResponse(
      RESPONSE_CODES.gameNotification,
      DropCardByPlayerPayload
    );
    this.ioServer.to(req.gameId).emit("data", response);
    gameObj.dropCardPlayer.push(dropCardPlayer);
    this.inMemoryStore.saveGame(req.gameId, gameObj);
    this.rotateStrike(currentGameIns, cb);
  }

  /**
   * The event handles for increasing the current player bet.
   * @param req The IncrementBetByPlayerRequest.
   */
  public onIncrementBetByPlayer(
    req: IncrementBetByPlayerRequestPayload,
    cb: Function
  ) {
    const { gameId, token } = req;
    const currentGameIns = new Game(this.inMemoryStore, gameId, "", token);
    const gameObj = this.inMemoryStore.fetchGame(req.gameId);
    const player = currentGameIns.gameObj.players.find(
      (element) => element.token === currentGameIns.currentPlayerToken
    );
    gameObj.currentBet = req.playerBet;
    gameObj.playerWithCurrentBet = player.playerId;

    // Check if this is the final bid (when all players have had a chance to bid)
    // Store the final bid and bidding team info
    if (parseInt(req.playerBet) >= 28) {
      gameObj.finalBid = parseInt(req.playerBet);
      gameObj.biddingPlayer = player.playerId;

      // Determine which team the bidding player belongs to
      const playerIndex = gameObj.players.findIndex(
        p => p.playerId === player.playerId
      );
      gameObj.biddingTeam = (playerIndex % 2 === 0) ? "A" : "B";
    }

    const IncrementBetByPlayerPayload: GameActionResponse = Payloads.sendBetByPlayer(
      req.playerBet,
      player.playerId
    );
    let response = successResponse(
      RESPONSE_CODES.gameNotification,
      IncrementBetByPlayerPayload
    );
    this.ioServer.to(req.gameId).emit("data", response);
    this.inMemoryStore.saveGame(req.gameId, gameObj);
    const dropCardPayload: GameActionResponse = Payloads.sendDroppedCards([]);
    response = successResponse(
      RESPONSE_CODES.gameNotification,
      dropCardPayload
    );
    this.ioServer.to(req.gameId).emit("data", response);
    this.inMemoryStore.saveGame(req.gameId, gameObj);
  }

  /**
   * The event handles for updating the current score.
   * @param req The UpdateGameScoreRequest.
   */
  public onUpdateGameScore(req: UpdateGameScoreRequestPayload, cb: Function) {
    const gameObj = this.inMemoryStore.fetchGame(req.gameId);
    gameObj.gameScore = req.gameScore;

    // Update team scores based on teamScore slider value
    // gameScore represents the differential: Team A gets (10 - gameScore), Team B gets (10 + gameScore)
    const scoreBaseLine = 10;
    const gameScoreNum = parseInt(req.gameScore) || 0;
    gameObj.teamAScore = scoreBaseLine - gameScoreNum;
    gameObj.teamBScore = scoreBaseLine + gameScoreNum;

    const UpdateGameScorePayload: GameActionResponse = Payloads.sendUpdatedGameScore(
      req.gameScore
    );
    let response = successResponse(
      RESPONSE_CODES.gameNotification,
      UpdateGameScorePayload
    );
    this.ioServer.to(req.gameId).emit("data", response);

    // Send team scores update so UI displays are in sync
    const gameCompleteResetData = {
      isGameComplete: false,
      biddingTeam: "",
      finalBid: 0,
      teamAPoints: 0,
      teamBPoints: 0,
      winnerMessage: "",
      biddingTeamAchievedBid: false,
      teamAScore: gameObj.teamAScore,
      teamBScore: gameObj.teamBScore,
      scoreResetOccurred: false
    };

    const gameCompleteResetPayload: GameActionResponse = Payloads.sendGameComplete(gameCompleteResetData);
    response = successResponse(
      RESPONSE_CODES.gameNotification,
      gameCompleteResetPayload
    );
    this.ioServer.to(req.gameId).emit("data", response);

    this.inMemoryStore.saveGame(req.gameId, gameObj);
  }

  /**
   * The event handles deck won by team A.
   * @param req The DeckWonByTeamRequest.
   */
  public onDeckWonByTeamA(req: DeckWonByTeamARequestPayload, cb: Function) {
    // Validate request
    if (!req || !req.gameId) return;

    // Clear any pending auto-determination timer
    if (this.roundTimers[req.gameId]) {
      clearTimeout(this.roundTimers[req.gameId]);
      delete this.roundTimers[req.gameId];
    }

    const gameObj = this.inMemoryStore.fetchGame(req.gameId);
    if (!gameObj) return;

    const dropCards = (gameObj && gameObj.dropDetails) ? gameObj.dropDetails : [];
    // Use all dropped cards from this round (dropDetails is cleared each round)
    const remainingDropCards = dropCards;
    const updatedTeamACards = remainingDropCards.concat(gameObj.teamACards || []);
    const teamAPayload: GameActionResponse = Payloads.sendTeamACards(
      updatedTeamACards
    );
    gameObj.teamACards = updatedTeamACards;
    let response = successResponse(
      RESPONSE_CODES.gameNotification,
      teamAPayload
    );
    this.ioServer.to(req.gameId).emit("data", response);
    const teamBPayload: GameActionResponse = Payloads.sendTeamBCards(
      gameObj.teamBCards || []
    );

    response = successResponse(RESPONSE_CODES.gameNotification, teamBPayload);
    this.ioServer.to(req.gameId).emit("data", response);
    this.inMemoryStore.saveGame(req.gameId, gameObj);

    const dropCardPayload: GameActionResponse = Payloads.sendDroppedCards([]);
    response = successResponse(
      RESPONSE_CODES.gameNotification,
      dropCardPayload
    );
    this.ioServer.to(req.gameId).emit("data", response);

    // Clear dropDetails for next round
    if (gameObj) {
      gameObj.dropDetails = [];
      gameObj.dropCardPlayer = [];
      this.dropCardPlayer = [];
      this.inMemoryStore.saveGame(req.gameId, gameObj);
    }

    const currentGameIns = new Game(this.inMemoryStore, req.gameId, "", "");
    currentGameIns.droppedCards = [];

    // Notify the next player (winner of this round) that it's their turn
    this.notifyTurn(req.gameId);

    // Check if game is complete after cards are assigned
    this.checkGameCompletion(req.gameId);
  }

  /**
   * The event handles deck won by team B.
   * @param req The DeckWonByTeamRequest.
   */
  public onDeckWonByTeamB(req: DeckWonByTeamBRequestPayload, cb: Function) {
    // Validate request
    if (!req || !req.gameId) return;

    // Clear any pending auto-determination timer
    if (this.roundTimers[req.gameId]) {
      clearTimeout(this.roundTimers[req.gameId]);
      delete this.roundTimers[req.gameId];
    }

    const gameObj = this.inMemoryStore.fetchGame(req.gameId);
    if (!gameObj) return;

    const dropCards = (gameObj && gameObj.dropDetails) ? gameObj.dropDetails : [];
    // Use all dropped cards from this round (dropDetails is cleared each round)
    const remainingDropCards = dropCards;
    const updatedTeamBCards = remainingDropCards.concat(gameObj.teamBCards || []);
    const teamBPayload: GameActionResponse = Payloads.sendTeamBCards(
      updatedTeamBCards
    );
    gameObj.teamBCards = updatedTeamBCards;
    let response = successResponse(
      RESPONSE_CODES.gameNotification,
      teamBPayload
    );
    this.ioServer.to(req.gameId).emit("data", response);

    const teamAPayload: GameActionResponse = Payloads.sendTeamACards(
      gameObj.teamACards || []
    );

    response = successResponse(RESPONSE_CODES.gameNotification, teamAPayload);
    this.ioServer.to(req.gameId).emit("data", response);
    this.inMemoryStore.saveGame(req.gameId, gameObj);

    const dropCardPayload: GameActionResponse = Payloads.sendDroppedCards([]);
    response = successResponse(
      RESPONSE_CODES.gameNotification,
      dropCardPayload
    );
    this.ioServer.to(req.gameId).emit("data", response);

    // Clear dropDetails for next round
    if (gameObj) {
      gameObj.dropDetails = [];
      gameObj.dropCardPlayer = [];
      this.dropCardPlayer = [];
      this.inMemoryStore.saveGame(req.gameId, gameObj);
    }

    const currentGameIns = new Game(this.inMemoryStore, req.gameId, "", "");
    currentGameIns.droppedCards = [];

    // Notify the next player (winner of this round) that it's their turn
    this.notifyTurn(req.gameId);

    // Check if game is complete after cards are assigned
    this.checkGameCompletion(req.gameId);
  }

  /**
   * The event handles on the selction of player for next round.
   * @param req The SelectPlayerRequest.
   */
  public onSelectPlayer(req: SelectPlayerRequestPayload, cb: Function) {
    // Validate request
    if (!req || !req.gameId || !req.currentPlayerId) {
      cb(null, errorResponse(RESPONSE_CODES.failed, "Invalid request"));
      return;
    }

    const { currentPlayerId, gameId } = req;
    const gameObj = this.inMemoryStore.fetchGame(gameId);

    if (!gameObj || !gameObj.players || gameObj.players.length < 1) {
      cb(null, errorResponse(RESPONSE_CODES.failed, "Game not found or no players"));
      return;
    }

    const playerToPlay = gameObj.players.find(
      (player) => player && player.playerId === currentPlayerId
    );

    if (!playerToPlay) {
      cb(null, errorResponse(RESPONSE_CODES.failed, "Player not found"));
      return;
    }

    const playerIndex = gameObj.players.findIndex(
      (player) => player && player.playerId === currentPlayerId
    );

    if (playerIndex === -1) {
      cb(null, errorResponse(RESPONSE_CODES.failed, "Player index not found"));
      return;
    }

    const selectedPlayerObj = gameObj.players.slice(
      playerIndex,
      playerIndex + 1
    );

    const arrayAfterSelectedPlayer = gameObj.players.slice(
      playerIndex + 1,
      gameObj.players.length
    );

    const arrayBeforeSelectedPlayer = gameObj.players.slice(0, playerIndex);

    const updatedArray = selectedPlayerObj
      .concat(arrayAfterSelectedPlayer)
      .concat(arrayBeforeSelectedPlayer);

    gameObj.players.splice(0, gameObj.players.length, ...updatedArray);
    this.inMemoryStore.saveGame(gameId, gameObj);

    const payload: GameActionResponse = Payloads.sendNotifyTurn(
      playerToPlay.playerId
    );

    const response = successResponse(RESPONSE_CODES.gameNotification, payload);

    this.ioServer.to(gameId).emit("data", response);
    cb(null, response);
  }

  /**
   * Rotates the game.
   * @param currentGameIns The game instance.
   * @param cb The callback function
   */
  private rotateStrike(currentGameIns: Game, cb: Function) {
    this.sendCardDropAcceptedNotification(cb);

    currentGameIns.updateStrike();

    // if (currentGameIns.isRoundOver) {
    //   currentGameIns.droppedCards = [];
    //   currentGameIns.tableCards = [];
    // }

    this.sendDroppedCardsInfo(
      currentGameIns.gameId,
      currentGameIns.droppedCards
    );

    currentGameIns.saveGame();

    // Check if all players have dropped their cards
    const gameObj = this.inMemoryStore.fetchGame(currentGameIns.gameId);
    const allPlayersDropped = gameObj.dropDetails &&
      gameObj.dropDetails.length >= gameObj.players.length;

    if (allPlayersDropped && !this.roundTimers[currentGameIns.gameId]) {
      // Set a 5-second timer to auto-determine the winner
      this.roundTimers[currentGameIns.gameId] = setTimeout(() => {
        this.autoDetermineRoundWinner(currentGameIns.gameId);
        delete this.roundTimers[currentGameIns.gameId];
      }, 5000);
    }

    this.notifyTurn(currentGameIns.gameId);
  }

  /**
   * Abort the game
   * @param gameId The game id.
   */
  public abortGame(gameId: string) {
    // Cleanup disconnection timeouts
    if (this.disconnectTimeouts[gameId]) {
      Object.values(this.disconnectTimeouts[gameId]).forEach(timeOut => {
        clearTimeout(timeOut);
      });
      delete this.disconnectTimeouts[gameId];
    }

    this.inMemoryStore.deleteGame(gameId);

    if (this.currentGameId === gameId) {
      this.playersPool = [];
    }

    const payload: GameActionResponse = Payloads.sendGameAborted(
      "The game has been aborted. Please sign in again to play."
    );

    const response = successResponse(RESPONSE_CODES.gameNotification, payload);
    this.ioServer.to(gameId).emit("data", response);

    console.log(`Game ${gameId} aborted and cleanup completed`)
  }

  /**
   * Send the dropped accepted notification to the player.
   * @param cb The callback function.
   */
  private sendCardDropAcceptedNotification(cb: Function) {
    const payload: GameActionResponse = Payloads.sendCardDropAccepted();
    const response = successResponse(RESPONSE_CODES.success, payload);
    cb(null, successResponse(RESPONSE_CODES.success, response));
  }

  /**
   * Auto-determines the winner of a round based on card weights.
   * @param gameId The game id.
   */
  private autoDetermineRoundWinner(gameId: string) {
    const gameObj = this.inMemoryStore.fetchGame(gameId);
    if (!gameObj || !gameObj.players || (gameObj.players.length as number) === 0) return;

    if (!cardToWeightagePoints) return;
    if (!cardToWeightageDict) return;

    const dropCardPlayer = gameObj.dropCardPlayer || [];
    if (!dropCardPlayer || dropCardPlayer.length === 0) return;

    // Determine the first card's suit to establish the leading suit
    let firstCardSuit = null;
    if (dropCardPlayer.length > 0) {
      const firstCardDetail = dropCardPlayer[0];
      if (firstCardDetail) {
        const [firstCard] = firstCardDetail.split("-");
        if (firstCard && firstCard.length > 1) {
          firstCardSuit = firstCard[1]; // Assuming card format is like "1HA" where 'H' is the suit
        }
      }
    }

    // Check if trump is set and if there are trump cards in the round
    const trumpSuit = gameObj.trumpSuit;
    const isTrumpSet = trumpSuit && trumpSuit !== "N";
    let trumpCardsInRound = false;

    if (isTrumpSet) {
      trumpCardsInRound = dropCardPlayer.some(cardDetail => {
        if (!cardDetail) return false;
        const [card] = cardDetail.split("-");
        return card && card.length > 1 && card[1] === trumpSuit;
      });
    }

    let highestCardWeight = -1;
    let winningPlayerIndex = -1;
    let winnerTeam = "A";

    // Determine winning logic based on trump situation

    if (isTrumpSet && trumpCardsInRound) {
      // Trump cards are present - highest trump card wins
      for (const cardDetail of dropCardPlayer) {
        if (!cardDetail) continue;

        const [card, playerId] = cardDetail.split("-");
        if (!card || !playerId) continue;

        // Only considering trump cards for winning
        if (card.length > 1 && card[1] === trumpSuit) {

          const playerIndex = gameObj.players.findIndex(
            (p: IPlayer) => p && p.playerId === playerId
          );

          if (playerIndex === -1) continue;

          const cardWeight = cardToWeightageDict[card.slice(2)] || 0;

          if (cardWeight > highestCardWeight) {
            highestCardWeight = cardWeight;
            winningPlayerIndex = playerIndex;
            winnerTeam = playerIndex % 2 === 0 ? "A" : "B";
          }
        }
      }
    } else {
      // No trump set OR no trump cards in round - highest card of leading suit wins
      for (const cardDetail of dropCardPlayer) {
        if (!cardDetail) continue;

        const [card, playerId] = cardDetail.split("-");
        if (!card || !playerId) continue;

        const playerIndex = gameObj.players.findIndex(
          (p: IPlayer) => p && p.playerId === playerId
        );

        if (playerIndex === -1) continue;

        // Only considering cards of the leading suit
        if (card.length > 1 && card[1] === firstCardSuit) {
          const cardWeight = cardToWeightageDict[card.slice(2)] || 0;

          if (cardWeight > highestCardWeight) {
            highestCardWeight = cardWeight;
            winningPlayerIndex = playerIndex;
            winnerTeam = playerIndex % 2 === 0 ? "A" : "B";
          }
        }
      }
    }

    // Only proceed if we found a valid winner
    if (winningPlayerIndex === -1) return;

    gameObj.roundWinnerTeam = winnerTeam;
    gameObj.currentTurn = winningPlayerIndex;
    gameObj.nextStrikePlayerIndex = winningPlayerIndex;
    this.inMemoryStore.saveGame(gameId, gameObj);

    // Send notification to all players
    const payload: GameActionResponse = Payloads.sendRoundWinner(winnerTeam);
    const response = successResponse(RESPONSE_CODES.gameNotification, payload);
    this.ioServer.to(gameId).emit("data", response);

    // Automatically update the winning team's cards (same as manual button click)
    if (winnerTeam === "A") {
      this.onDeckWonByTeamA({ gameId } as any, () => { });
    } else {
      this.onDeckWonByTeamB({ gameId } as any, () => { });
    }
  }

  /**
   * Check if the game is complete and determines the winner based on bid achievement.
   * @param gameId The game id.
   */
  private checkGameCompletion(gameId: string) {
    const gameObj = this.inMemoryStore.fetchGame(gameId);
    if (!gameObj || gameObj.isGameCompleted) return;

    const teamACards = gameObj.teamACards || [];
    const teamBCards = gameObj.teamBCards || [];

    // Calculate total cards distributed
    const totalCardsDistributed = teamACards.length + teamBCards.length;

    // Check if all cards have been distributed
    if (totalCardsDistributed < MAX_PLAYERS * 8) {
      return; // Game is not complete yet
    }

    const calculateTeamPoints = (cards: string[]) => {
      return cards.reduce((total, card) => {
        const cardType = card.slice(2); // Remove suit prefix (e.g., "1HA" -> "A")
        const points = cardToWeightagePoints[cardType] || 0;
        return total + points;
      }, 0);
    };

    const teamAPoints = calculateTeamPoints(teamACards);
    const teamBPoints = calculateTeamPoints(teamBCards);

    // Determine if bidding team achieved their bid
    const finalBid = gameObj.finalBid || 28;
    const biddingTeam = gameObj.biddingTeam || "A";
    const biddingTeamPoints = biddingTeam === "A" ? teamAPoints : teamBPoints;
    const biddingTeamAchievedBid = biddingTeamPoints >= finalBid;

    // Update team scores using the tiered scoring system
    let teamAScoreChange = 0;
    let teamBScoreChange = 0;
    let scoreResetOccurred = false;

    //Determine score change based on bid range
    let winPoinsts, losePoints;
    if (finalBid >= 28 && finalBid <= 39) {
      winPoinsts = 1; losePoints = -2;
    } else if (finalBid >= 40 && finalBid <= 47) {
      winPoinsts = 2; losePoints = -3;
    } else if (finalBid >= 48 && finalBid <= 57) {
      winPoinsts = 3; losePoints = -4;
    } else if (finalBid === 56) {
      winPoinsts = 4; losePoints = -5;
    } else {
      // Default fallback for any unexpected bid values
      winPoinsts = 1; losePoints = -2;
    }

    if (biddingTeamAchievedBid) {
      // Bidding team achieved their bid: they get winPoinsts, other team gets -winPoinsts
      if (biddingTeam === "A") {
        teamAScoreChange = winPoinsts;
        teamBScoreChange = -winPoinsts;
      } else {
        teamBScoreChange = winPoinsts;
        teamAScoreChange = -winPoinsts;
      }
    } else {
      // Bidding team failed to achieve their bid: they losePoints, other team gets -losePoints
      if (biddingTeam === "A") {
        teamAScoreChange = losePoints;
        teamBScoreChange = -losePoints;
      } else {
        teamBScoreChange = losePoints;
        teamAScoreChange = -losePoints;
      }
    }

    // Apply score changes
    const newTeamAScore = (gameObj.teamAScore || 10) + teamAScoreChange;
    const newTeamBScore = (gameObj.teamBScore || 10) + teamBScoreChange;

    // Check for negative scores and reset if needed
    let winnerMessage;
    const biddingPlayerName = gameObj.biddingPlayer || "Unknown Player";

    if (newTeamAScore < 0 || newTeamBScore < 0) {
      // Reset scores to 10-10
      gameObj.teamAScore = 10;
      gameObj.teamBScore = 10;
      scoreResetOccurred = true;

      if (biddingTeamAchievedBid) {
        winnerMessage = `${biddingPlayerName}'s team wins! They achieved their bid of ${finalBid} points with ${biddingTeamPoints} points. Score reset to 10-10 due to negative score.`;
      } else {
        winnerMessage = `${biddingPlayerName}'s team loses! They failed to achieve their bid of ${finalBid} points with only ${biddingTeamPoints} points. Score reset to 10-10 due to negative score.`;
      }
    } else {
      // Normal score update
      gameObj.teamAScore = newTeamAScore;
      gameObj.teamBScore = newTeamBScore;

      if (biddingTeamAchievedBid) {
        winnerMessage = `${biddingPlayerName}'s team wins! They achieved their bid of ${finalBid} points with ${biddingTeamPoints} points.`;
      } else {
        winnerMessage = `${biddingPlayerName}'s team loses! They failed to achieve their bid of ${finalBid} points with only ${biddingTeamPoints} points.`;
      }
    }

    // Prepare game completion data
    const gameCompleteData = {
      isGameComplete: true,
      biddingTeam,
      finalBid,
      teamAPoints,
      teamBPoints,
      winnerMessage,
      biddingTeamAchievedBid,
      teamAScore: gameObj.teamAScore,
      teamBScore: gameObj.teamBScore,
      scoreResetOccurred: scoreResetOccurred
    };

    // Save game state
    this.inMemoryStore.saveGame(gameId, gameObj);

    // Send game completion notification to all players
    const gameCompletePayload: GameActionResponse = Payloads.sendGameComplete(
      gameCompleteData
    );
    const gameCompletionResponse = successResponse(
      RESPONSE_CODES.gameNotification,
      gameCompletePayload
    );

    this.ioServer.to(gameId).emit("data", gameCompletionResponse);
  }

  /**
   * Send the dropped card to all game players.
   * @param gameId The game id.
   * @param cards The cards dropped.
   */
  private sendDroppedCardsInfo(gameId: string, cards: string[]) {
    const payload: GameActionResponse = Payloads.sendDroppedCards(cards);
    let response = successResponse(RESPONSE_CODES.gameNotification, payload);
    this.ioServer.to(gameId).emit("data", response);
    response = successResponse(
      RESPONSE_CODES.gameNotification,
      Payloads.sendTableCards(cards)
    );
    this.ioServer.to(gameId).emit("data", response);
  }

  /**
   * Sends the player info.
   * @param gameId The game id.
   * @param players The players
   */
  private sendPlayersInfo(gameId: string, players: Array<string>) {
    const payload = Payloads.sendPlayersInfo(players);
    const recievePlayersInfo = successResponse(
      RESPONSE_CODES.gameNotification,
      payload
    );
    this.ioServer.to(gameId).emit("data", recievePlayersInfo);
  }

  /**
   * Sends the cards to the players in the game.
   * @param socketId The game id.
   * @param cards cards array to send
   */
  private sendCards(socketId: string, cards: string[]) {
    const payload = Payloads.sendCards(cards);
    const recieveCards = successResponse(
      RESPONSE_CODES.gameNotification,
      payload
    );
    this.ioServer.sockets.connected[socketId].emit("data", recieveCards);
  }

  /**
   * Starts the game and signals the first player and wait's for the reply and rotates the strike.
   * @param gameId The game id.
   */
  private notifyTurn(gameId: string) {
    const gameObj = this.inMemoryStore.fetchGame(gameId);
    const playerToPlay = gameObj.players[gameObj.currentTurn];
    const payload: GameActionResponse = Payloads.sendNotifyTurn(
      playerToPlay.playerId
    );

    const response = successResponse(RESPONSE_CODES.gameNotification, payload);
    this.ioServer.to(gameId).emit("data", response);

    // Send each player their remaining cards for the next round
    gameObj.players.forEach((player) => {
      const playerCards = gameObj[player.token] || [];
      this.sendCards(player.socketId, playerCards);
    });
  }

  /**
   * Creates a game object.
   */
  private createGameObject(
    // playerId: string,
    // token,
    players: IPlayer[],
    starterIndex: number = 0
  ): GameModel {
    const game = {};
    game["players"] = [];
    game["currentTurn"] = starterIndex;
    game["maxTurn"] = MAX_PLAYERS - 1;
    game["droppedCards"] = [];
    game["dropdetails"] = [];
    game["teamACards"] = [];
    game["teamBCards"] = [];
    game["tableCards"] = [];
    game["dropDetails"] = [];
    game["dropCardPlayer"] = [];
    game["currentBet"] = "27";
    game["playerWithCurrentBet"] = players[starterIndex]?.playerId;
    game["teamAScore"] = 10;
    game["teamBScore"] = 10;
    game["isGameCompleted"] = false;

    // Add new fields for reconnect support
    game["disconnectedPlayers"] = {};
    game["gameCreatedAt"] = new Date();
    game["gamePaused"] = false;

    const cards: string[][] = this.deck.getCardsForGame();
    const sortedCards = cards.map((handCards) =>
      this.deck.sortCards(handCards)
    );

    for (let idx in players) {
      const player: IPlayer = players[idx];
      // Initialize reconnection fields
      player.isDisconnected = false;
      player.lastActivity = new Date();

      game["players"].push(player);
      game[player.token] = sortedCards[idx];
    }

    return <GameModel>game;
  }

  /**
   * The event handles trump suit selection by a player.
   * @param req The SelectTrumpSuitRequestPayload.
   */
  public onSelectTrumpSuit(req: any, cb: Function) {
    const { trumpSuit, gameId, playerId } = req;
    const gameObj = this.inMemoryStore.fetchGame(gameId);

    if (!gameObj.playerTrumpSuit) {
      gameObj.playerTrumpSuit = {};
    }

    gameObj.playerTrumpSuit[playerId] = trumpSuit;

    // Allow all players to update the trump suit until the game starts
    // The last selected suit becomes the trump suit
    const gameStarted =
      (gameObj.droppedCards && gameObj.droppedCards.length > 0) ||
      (gameObj.teamACards && gameObj.teamACards.length > 0) ||
      (gameObj.teamBCards && gameObj.teamBCards.length > 0);

    if (!gameStarted) {
      gameObj.trumpSuit = trumpSuit;
    }

    const payload: GameActionResponse = Payloads.sendTrumpSuitSelected(
      gameObj.playerTrumpSuit,
      gameObj.trumpSuit
    );

    const response = successResponse(RESPONSE_CODES.gameNotification, payload);
    this.ioServer.to(gameId).emit("data", response);
    this.inMemoryStore.saveGame(gameId, gameObj);
    cb(null, response);
  }

  /**
   * Check's the player id is valid or not.
   * @param playerId The player id
   * @param socketId The socket id
   */
  private checkValidityAndThrowIfInValid(playerId: string, socketId: string) {
    if (this.reachedMaxLoad) {
      throw new Error("Game server overloaded. Please try after sometime");
    }

    if (!playerId || playerId.length === 0) {
      throw new Error("User id can't be a blank");
    }

    const index = this.playersPool.filter(
      (o) => o.playerId === playerId || o.socketId === socketId
    ).length;

    if (index > 0) {
      throw new Error(
        "Please choose a different name. This name is already taken."
      );
    }

    if (playerId.length > 10) {
      throw new Error(
        "Please chooose an user id with length lessthan or equal to 10 characters."
      );
    }

    if (this.inMemoryStore.count === 100) {
      this.reachedMaxLoad = true;
    }
  }

  /**
   * Builds complete game state for a player during reconnection
   * @param game The game instance
   * @param player The player instance
   */
  private buildGameStateForPlayer(game: GameModel, player: IPlayer): any {
    const playerCards = game[player.token] || [];
    const currentPlayer = game.currentTurn !== undefined ? game.players[game.currentTurn] : null;

    return {
      ...player,
      cards: playerCards,
      gameState: {
        players: game.players.map((p: IPlayer) => p.playerId), // Send just player IDs as strings
        currentPlayerId: currentPlayer ? currentPlayer.playerId : null,
        droppedCards: game.droppedCards || [],
        dropCardPlayer: game.dropCardPlayer || [], // Include card-player mapping
        teamACards: game.teamACards || [],
        teamBCards: game.teamBCards || [],
        currentBet: game.currentBet,
        gameScore: game.gamescore, trumpSuit: game.trumpSuit,
        currentTurn: game.currentTurn,
        finalBid: game.finalfid,
        biddingTeam: game.biddingTeam,
        biddingPlayer: game.biddingPlayer,
        isGameComplete: game.isGameComplete,
        teamAScore: game.teamAScore,
        teamBScore: game.teamBScore,
        gamePaused: game.gamePaused
      }
    }
  }

  /**
   * Refreshes game state for all connected players in a game
   * @param gameld The game id
   */
  private refreshGameStateForAllPlayers(gameId: string): void {
    const game = this.inMemoryStore.fetchGame(gameId);
    if (!game) return;

    const connectedPlayers = game.players.filter((p: IPlayer) => !p.isDisconnected);

    connectedPlayers.forEach((player: IPlayer) => {
      const gameStatePayload = this.buildGameStateForPlayer(game, player);
      const response = successResponse(RESPONSE_CODES.gameRefresh, gameStatePayload);
      this.ioServer.to(player.socketId).emit("data", response);
    });
  }

  /**
   * Handle player disconnection gracefully
   * @param gameld The game id
   * @param playerId The player id
   * @param socketId The socket id
   */
  public handlePlayerDisconnection(gameId: string, playerId: string, socketId: string): void {
    const game = this.inMemoryStore.fetchGame(gameId);
    if (!game) {
      console.log("Game 5(gameId) not found for disconnection");
      return;

    }

    // Find and mark player as disconnected
    const playerIndex = game.players.findIndex(
      (p: IPlayer) => p.playerId === playerId && p.socketId === socketId
    );

    if (playerIndex === -1) {
      console.log('Player (playerId) not found in game s(gameId}');
      return;
    }

    const player = (game.players as any)[playerIndex];
    player.isDisconnected = true;
    player.disconnectedAt = new Date();

    // Initialize disconnectedPlayers if not exists 
    if (!game.disconnectedPlayers) {
      game.disconnectedPlayers = {};
    }

    // Move player to disconnected players tracking 
    game.disconnectedPlayers[playerId] = { ...player };

    // Check if game should be paused
    const connectedPlayersCount = game.players.filter(
      (p: IPlayer) => !p.isDisconnected
    ).length;

    if (connectedPlayersCount < MAX_PLAYERS) {
      game.gamePaused = true;
      game.pausedAt = new Date();

      // Notify remaining players
      const pausePayload = Payloads.sendGamePaused(
        `$(playerId) disconnected.Game paused.Waiting for reconnection...`
      );

      const pauseResponse = successResponse(RESPONSE_CODES.gameNotification, pausePayload);
      this.ioServer.to(gameId).emit("data", pauseResponse);
    }


    // Set timeout for permanent removal 
    this.setDisconnectTimeout(gameId, playerId);

    // Save updated game
    this.inMemoryStore.saveGame(gameId, game);

    console.log(`Player ${playerId} marked as disconnected in game ${gameId}`);
  }

  /**
   * Set timeout for player disconnection
   * @param gameId The game id
   * @param playerId The player id
   */
  private setDisconnectTimeout(gameId: string, playerId: string): void {
    if (!this.disconnectTimeouts[gameId]) {
      this.disconnectTimeouts[gameId] = {};
    }
    // Clear existing timeout if any

    if (this.disconnectTimeouts[gameId][playerId]) {
      clearTimeout(this.disconnectTimeouts[gameId][playerId]);
    }

    // Set new timeout
    this.disconnectTimeouts[gameId][playerId] = setTimeout(() => {
      this.handlePermanentPlayerRemoval(gameId, playerId);
    }, this.DISCONNECT_TIMEOUT_MS);

    console.log(
      `Disconnect timeout set for player ${playerId} in game ${gameId} (${this.DISCONNECT_TIMEOUT_MS / 1000}s)`
    );
  }

  /**
   * Handle permanent player removal after timeout
   * @param gameId The game id
   * @param playerId The player id
   * */
  private handlePermanentPlayerRemoval(gameId: string, playerId: string): void {
    console.log(`Permanently removing player ${playerId} from game ${gameId}`);

    const game = this.inMemoryStore.fetchGame(gameId);

    if (!game) return;

    // Remove from disconnected players 
    if (game.disconnectedPlayers && game.disconnectedPlayers[playerId]) {
      delete game.disconnectedPlayers[playerId];
    }

    // Clean up timeout
    if (this.disconnectTimeouts[gameId] && this.disconnectTimeouts[gameId][playerId]) {
      delete this.disconnectTimeouts[gameId][playerId];
    }

    // Check if game should be aborted
    const totalConnectedPlayers = game.players.filter((p: IPlayer) => p.isDisconnected).length;
    const totalDisconnectedPlayers = Object.keys(game.disconnectedPlayers || {}).length;

    if (totalConnectedPlayers + totalDisconnectedPlayers < 3) { // Minimum players needed
      // Not enough players to continue abort game
      this.abortGame(gameId);
    } else {
      //Notify remaining players
      const removalPayload = Payloads.sendGameAborted(
        `${playerId} has been removed due to prolonged disconnection.`
      );

      const removalResponse = successResponse(RESPONSE_CODES.gameNotification, removalPayload);
      this.ioServer.to(gameId).emit("data", removalResponse);

      this.inMemoryStore.saveGame(gameId, game);
    }
  }
}
