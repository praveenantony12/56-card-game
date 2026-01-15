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
  AddBotsRequestPayload,
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
import { TeamBotAgent } from "../agents/TeamBotAgent";

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
  botTimers: { [gameId: string]: NodeJS.Timeout } = {}; // Bot turn timers

  // Reconnection system
  private disconnectTimeouts: {
    [gameId: string]: {
      [playerId: string]: NodeJS.Timeout;
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
   * Adds the player to the game pool or joins existing game.
   * @param socket The socket instance
   * @param playerId The player id
   * @param gameIdToJoin Optional game ID to join existing game
   * @param cb The callback after the action is done.
   *
   * Note: Here we need to get the socket instance everytime and can't be stored as intance
   * variable because we are adding the socket to room (game id).
   */
  public addPlayerToGamePool(
    socket: IOSocket,
    playerId: string,
    gameIdToJoin: string | undefined,
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
        if (
          game &&
          game.disconnectedPlayers &&
          game.disconnectedPlayers[playerId]
        ) {
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

      let targetGameId: string;
      let isGameCreator = false;

      if (gameIdToJoin) {
        // Player wants to join an existing game
        console.log(
          `[GAME CORE] ${playerId} attempting to join game: ${gameIdToJoin}`
        );

        // Check if the game exists and has space for more players
        const existingGame = this.inMemoryStore.fetchGame(gameIdToJoin);
        if (!existingGame) {
          throw new Error(
            "Game not found. Please check the Game ID and try again."
          );
        }

        // Check if game already started or is full
        if (existingGame.isGameStarted) {
          throw new Error(
            "Game has already started and cannot accept new players."
          );
        }

        // Handle both pre-game (gamePlayersInfo) and post-game structure (players)
        let currentHumanCount = 0;
        let currentBotCount = 0;

        if (
          existingGame.gamePlayersInfo &&
          Array.isArray(existingGame.gamePlayersInfo)
        ) {
          // Pre-game structure
          currentHumanCount = existingGame.gamePlayersInfo.length;
          currentBotCount = existingGame.botCount || 0;
        } else if (
          existingGame.players &&
          Array.isArray(existingGame.players)
        ) {
          // Post-game start structure - count humans vs bots
          currentHumanCount = existingGame.players.filter(
            (p: IPlayer) => !p.isBotAgent
          ).length;
          currentBotCount = existingGame.players.filter(
            (p: IPlayer) => p.isBotAgent
          ).length;
        }

        const totalCurrentPlayers = currentHumanCount + currentBotCount;

        if (totalCurrentPlayers >= MAX_PLAYERS) {
          throw new Error("Game is already full (6/6 players).");
        }

        targetGameId = gameIdToJoin;
        console.log(
          `[GAME CORE) ${playerId} successfully joining game: ${targetGameId}`
        );
      } else {
        // Player is creating a new game
        targetGameId = getUniqueId();
        isGameCreator = true;
        this.currentGameId = targetGameId;
        console.log(
          `[GAME CORE] ${playerId} is creating a new game: ${targetGameId}`
        );

        // Create a new game record in the store for other players to join
        const newGame: any = {
          gameId: targetGameId,
          gamePlayersInfo: [],
          botPlayersInfo: [], // Track bots separately
          botCount: 0, // Track number of bots added
          isGameStarted: false,
          gameStartTime: new Date(),
          disconnectedPlayers: {},
          // Add other required game properties as needed
        };
        this.inMemoryStore.saveGame(targetGameId, newGame);
        console.log(
          `[GAME CORE] Created new game record in store: ${targetGameId}`
        );
      }

      this.checkValidityAndThrowIfInValid(playerId, socket.id);

      const player: IPlayer = {
        socketId: socket.id,
        playerId,
        token: getUniqueId(),
        gameId: targetGameId,
      };

      // For joining existing games, we need to add the player to that specific game
      if (gameIdToJoin || !isGameCreator) {
        const game = this.inMemoryStore.fetchGame(targetGameId);
        if (game) {
          // Add player to existing game
          game.gamePlayersInfo.push({
            playerId,
            token: player.token,
            socketId: socket.id,
          });
          this.inMemoryStore.saveGame(targetGameId, game);
          console.log(
            `[GAME CORE] Added ${playerId} to existing game ${targetGameId}, total players: ${game.gamePlayersInfo.length}`
          );
        }
      } else {
        // For new games, add the creator to both the pool and the game record
        this.playersPool.push(player);
        const game = this.inMemoryStore.fetchGame(targetGameId);
        if (game) {
          game.gamePlayersInfo.push({
            playerId,
            token: player.token,
            socketId: socket.id,
          });
          this.inMemoryStore.saveGame(targetGameId, game);
        }
        console.log(
          `[GAME CORE] Added ${playerId} to new game pool and game record for game ${targetGameId}`
        );
      }

      socket.join(targetGameId);
      (socket as any).gameInfo = player;

      // Include game creation info in response
      const responsePayload = {
        ...player,
        isGameCreator,
        gameId: targetGameId,
      };

      cb(null, successResponse(RESPONSE_CODES.loginSuccess, responsePayload));

      // For game creators, they will see bot selection UI
      // For joiners, they wait for the creator to start the game or auto-start when full
      console.log(
        `[GAME CORE] Login successful for ${playerId} in game ${targetGameId} (creator: ${isGameCreator})`
      );

      // Check if we should auto-start the game (when 6 total players reached)
      // This applies to both creators and joiners
      const updatedGame = this.inMemoryStore.fetchGame(targetGameId);
      if (updatedGame) {
        const totalPlayers =
          updatedGame.gamePlayersInfo.length + (updatedGame.botCount || 0);
        console.log(
          `[GAME CORE] Game ${targetGameId} now has ${totalPlayers}/6 players (${
            updatedGame.gamePlayersInfo.length
          } humans + ${updatedGame.botCount || 0} bots)`
        );

        if (totalPlayers === MAX_PLAYERS && !updatedGame.isGameStarted) {
          console.log(
            `[GAME CORE] Auto-starting game ${targetGameId} - 6 players reached!`
          );

          // Get all human players
          const allHumanPlayers = updatedGame.gamePlayersInfo.map(
            (playerInfo) => ({
              socketId: playerInfo.socketId,
              playerId: playerInfo.playerId,
              token: playerInfo.token,
              gameId: targetGameId,
            })
          );

          // Get all bot players (if any)
          const allBotPlayers = (updatedGame.botPlayersInfo || []).map(
            (botInfo) => ({
              socketId: botInfo.socketId,
              playerId: botInfo.playerId,
              token: botInfo.token,
              gameId: targetGameId,
              isBotAgent: true,
            })
          );

          const allPlayers = [...allHumanPlayers, ...allBotPlayers];
          this.gameStartIndex = 0;

          // Mark game as started to prevent duplicate starts
          updatedGame.isGameStarted = true;
          this.inMemoryStore.saveGame(targetGameId, updatedGame);

          this.startGame(targetGameId, allPlayers);
        }
      }
    } catch (error) {
      console.error(`[GAME CORE] Login failed for ${playerId}:`, error);
      cb(
        null,
        errorResponse(
          RESPONSE_CODES.loginFailed,
          error && error.message ? error.message : "Unknown error"
        )
      );
    }
  }

  /**
   * Handle adding bots to the current game
   * @param req The AddBotsRequestPayload
   * @param cb The callback function
   */
  public onAddBots(req: AddBotsRequestPayload, cb: Function) {
    try {
      const { botCount, gameId, startImmediately = true } = req;

      // Validate bot count
      if (botCount < 0 || botCount > 5) {
        cb(
          null,
          errorResponse(
            RESPONSE_CODES.failed,
            "Bot count must be between 0 and 5"
          )
        );
        return;
      }

      // If botCount is 0, just wait for human players (no bots to add)
      if (botCount === 0) {
        // console.log(
        //   `[BOT AGENT] Game ${gameId} set to wait for human players only (no bots)`
        // );
        cb(
          null,
          successResponse(RESPONSE_CODES.loginSuccess, {
            message:
              "Game set to wait for human players. Share the Game ID with friends!",
            botPlayers: [],
            gameStarted: false,
            playersNeeded: MAX_PLAYERS - 1, // Need 5 more humans (6 total - 1 creator)
          })
        );
        return;
      }

      // Get existing game or use current game
      let targetGame = this.inMemoryStore.fetchGame(gameId);
      let currentHumanPlayers: IPlayer[] = [];
      let targetGameId = gameId;

      if (targetGame) {
        // For existing games, get players from the game's player info
        currentHumanPlayers = targetGame.gamePlayersInfo.map((playerInfo) => ({
          socketId: playerInfo.socketId,
          playerId: playerInfo.playerId,
          token: playerInfo.token,
          gameId: gameId,
        }));
        // console.log(
        //   `[BOT AGENT] Adding bots to existing game ${gameId} with ${currentHumanPlayers.length} human players`
        // );
      } else {
        // For new games, use the players pool
        currentHumanPlayers = this.playersPool.filter(
          (p) => p.gameId === gameId
        );
        if (currentHumanPlayers.length === 0) {
          // Fall back to current players pool if no specific game ID match
          currentHumanPlayers = [...this.playersPool];
          targetGameId = this.currentGameId;
          targetGame =
            this.inMemoryStore.fetchGame(targetGameId) ||
            this.createEmptyGame(targetGameId);
        }
        // console.log(
        //   `[BOT AGENT] Adding bots to new game ${targetGameId} with ${currentHumanPlayers.length} human players from pool`
        // );
      }

      // Check if we have enough space for bots
      const currentBotCount = targetGame.botCount || 0;
      const totalPlayers =
        currentHumanPlayers.length + currentBotCount + botCount;

      if (totalPlayers > MAX_PLAYERS) {
        cb(
          null,
          errorResponse(
            RESPONSE_CODES.failed,
            `Cannot add ${botCount} bots. Maximum ${MAX_PLAYERS} players allowed. Current: ${currentHumanPlayers.length} humans + ${currentBotCount} bots`
          )
        );
        return;
      }

      // Create bot players
      const botPlayers = this.addBotPlayers(
        currentHumanPlayers.length + currentBotCount
      );
      const selectedBots = botPlayers.slice(0, botCount);

      // Update game record with bot info
      if (!targetGame.botPlayersInfo) targetGame.botPlayersInfo = [];
      selectedBots.forEach((bot) => {
        targetGame.botPlayersInfo.push({
          playerId: bot.playerId,
          token: bot.token,
          socketId: bot.socketId,
          isBotAgent: true,
        });
      });
      targetGame.botCount = (targetGame.botCount || 0) + botCount;
      this.inMemoryStore.saveGame(targetGameId, targetGame);

      // Check if we should start the game
      const totalPlayersAfterBots =
        currentHumanPlayers.length + targetGame.botCount;

      if (startImmediately || totalPlayersAfterBots === MAX_PLAYERS) {
        // Start the game with current players + all bots
        const allBots = targetGame.botPlayersInfo.map((botInfo) => ({
          socketId: botInfo.socketId,
          playerId: botInfo.playerId,
          token: botInfo.token,
          gameId: targetGameId,
          isBotAgent: true,
        }));
        const allPlayers = [...currentHumanPlayers, ...allBots];

        // Clean up players pool if this was a new game
        if (!this.inMemoryStore.fetchGame(gameId)) {
          this.playersPoolForReGame = [...allPlayers];
          this.playersPool = [];
          this.currentGameId = getUniqueId();
        }

        // Reset starter index for the first game
        this.gameStartIndex = 0;

        // console.log(
        //   `[BOT AGENT] Starting game ${targetGameId} with ${allPlayers.length} total players (${currentHumanPlayers.length} humans + ${allBots.length} bots)`
        // );
        this.startGame(targetGameId, allPlayers);

        cb(
          null,
          successResponse(RESPONSE_CODES.loginSuccess, {
            message: `Game started with ${selectedBots.length} bot players`,
            botPlayers: selectedBots.map((bot) => bot.playerId),
            gameStarted: true,
          })
        );
      } else {
        // Just add bots and wait for human players
        // console.log(
        //   `[BOT AGENT] Added ${botCount} bots to game ${targetGameId}. Waiting for ${
        //     MAX_PLAYERS - totalPlayersAfterBots
        //   } more human players.`
        // );

        cb(
          null,
          successResponse(RESPONSE_CODES.loginSuccess, {
            message: `Added ${botCount} bot players. Waiting for ${
              MAX_PLAYERS - totalPlayersAfterBots
            } more humans players to join.`,
            botPlayers: selectedBots.map((bot) => bot.playerId),
            gameStarted: false,
            playersNeeded: MAX_PLAYERS - totalPlayersAfterBots,
          })
        );
      }
    } catch (error) {
      console.error(`[BOT AGENT] Error in onAddBots:`, error);
      cb(
        null,
        errorResponse(
          RESPONSE_CODES.failed,
          error && error.message ? error.message : "Unknown error"
        )
      );
    }
  }

  private createEmptyGame(gameId: string): any {
    return {
      gameId: gameId,
      gamePlayersInfo: [],
      botPlayersInfo: [],
      botCount: 0,
      isGameStarted: false,
      gameStartTime: new Date(),
      disconnectedPlayers: {},
    };
  }

  /**
   * Optimize team assignments to keep humans together as much as possible.
   * Team A: positions 0, 2, 4
   * Team B: positions 1, 3, 5
   *
   * @param players Array of players (humans and bots)
   * @returns Reordered players array optimized for team assignment
   */
  private optimizeTeamAssignment(players: IPlayer[]): IPlayer[] {
    const humans = players.filter((p) => !p.isBotAgent);
    const bots = players.filter((p) => p.isBotAgent);
    const humanCount = humans.length;
    const botCount = bots.length;

    console.log(
      `[TEAM ASSIGNMENT] Optimizing for ${humanCount} humans + ${botCount} bots`
    );

    // Create result array with 6 positions
    const result = new Array(6);

    switch (humanCount) {
      case 6:
        // All humans - use normal assignment (no change needed)
        return players;

      case 5:
        // 5 humans + 1 bot: put all humans in Team A (0,2,4) and B (1,3), bot gets remaining spot
        result[0] = humans[0]; // Team A
        result[1] = humans[1]; // Team B
        result[2] = humans[2]; // Team A
        result[3] = humans[3]; // Team B
        result[4] = humans[4]; // Team A
        result[5] = bots[0]; // Team B (last spot)
        break;

      case 4:
        // 4 humans + 2 bots: 3 humans in Team A (0,2,4) and 1 human + 2 bots in Team B
        result[0] = humans[0]; // Team A
        result[1] = humans[3]; // Team B - one human
        result[2] = humans[1]; // Team A
        result[3] = bots[0]; // Team B - first bot
        result[4] = humans[2]; // Team A
        result[5] = bots[1]; // Team B - second bot
        break;

      case 3:
        // 3 humans + 3 bots: all humans in Team A and all bots in Team B (IDEAL Human Vs Bots game)
        result[0] = humans[0]; // Team A
        result[1] = bots[0]; // Team B
        result[2] = humans[1]; // Team A
        result[3] = bots[1]; // Team B
        result[4] = humans[2]; // Team A
        result[5] = bots[2]; // Team B
        break;

      case 2:
        // 2 humans + 4 bots: 2 humans + 1 bot in Team A, 3 bots in Team B
        result[0] = humans[0]; // Team A
        result[1] = bots[1]; // Team B
        result[2] = humans[1]; // Team A
        result[3] = bots[2]; // Team B
        result[4] = bots[0]; // Team A - one bot with humans
        result[5] = bots[3]; // Team B
        break;

      case 1:
        // 1 human + 5 bots: this should only happen when "Start with 5 bots" is selected
        // Put human in Team A with 2 bots, 3 bots in Team B
        result[0] = humans[0]; // Team A - the human
        result[1] = bots[2]; // Team B
        result[2] = bots[0]; // Team A
        result[3] = bots[3]; // Team B
        result[4] = bots[1]; // Team A
        result[5] = bots[4]; // Team B
        break;

      default:
        // Fallback: use original order
        return players;
    }

    console.log(
      `[TEAM ASSIGNMENT] Team A (0,2,4): ${result[0]?.playerId}, ${result[2]?.playerId}, ${result[4]?.playerId}`
    );
    console.log(
      `[TEAM ASSIGNMENT] Team B (1,3,5): ${result[1]?.playerId}, ${result[3]?.playerId}, ${result[5]?.playerId}`
    );

    return result;
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
        if (
          game &&
          game.disconnectedPlayers &&
          game.disconnectedPlayers[playerId]
        ) {
          playerToReconnect = game.disconnectedPlayers[playerId];
          reconnectedGame = game;
        }
      }

      // If not found by gameld, search through all games
      if (!playerToReconnect) {
        // Note: This is a simplified search. In production, you'd want a more efficient way
        // to index games by player for faster lookup
        console.log(
          "Searching for disconnected player $(playerId) across all games"
        );
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
          requiredApprovals: 1, // Only need one approval
        };

        //Notify other players about the reconnection request
        const reconnectionRequest = {
          playerId: playerId,
          playerName: playerToReconnect.playerId, // Using playerId as display name
          gameId: gameId,
        };

        activePlayers.forEach((player: IPlayer) => {
          this.ioServer?.to(player.socketId).emit("data", {
            success: true,
            code: RESPONSE_CODES.gameNotification,
            payload: {
              action: "reconnection_request",
              data: reconnectionRequest,
            },
          });
        });

        // Send pending approval response to reconnecting player
        cb(
          null,
          successResponse(RESPONSE_CODES.reconnectPendingApproval, {
            message: "Reconnection request sent to other players for approval",
            gameld: gameId,
          })
        );
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
        (p: IPlayer) => (p.playerId = playerId)
      );

      if (playerIndex == -1) {
        (reconnectedGame.players as any)[playerIndex] = playerToReconnect;
      }

      // Remove from disconnected players
      delete reconnectedGame.disconnectedPlayers![playerId];

      // Clear disconnect timeout
      if (
        this.disconnectTimeouts[gameId] &&
        this.disconnectTimeouts[gameId][playerId]
      ) {
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

        // Notify all players that game is resumed
        const resumePayload = Payloads.sendGameResumed(
          `${playerId} reconnected. Game resumed!`
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
        this.ioServer.to(gameId).emit("data", reconnectResponse);
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
      if (
        !game ||
        !game.pendingReconnections ||
        !game.pendingReconnections[playerId]
      ) {
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

        cb(
          null,
          successResponse(RESPONSE_CODES.reconnectApproved, {
            message: "Player reconnection approved and completed",
          })
        );
      } else {
        cb(
          null,
          successResponse(RESPONSE_CODES.success, {
            message: `Approval recorded.$(pendingRequest.approvals.length) / ${pendingRequest.requiredApprovals} approvals recieved`,
          })
        );
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
      if (
        !game ||
        !game.pendingReconnections ||
        !game.pendingReconnections[playerId]
      ) {
        throw new Error("No pending reconnection request found");
      }

      const pendingRequest = game.pendingReconnections(playerId);

      // Notify the requesting player that reconnection was denied
      pendingRequest.requestingSocket.emit(
        "data",
        errorResponse(
          RESPONSE_CODES.reconnectDenied,
          `Reconnection denied by ${denyingPlayerId}`
        )
      );

      // Clean up the pending request
      delete game.pendingReconnections[playerId];

      cb(
        null,
        successResponse(RESPONSE_CODES.success, {
          message: "Reconnection request denied",
        })
      );
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
    if (
      this.disconnectTimeouts[gameId] &&
      this.disconnectTimeouts[gameId][playerId]
    ) {
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

    requestingSocket.emit(
      "data",
      successResponse(RESPONSE_CODES.reconnectSuccess, gameState)
    );

    // Check if the game should be resumed
    const connectedPlayersCount = game.players.filter(
      (p: IPlayer) => !p.isDisconnected
    ).length;

    if (game.gamePaused && connectedPlayersCount >= MAX_PLAYERS) {
      // Resume the game
      game.gamePaused = false;
      delete game.gamePausedAt;

      // Notify all players that the game has resumed
      const resumePayload = Payloads.sendGameResumed(
        `${playerId} has reconnected. Game resumed!`
      );
      const resumeResponse = successResponse(
        RESPONSE_CODES.gameNotification,
        resumePayload
      );
      this.ioServer?.to(gameId).emit("data", resumeResponse);
    }

    // Notify all players that the player has reconnected
    const reconnectPayload = Payloads.sendPlayerReconnected(
      `${playerId} has successfully reconnected to the game!`
    );
    const reconnectResponse = successResponse(
      RESPONSE_CODES.gameNotification,
      reconnectPayload
    );
    this.ioServer.to(gameId).emit("data", reconnectResponse);
  }

  /**
   * Starts the game.
   * @param gameId The game id.
   */
  public startGame(gameId: string, players: IPlayer[]) {
    // Reorder players to keep humans together on teams as much as possible
    const reorderedPlayers = this.optimizeTeamAssignment(players);

    const gameObject = this.createGameObject(
      reorderedPlayers,
      this.gameStartIndex
    );

    // Mark game as started
    gameObject.isGameStarted = true;
    gameObject.gameStartTime = new Date();

    // Add restart protection from the very beginning
    gameObject.restartProtectionActive = true;
    gameObject.recentlyRestarted = false; // Not a restart, but initial start

    this.inMemoryStore.saveGame(gameId, gameObject);

    gameObject.players.forEach((player) => {
      this.sendCards(player.socketId, gameObject[player.token]);
    });

    this.sendPlayersInfo(
      gameId,
      reorderedPlayers.map((x) => x.playerId)
    );

    const gameObj = this.inMemoryStore.fetchGame(gameId);
    gameObj.dropCardPlayer = [];
    this.inMemoryStore.saveGame(gameId, gameObj);

    // Notify all players about restart protection status from game start
    const restartProtectionPayload = {
      action: "RESTART_PROTECTION",
      data: {
        restartProtectionActive: true,
        message: "Restart is disabled until the first card is played",
      },
    };
    const restartProtectionResponse = successResponse(
      RESPONSE_CODES.gameNotification,
      restartProtectionPayload
    );
    this.ioServer.to(gameId).emit("data", restartProtectionResponse);

    this.notifyTurn(gameId);
  }

  /**
   * Starts the game.
   * @param gameId The game id.
   */
  public onRestartGame(req: RestartGameRequestPayload, cb: Function) {
    const { gameId } = req;

    // Get current game object to work with current players
    const currentGameObj = this.inMemoryStore.fetchGame(gameId);
    if (!currentGameObj) {
      cb(null, errorResponse(RESPONSE_CODES.failed, "Game not found"));
      return;
    }

    // Check if restart is currently protected (just after a recent restart)
    if (currentGameObj.restartProtectionActive) {
      cb(
        null,
        errorResponse(
          RESPONSE_CODES.failed,
          "Restart is temporarily disabled. Please wait for the first round to be played."
        )
      );
      return;
    }

    // CRITICAL: Clear all existing bot timers for this game before restart
    if (this.botTimers[gameId]) {
      clearTimeout(this.botTimers[gameId]);
      delete this.botTimers[gameId];
      console.log(`[RESTART] Cleared bot timers for game ${gameId}`);
    }

    // Also clear round timers
    if (this.roundTimers[gameId]) {
      clearTimeout(this.roundTimers[gameId]);
      delete this.roundTimers[gameId];
      console.log(`[RESTART] Cleared round timers for game ${gameId}`);
    }

    // Get current players from the active game
    const currentPlayers = currentGameObj.players || [];
    if (currentPlayers.length === 0) {
      cb(
        null,
        errorResponse(RESPONSE_CODES.failed, "No players found in game")
      );
      return;
    }

    // Move to next player clockwise for the new game - fix the rotation logic
    const currentStarterIndex = this.gameStartIndex;
    const newStarterIndex = (currentStarterIndex + 1) % currentPlayers.length;
    this.gameStartIndex = newStarterIndex;

    console.log(
      `[RESTART] Game ${gameId}: starter moving from index ${currentStarterIndex} to ${newStarterIndex}`
    );
    console.log(
      `[RESTART] New starter: ${currentPlayers[newStarterIndex]?.playerId}`
    );

    // Preserve team score before restarting
    const preserveTeamAScore = currentGameObj?.teamAScore || 10;
    const preserveTeamBScore = currentGameObj?.teamBScore || 10;

    // Update socket IDs from current game state to handle reconnected players
    const playersForRestart = currentPlayers
      .filter((p) => !p.isDisconnected)
      .map((player) => ({
        ...player,
        // Ensure we have the most current socket ID for each player
      }));

    // Start the game with updated starter index
    this.startGame(gameId, playersForRestart);

    // Restore the preserved team scores after game creation
    const gameObj = this.inMemoryStore.fetchGame(gameId);
    gameObj.teamAScore = preserveTeamAScore;
    gameObj.teamBScore = preserveTeamBScore;

    // Mark game as recently restarted to prevent immediate restart until first round
    gameObj.recentlyRestarted = true;
    gameObj.restartProtectionActive = true;

    // Calculate gameScore for slider compatibility (difference from 10-10 baseline)
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
      scoreResetOccurred: false,
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
    response = successResponse(
      RESPONSE_CODES.gameNotification,
      trumpSuitPayload
    );
    this.ioServer.to(req.gameId).emit("data", response);

    // Send updated game score for slider compatibility
    const gameScorePayload: GameActionResponse = Payloads.sendUpdatedGameScore(
      gameObj.gameScore
    );
    const gameScoreResponse = successResponse(
      RESPONSE_CODES.gameNotification,
      gameScorePayload
    );
    this.ioServer.to(req.gameId).emit("data", gameScoreResponse);

    // Notify all players about restart protection status
    const restartProtectionPayload = {
      action: "RESTART_PROTECTION",
      data: {
        restartProtectionActive: gameObj.restartProtectionActive,
        message:
          "Restart is temporarily disabled until the first card is played",
      },
    };
    const restartProtectionResponse = successResponse(
      RESPONSE_CODES.gameNotification,
      restartProtectionPayload
    );
    this.ioServer.to(req.gameId).emit("data", restartProtectionResponse);

    this.dropCardPlayer = [];

    // Send success response to the requesting player
    cb(
      null,
      successResponse(RESPONSE_CODES.gameNotification, {
        message: "Game restarted successfully",
        newStarter: currentPlayers[newStarterIndex]?.playerId,
        restartProtectionActive: true,
      })
    );

    console.log(
      `[RESTART] Game ${gameId} restarted successfully. New starter: ${currentPlayers[newStarterIndex]?.playerId}`
    );
  }

  /**
   * The event handles on the card drop of a player.
   * @param req The dropCardRequest.
   */
  public onDropCard(req: DropCardRequestPayload, cb: Function) {
    const { card, gameId, token, playerId } = req;
    // console.log(
    //   `[BOT AGENT] onDropCard called for ${playerId} with card ${card}`
    // );

    if (!card) {
      // console.log(
      //   `[BOT AGENT] onDropCard failed for ${playerId}: Invalid card`
      // );
      cb(null, errorResponse(RESPONSE_CODES.failed, "Invalid card!!"));
      return;
    }

    const currentGameIns = new Game(this.inMemoryStore, gameId, card, token);

    // Set default bid and trump final bid if not set yet (first card drop indicates game has started)
    const gameObject = this.inMemoryStore.fetchGame(gameId);
    const isFirstCardOfGame =
      (!gameObject.teamACards || gameObject.teamACards.length === 0) &&
      (!gameObject.teamBCards || gameObject.teamBCards.length === 0) &&
      (!gameObject.droppedCards || gameObject.droppedCards.length === 0);

    if (isFirstCardOfGame && !gameObject.finalBid) {
      // Sets default to 28
      gameObject.finalBid = 28;
      gameObject.currentBet = "28";

      // Set bidding player to the one who is dropping the first card (starting player)
      gameObject.biddingPlayer = playerId;

      // Remove restart protection once first card is played after restart
      if (gameObject.restartProtectionActive) {
        gameObject.restartProtectionActive = false;
        gameObject.recentlyRestarted = false;
        console.log(
          `[RESTART] Protection disabled for game ${gameId} - first card played`
        );

        // Notify all players that restart protection is now disabled
        const restartProtectionPayload = {
          action: "RESTART_PROTECTION",
          data: {
            restartProtectionActive: false,
            message: "Restart is now available again",
          },
        };
        const restartProtectionResponse = successResponse(
          RESPONSE_CODES.gameNotification,
          restartProtectionPayload
        );
        this.ioServer.to(gameId).emit("data", restartProtectionResponse);
      }
      gameObject.playerWithCurrentBet = playerId;

      // Determine which team the bidding player belongs to
      const playerIndex = gameObject.players.findIndex(
        (p) => p.playerId === playerId
      );
      gameObject.biddingTeam = playerIndex % 2 === 0 ? "A" : "B";

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
      const trumpSuitPayload: GameActionResponse =
        Payloads.sendTrumpSuitSelected(
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
      // console.log(
      //   `[BOT AGENT] onDropCard failed for ${playerId}: Not their turn`
      // );
      cb(null, errorResponse(RESPONSE_CODES.failed, "Its not your turn!!"));
      return;
    }

    // This is to prevent player from cheating by putting a different suit
    // when the player has the same suit card available
    if (currentGameIns.isCheating) {
      // console.log(
      //   `[BOT AGENT] onDropCard failed for ${playerId}: Cheating detected`
      // );
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
    const DropCardByPlayerPayload: GameActionResponse =
      Payloads.sendDropCardByPlayer(this.dropCardPlayer);
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
        (p) => p.playerId === player.playerId
      );
      gameObj.biddingTeam = playerIndex % 2 === 0 ? "A" : "B";
    }

    const IncrementBetByPlayerPayload: GameActionResponse =
      Payloads.sendBetByPlayer(req.playerBet, player.playerId);
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

    const UpdateGameScorePayload: GameActionResponse =
      Payloads.sendUpdatedGameScore(req.gameScore);
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
      scoreResetOccurred: false,
    };

    const gameCompleteResetPayload: GameActionResponse =
      Payloads.sendGameComplete(gameCompleteResetData);
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

    const dropCards = gameObj && gameObj.dropDetails ? gameObj.dropDetails : [];
    // Use all dropped cards from this round (dropDetails is cleared each round)
    const remainingDropCards = dropCards;
    const updatedTeamACards = remainingDropCards.concat(
      gameObj.teamACards || []
    );
    const teamAPayload: GameActionResponse =
      Payloads.sendTeamACards(updatedTeamACards);
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

    const dropCards = gameObj && gameObj.dropDetails ? gameObj.dropDetails : [];
    // Use all dropped cards from this round (dropDetails is cleared each round)
    const remainingDropCards = dropCards;
    const updatedTeamBCards = remainingDropCards.concat(
      gameObj.teamBCards || []
    );
    const teamBPayload: GameActionResponse =
      Payloads.sendTeamBCards(updatedTeamBCards);
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
      cb(
        null,
        errorResponse(RESPONSE_CODES.failed, "Game not found or no players")
      );
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
    // console.log("[BOT AGENT] rotateStrike called");
    this.sendCardDropAcceptedNotification(cb);

    // console.log(
    //   "[BOT AGENT] Before updateStrike, currentTurn:",
    //   currentGameIns.gameObj.currentTurn
    // );
    currentGameIns.updateStrike();
    // console.log(
    //   "[BOT AGENT] After updateStrike, currentTurn:",
    //   currentGameIns.gameObj.currentTurn
    // );

    // if (currentGameIns.isRoundOver) {
    //   currentGameIns.droppedCards = [];
    //   currentGameIns.tableCards = [];
    // }

    this.sendDroppedCardsInfo(
      currentGameIns.gameId,
      currentGameIns.droppedCards
    );

    // console.log(
    //   "[BOT AGENT] Before saveGame, currentTurn:",
    //   currentGameIns.gameObj.currentTurn
    // );
    currentGameIns.saveGame();
    // console.log(
    //   "[BOT AGENT] After saveGame, currentTurn:",
    //   currentGameIns.gameObj.currentTurn
    // );

    // Check if all players have dropped their cards
    const gameObj = this.inMemoryStore.fetchGame(currentGameIns.gameId);
    // console.log(
    //   "[BOT AGENT] After fetchGame, currentTurn:",
    //   gameObj.currentTurn
    // );

    const allPlayersDropped =
      gameObj.dropDetails &&
      gameObj.dropDetails.length >= gameObj.players.length;

    // console.log("[BOT AGENT] rotateStrike - round check:", {
    //   gameId: currentGameIns.gameId,
    //   dropDetailsLength: gameObj.dropDetails?.length || 0,
    //   totalPlayers: gameObj.players.length,
    //   allPlayersDropped,
    //   existingTimer: !!this.roundTimers[currentGameIns.gameId],
    // });

    if (allPlayersDropped && !this.roundTimers[currentGameIns.gameId]) {
      // Set a 5-second timer to auto-determine the winner
      // console.log(
      //   "[BOT AGENT] Round completed, setting winner determination timer"
      // );
      this.roundTimers[currentGameIns.gameId] = setTimeout(() => {
        this.autoDetermineRoundWinner(currentGameIns.gameId);
        delete this.roundTimers[currentGameIns.gameId];
      }, 5000);

      // Don't notify turn when round is complete - wait for winner determination
      return;
    }

    // console.log(
    //   "[BOT AGENT] Before notifyTurn, currentTurn:",
    //   gameObj.currentTurn
    // );
    this.notifyTurn(currentGameIns.gameId);
  }

  /**
   * Abort the game
   * @param gameId The game id.
   */
  public abortGame(gameId: string) {
    // Cleanup disconnection timeouts
    if (this.disconnectTimeouts[gameId]) {
      Object.values(this.disconnectTimeouts[gameId]).forEach((timeOut) => {
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

    console.log(`Game ${gameId} aborted and cleanup completed`);
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
    if (
      !gameObj ||
      !gameObj.players ||
      (gameObj.players.length as number) === 0
    )
      return;

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
      trumpCardsInRound = dropCardPlayer.some((cardDetail) => {
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

    // console.log("[BOT AGENT] autoDetermineRoundWinner - winner found:", {
    //   winningPlayerIndex,
    //   winnerTeam,
    //   winningPlayerId: gameObj.players[winningPlayerIndex]?.playerId,
    // });

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
      this.onDeckWonByTeamA({ gameId } as any, () => {});
    } else {
      this.onDeckWonByTeamB({ gameId } as any, () => {});
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

    // Determine score change based on bid range
    let winPoints, losePoints;
    if (finalBid >= 28 && finalBid <= 39) {
      winPoints = 1;
      losePoints = -2;
    } else if (finalBid >= 40 && finalBid <= 47) {
      winPoints = 2;
      losePoints = -3;
    } else if (finalBid >= 48 && finalBid <= 57) {
      winPoints = 3;
      losePoints = -4;
    } else if (finalBid === 56) {
      winPoints = 4;
      losePoints = -5;
    } else {
      // Default fallback for any unexpected bid values
      winPoints = 1;
      losePoints = -2;
    }

    if (biddingTeamAchievedBid) {
      // Bidding team achieved their bid: they get winPoints, other team gets -winPoints
      if (biddingTeam === "A") {
        teamAScoreChange = winPoints;
        teamBScoreChange = -winPoints;
      } else {
        teamBScoreChange = winPoints;
        teamAScoreChange = -winPoints;
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

    // Disable restart protection now the the game is complete
    gameObj.restartProtectionActive = false;
    gameObj.recentlyRestarted = false;

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
      scoreResetOccurred: scoreResetOccurred,
    };

    // Save game state
    this.inMemoryStore.saveGame(gameId, gameObj);

    // Send game completion notification to all players
    const gameCompletePayload: GameActionResponse =
      Payloads.sendGameComplete(gameCompleteData);
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
    // Skip sending cards to bots (fake socket IDs start with "bot-socket-")
    if (socketId.startsWith("bot-socket-")) {
      return;
    }

    const payload = Payloads.sendCards(cards);
    const recieveCards = successResponse(
      RESPONSE_CODES.gameNotification,
      payload
    );

    // Check if socket exists before emitting
    const socket = this.ioServer.sockets.connected[socketId];
    if (socket) {
      socket.emit("data", recieveCards);
    } else {
      console.warn(
        `Socket ${socketId} not found. Player might be disconnected.`
      );
    }
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

    // Check if it's a bot's turn and auto-play
    this.checkAndPlayBotTurn(gameId);
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
    const currentPlayer =
      game.currentTurn !== undefined ? game.players[game.currentTurn] : null;

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
        gameScore: game.gamescore,
        trumpSuit: game.trumpSuit,
        currentTurn: game.currentTurn,
        finalBid: game.finalfid,
        biddingTeam: game.biddingTeam,
        biddingPlayer: game.biddingPlayer,
        isGameComplete: game.isGameComplete,
        teamAScore: game.teamAScore,
        teamBScore: game.teamBScore,
        gamePaused: game.gamePaused,
      },
    };
  }

  /**
   * Refreshes game state for all connected players in a game
   * @param gameld The game id
   */
  private refreshGameStateForAllPlayers(gameId: string): void {
    const game = this.inMemoryStore.fetchGame(gameId);
    if (!game) return;

    const connectedPlayers = game.players.filter(
      (p: IPlayer) => !p.isDisconnected
    );

    connectedPlayers.forEach((player: IPlayer) => {
      // Verify socket still exists before sending data
      const socket = this.ioServer.sockets.connected[player.socketId];
      if (socket) {
        const gameStatePayload = this.buildGameStateForPlayer(game, player);
        const response = successResponse(
          RESPONSE_CODES.gameRefresh,
          gameStatePayload
        );
        this.ioServer.to(player.socketId).emit("data", response);
      } else {
        console.warn(
          `Socket ${player.socketId} not found for ${player.playerId}. Skipping state refresh`
        );
      }
    });
  }

  /**
   * Handle player disconnection gracefully
   * @param gameld The game id
   * @param playerId The player id
   * @param socketId The socket id
   */
  public handlePlayerDisconnection(
    gameId: string,
    playerId: string,
    socketId: string
  ): void {
    const game = this.inMemoryStore.fetchGame(gameId);
    if (!game) {
      console.log(`Game ${gameId} not found for disconnection`);
      return;
    }

    // Check if the game has started (has players array) or is still in lobby (only has gamePlayersInfo)
    if (game.players && game.players.length > 0) {
      // Game has started - handle normal disconnection logic
      const playerIndex = game.players.findIndex(
        (p: IPlayer) => p.playerId === playerId && p.socketId === socketId
      );

      if (playerIndex === -1) {
        console.log(`Player ${playerId} not found in game ${gameId}`);
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

        // First notify about the specific player disconnection
        const disconnectedPayload = Payloads.sendPlayerDisconnected(
          `${playerId} has disconnected from the game`
        );

        const disconnectResponse = successResponse(
          RESPONSE_CODES.gameNotification,
          disconnectedPayload
        );
        this.ioServer.to(gameId).emit("data", disconnectResponse);

        // then notify about the pause
        const pausePayload = Payloads.sendGamePaused(
          `${playerId} disconnected. Game paused. Waiting for reconnection...`
        );

        const pauseResponse = successResponse(
          RESPONSE_CODES.gameNotification,
          pausePayload
        );
        this.ioServer.to(gameId).emit("data", pauseResponse);
      }

      // Set timeout for permanent removal
      this.setDisconnectTimeout(gameId, playerId);
    } else {
      // Game is still in lobby phase - just remove the player from gamePlayersInfo
      console.log(
        `Player ${playerId} disconnected from lobby in game ${gameId}`
      );

      if (game.gamePlayersInfo) {
        const playerIndex = game.gamePlayersInfo.findIndex(
          (p: any) => p.playerId === playerId && p.socketId === socketId
        );

        if (playerIndex !== -1) {
          game.gamePlayersInfo.splice(playerIndex, 1);
          console.log(
            `Removed player ${playerId} from lobby. Players remaining: ${game.gamePlayersInfo.length}`
          );
        }
      }
    }

    // Save updated game
    this.inMemoryStore.saveGame(gameId, game);

    console.log(`${playerId} marked as disconnected in game ${gameId}`);
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
      `Disconnect timeout set for ${playerId} in game ${gameId} (${
        this.DISCONNECT_TIMEOUT_MS / 1000
      }s)`
    );
  }

  /**
   * Handle permanent player removal after timeout
   * @param gameId The game id
   * @param playerId The player id
   * */
  private handlePermanentPlayerRemoval(gameId: string, playerId: string): void {
    console.log(`Permanently removing ${playerId} from game ${gameId}`);

    const game = this.inMemoryStore.fetchGame(gameId);

    if (!game) return;

    // Remove from disconnected players
    if (game.disconnectedPlayers && game.disconnectedPlayers[playerId]) {
      delete game.disconnectedPlayers[playerId];
    }

    // Clean up timeout
    if (
      this.disconnectTimeouts[gameId] &&
      this.disconnectTimeouts[gameId][playerId]
    ) {
      delete this.disconnectTimeouts[gameId][playerId];
    }

    // Check if game should be aborted
    const totalConnectedPlayers = game.players.filter(
      (p: IPlayer) => p.isDisconnected
    ).length;
    const totalDisconnectedPlayers = Object.keys(
      game.disconnectedPlayers || {}
    ).length;

    if (totalConnectedPlayers + totalDisconnectedPlayers < 3) {
      // Minimum players needed
      // Not enough players to continue abort game
      this.abortGame(gameId);
    } else {
      //Notify remaining players
      const removalPayload = Payloads.sendGameAborted(
        `${playerId} has been removed due to prolonged disconnection.`
      );

      const removalResponse = successResponse(
        RESPONSE_CODES.gameNotification,
        removalPayload
      );
      this.ioServer.to(gameId).emit("data", removalResponse);

      this.inMemoryStore.saveGame(gameId, game);
    }
  }

  /**
   * Add bot players to reach the minimum player count
   * @param humanPlayerCount Number of human players
   * @returns Array of bot players to add
   */
  public addBotPlayers(humanPlayerCount: number): IPlayer[] {
    const botsNeeded = MAX_PLAYERS - humanPlayerCount;
    const botPlayers: IPlayer[] = [];

    for (let i = 0; i < botsNeeded; i++) {
      const botPlayer: IPlayer = {
        socketId: `bot-socket-${getUniqueId()}`, // Fake socket ID for bots
        playerId: `Bot_${i + 1}`,
        token: getUniqueId(),
        gameId: this.currentGameId,
        isBotAgent: true,
      };
      botPlayers.push(botPlayer);
    }

    return botPlayers;
  }

  /**
   * Handle bot turn with 1-second delay to simulate human behavior
   * @param gameId The game ID
   * @param botPlayerId The bot player ID
   */
  public async playBotAgentTurn(
    gameId: string,
    botPlayerId: string
  ): Promise<void> {
    try {
      const game = this.inMemoryStore.fetchGame(gameId);
      if (!game) {
        console.error(`[BOT AGENT] Game ${gameId} not found`);
        return;
      }

      // Find the bot player to get their token
      const botPlayer = game.players.find((p) => p.playerId === botPlayerId);
      if (!botPlayer || !botPlayer.token) {
        // console.error(
        //   `[BOT AGENT] Bot player ${botPlayerId} not found or missing token`
        // );
        return;
      }

      const agent = new TeamBotAgent();
      const card = agent.decide(game, botPlayer.token, botPlayerId);

      // console.log("[BOT AGENT]", {
      //   botAgentId: botPlayerId,
      //   botToken: botPlayer.token,
      //   card,
      //   gameId,
      // });

      // Simulate human delay (1 second)
      const botTimer = setTimeout(() => {
        this.handleBotCardPlay(gameId, botPlayerId, card);
        // Clean up timer
        if (this.botTimers[gameId]) {
          delete this.botTimers[gameId];
        }
      }, 1);

      // Store timer for cleanup if needed
      this.botTimers[gameId] = botTimer;
    } catch (error) {
      console.error(`[BOT AGENT] Error in bot turn for ${botPlayerId}:`, error);
    }
  }

  /**
   * Handle bot card play by reusing existing validation logic
   * @param gameId The game ID
   * @param botPlayerId The bot player ID
   * @param card The card to play
   */
  private handleBotCardPlay(
    gameId: string,
    botPlayerId: string,
    card: string
  ): void {
    const game = this.inMemoryStore.fetchGame(gameId);
    if (!game) {
      console.error(`[BOT AGENT] Game ${gameId} not found during card play`);
      return;
    }

    const botPlayer = game.players.find(
      (p) => p.playerId === botPlayerId && p.isBotAgent
    );
    if (!botPlayer) {
      console.error(`[BOT AGENT] Bot player ${botPlayerId} not found`);
      return;
    }

    // Create drop card request payload
    const dropCardRequest: DropCardRequestPayload = {
      card,
      gameId,
      token: botPlayer.token,
      playerId: botPlayerId,
    };

    // Reuse existing validation path
    // console.log(
    //   `[BOT AGENT] Calling onDropCard for ${botPlayerId} with card ${card}`
    // );
    this.onDropCard(dropCardRequest, (error: any, result: any) => {
      // console.log(`[BOT AGENT] onDropCard callback for ${botPlayerId}:`, {
      //   error,
      //   result,
      // });
      if (error) {
        console.error(
          `[BOT AGENT] Error playing card for ${botPlayerId}:`,
          error
        );
      } else {
        // console.log(
        //   `[BOT AGENT] Successfully played ${card} for ${botPlayerId}`
        // );

        // Log game state after bot plays
        const gameAfterPlay = this.inMemoryStore.fetchGame(gameId);
        // console.log("[BOT AGENT] Game state after bot play:", {
        //   currentTurn: gameAfterPlay?.currentTurn,
        //   nextPlayerId:
        //     gameAfterPlay?.players[gameAfterPlay?.currentTurn]?.playerId,
        //   isNextPlayerBot:
        //     gameAfterPlay?.players[gameAfterPlay?.currentTurn]?.isBotAgent,
        //   droppedCardsCount: gameAfterPlay?.droppedCards?.length || 0,
        //   dropDetailsCount: gameAfterPlay?.dropDetails?.length || 0,
        // });
      }
    });
  }

  /**
   * Check if it's a bot's turn and auto-play if needed
   * @param gameId The game ID
   */
  public checkAndPlayBotTurn(gameId: string): void {
    const game = this.inMemoryStore.fetchGame(gameId);
    if (!game || game.currentTurn === undefined) return;

    const currentPlayer = game.players[game.currentTurn];
    // console.log("[BOT AGENT] Checking turn:", {
    //   gameId,
    //   currentTurn: game.currentTurn,
    //   currentPlayerId: currentPlayer?.playerId,
    //   isBot: currentPlayer?.isBotAgent,
    //   totalPlayers: game.players.length,
    // });

    if (currentPlayer && currentPlayer.isBotAgent) {
      // console.log(
      //   "[BOT AGENT] Bot turn detected, scheduling play for:",
      //   currentPlayer.playerId
      // );
      // Give a small delay to let the UI update first
      // Store the timer so it can be cleared on restart
      this.botTimers[gameId] = setTimeout(() => {
        this.playBotAgentTurn(gameId, currentPlayer.playerId);
      }, 500);
    }
  }
}
