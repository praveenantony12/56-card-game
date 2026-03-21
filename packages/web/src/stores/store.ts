import * as common from "@rcg/common";
import { computed, observable, ObservableMap } from "mobx";
import { persist } from "mobx-persist";

import GameService from "../services/GameService";
import { IStore } from "./IStore";
import { IGame } from "./models/IGameInfo";
import { IUser } from "./models/IUserInfo";

class Store implements IStore {
  @persist("object")
  @observable
  private gameInfo: IGame = {};

  @persist("object")
  @observable
  private userInfo: IUser = {};

  private gameService: GameService;
  @observable private isReconnecting: boolean = false;

  constructor() {
    this.gameService = new GameService(
      this.subscribeToNotifications,
      this.subscribeToBotReasoning,
    );
    this.initializeStore();
    // Check URL parameters for game ID to join
    this.checkAndApplyUrlParameters();
    // Attempt automatic reconnection after initialization
    this.attemptAutoReconnection();
  }

  private async attemptAutoReconnection() {
    // Give some time for mobx-persist to restore the persisted data
    setTimeout(async () => {
      if (
        this.userInfo.token &&
        this.userInfo.gameId &&
        this.userInfo.playerId &&
        !this.userInfo.isSignedIn
      ) {
        this.isReconnecting = true;
        try {
          await this.reconnect();
        } catch (error) {
          // Clear stale session data
          this.initializeStore();
        } finally {
          this.isReconnecting = false;
        }
      }
    }, 1000);
  }

  /**
   * Check URL parameters for game ID and apply them to the store
   * Allows direct joining via URL like: ?gameId=abc123
   */
  private checkAndApplyUrlParameters() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const gameIdFromUrl = urlParams.get("gameId");

      if (gameIdFromUrl && gameIdFromUrl.trim()) {
        console.log("[STORE] Game ID found in URL:", gameIdFromUrl);
        this.setGameModeJoin(gameIdFromUrl.trim());
      }
    } catch (error) {
      console.error("[STORE] Error parsing URL parameters:", error);
    }
  }

  @computed
  public get user() {
    return this.userInfo;
  }

  @computed
  public get game() {
    return this.gameInfo;
  }

  @computed
  public get isAttemptingReconnection() {
    return this.isReconnecting;
  }

  @computed
  public get isPendingReconnectionApproval() {
    return this.gameInfo.isPendingReconnection || false;
  }

  public async ping() {
    try {
      await this.gameService.ping();
      this.gameInfo.isConnected = true;
    } catch (error) {
      this.gameInfo.error = error;
    }
  }

  public async signIn(userId: string) {
    this.clearNotifications();

    // Check if we have existing session data and should reconnect instead
    if (this.userInfo.token && this.userInfo.gameId && this.userInfo.playerId) {
      try {
        await this.reconnect();
        return; // Successfully reconnected
      } catch (error) {
        // Clear existing session data and proceed with fresh login
        this.initializeStore();
      }
    }

    try {
      // For joining existing games, pass the game ID to the player
      // Spectator mode uses the same login flow but with a different game mode
      const gameIdParam =
        this.gameInfo.gameMode === "join" || this.gameInfo.gameMode === "view"
          ? this.gameInfo.gameIdToJoin
          : undefined;
      const userInfo = await this.gameService.signIn(userId, gameIdParam);

      this.userInfo = userInfo;
      this.userInfo.isSignedIn = true;

      // Handle spectator (viewer) login - server returns isSpectator: true
      if (userInfo.isSpectator) {
        this.userInfo.isSpectator = true;
        this.userInfo.gameId = userInfo.gameId;
        this.userInfo.playerId = userInfo.playerId;

        // Populate game state from spectator game state payload
        if (userInfo.gameState) {
          const gs = userInfo.gameState;
          this.gameInfo = {
            ...this.gameInfo,
            players: gs.players || [],
            currentPlayerId: gs.currentPlayerId,
            startingPlayerId: gs.startingPlayerId,
            droppedCards: gs.droppedCards || [],
            dropCardPlayer: gs.dropCardPlayer || [],
            teamACards: gs.teamACards || [],
            teamBCards: gs.teamBCards || [],
            currentBet: gs.currentBet,
            trumpSuit: gs.trumpSuit,
            finalBid: gs.finalBid,
            biddingTeam: gs.biddingTeam,
            biddingPlayer: gs.biddingPlayer,
            isGameComplete: gs.isGameComplete || false,
            teamAScore: gs.teamAScore,
            teamBScore: gs.teamBScore,
            isBiddingPhase: gs.isBiddingPhase || false,
            currentBiddingPlayerId: gs.currentBiddingPlayerId,
            bidHistory: gs.bidHistory || [],
            bidPassCount: gs.bidPassCount || 0,
            bidDouble: gs.bidDouble || false,
            bidReDouble: gs.bidReDouble || false,
            bidRaisePhase: gs.bidRaisePhase || false,
            bidRaiseOfferedTo: gs.bidRaiseOfferedTo,
            postRaiseDoubleRound: gs.postRaiseDoubleRound || false,
            teamAPositionSwitchUsed: gs.teamAPositionSwitchUsed || false,
            teamBPositionSwitchUsed: gs.teamBPositionSwitchUsed || false,
            canStartGame: true,
            showBotSelection: false,
          };
        }
        return;
      }

      // Handle game creator status and shared game ID from the direct response
      if (userInfo.isGameCreator !== undefined) {
        this.gameInfo.isGameCreator = userInfo.isGameCreator;
        if (userInfo.isGameCreator && userInfo.gameId) {
          this.gameInfo.sharedGameId = userInfo.gameId;
          this.gameInfo.showBotSelection = true;
        } else {
          this.gameInfo.showBotSelection = false;
        }
      } else {
        // Fallback: Only show bot seleciton for game creators (old logic)
        if (this.gameInfo.isGameCreator) {
          this.gameInfo.showBotSelection = true;
        }
      }
    } catch (error) {
      // Convert error object to string if necessary
      const errorMessage =
        typeof error === "string"
          ? error
          : (error as any)?.message ||
            JSON.stringify(error) ||
            "Unknown sign in error";
      this.gameInfo.error = errorMessage;
    }
  }

  public async reconnect() {
    if (
      !this.userInfo.token ||
      !this.userInfo.gameId ||
      !this.userInfo.playerId
    ) {
      throw new Error("Missing session data for reconnection");
    }

    this.clearNotifications();

    try {
      const response = await this.gameService.reconnect(
        this.userInfo.playerId,
        this.userInfo.token,
        this.userInfo.gameId,
      );

      // Check if this is a pending approval response
      if (response && response.code === "RECONNECT_PENDING_APPROVAL") {
        this.gameInfo.notification =
          response.payload?.message ||
          "Reconnection request sent to other players for approval";
        this.gameInfo.isPendingReconnection = true;
        return; // Don't mark as signed in yet
      }

      // Check if this is a successful reconnection
      if (response && response.code === "RECONNECT_SUCCESS") {
        this.userInfo = { ...this.userInfo, ...response.payload };
        this.userInfo.isSignedIn = true;
        this.gameInfo.isPendingReconnection = false;
        return;
      }

      // Update with fresh data from server for successful connection
      this.userInfo = { ...this.userInfo, ...response };
      this.userInfo.isSignedIn = true;
      this.gameInfo.isPendingReconnection = false;
    } catch (error) {
      // Convert error object to string if necessary
      const errorMessage =
        typeof error === "string"
          ? error
          : (error as any)?.message ||
            JSON.stringify(error) ||
            "Unknown sign in error";
      this.gameInfo.error = errorMessage;
      throw new Error(errorMessage);
    }
  }

  public async approveReconnection(playerId: string): Promise<void> {
    try {
      await this.gameService.approveReconnection(
        this.userInfo.gameId as string,
        playerId,
        this.userInfo.playerId as string,
      );
    } catch (error) {
      const errorMessage =
        typeof error === "string"
          ? error
          : (error as any)?.message || "Failed to approve reconnection";
      this.gameInfo.error = errorMessage;
    }
  }

  public async denyReconnection(playerId: string): Promise<void> {
    try {
      await this.gameService.denyReconnection(
        this.userInfo.gameId as string,
        playerId,
        this.userInfo.playerId as string,
      );
    } catch (error) {
      const errorMessage =
        typeof error === "string"
          ? error
          : (error as any)?.message || "Failed to deny reconnection";
      this.gameInfo.error = errorMessage;
    }
  }

  public async addBots(botCount: number, startImmediately?: boolean) {
    const { gameId } = this.userInfo;
    this.clearNotifications();
    try {
      const response: common.SuccessResponse = await this.gameService.addBots(
        botCount,
        gameId as string,
        startImmediately,
      );

      if (response.code === common.RESPONSE_CODES.loginSuccess) {
        // Bot selection successful, hide the selection UI
        this.gameInfo.showBotSelection = false;
        this.gameInfo.notification =
          response.payload?.message ||
          `Game started with ${botCount} bot players`;
      }
    } catch (error) {
      const errorMessage =
        typeof error === "string"
          ? error
          : (error as any)?.message ||
            JSON.stringify(error) ||
            "Failed to add bots";
      this.gameInfo.error = errorMessage;
    }
  }

  public async dropCard(card: string) {
    const { gameId, token, playerId } = this.userInfo;
    this.clearNotifications();

    try {
      const ack: common.SuccessResponse = await this.gameService.dropCard(
        card,
        gameId as string,
        token as string,
        playerId as string,
      );
      if (ack.code === common.RESPONSE_CODES.success) {
        try {
          this.gameInfo.cards = (this.gameInfo.cards || []).filter(
            (x) => x !== card,
          );
        } catch (err) {
          console.log("Error caught while removing child node == > " + err);
        }
      }
    } catch (error) {
      console.log("error ===> " + error);
      this.game.error = JSON.stringify(error);
    }
  }

  public async dropCardPlayer(dropCardPlayer: string[]) {
    // const { gameId, token, playerId } = this.userInfo;
    this.clearNotifications();

    try {
      const ack: common.SuccessResponse =
        await this.gameService.dropCardPlayer(dropCardPlayer);
      if (ack.code === common.RESPONSE_CODES.success) {
        console.log(
          "this.gameInfo.dropCardPlayer ===> " + this.gameInfo.dropCardPlayer,
        );
      }
    } catch (error) {
      console.log("error ===> " + error);
      this.game.error = JSON.stringify(error);
    }
  }

  public async deckWonByTeamA() {
    const { gameId } = this.userInfo;
    this.clearNotifications();

    try {
      const ack: common.SuccessResponse = await this.gameService.deckWonByTeamA(
        gameId as string,
      );

      if (ack.code === common.RESPONSE_CODES.success) {
        // this.gameInfo.teamACards = (this.gameInfo.teamACards || []).filter(
        //   x => x !== cards
        // );
        console.log(
          "this.gameInfo.teamACards ===> " + this.gameInfo.teamACards,
        );
      }
    } catch (error) {
      console.log("error ===> " + error);
      this.game.error = JSON.stringify(error);
    }
  }

  public async deckWonByTeamB() {
    const { gameId } = this.userInfo;
    this.clearNotifications();

    try {
      const ack: common.SuccessResponse = await this.gameService.deckWonByTeamB(
        gameId as string,
      );

      if (ack.code === common.RESPONSE_CODES.success) {
        // this.gameInfo.teamACards = (this.gameInfo.teamACards || []).filter(
        //   x => x !== cards
        // );
        console.log(
          "this.gameInfo.teamBCards ===> " + this.gameInfo.teamBCards,
        );
      }
    } catch (error) {
      console.log("error ===> " + error);
      this.game.error = JSON.stringify(error);
    }
  }

  public async restartGame(gameId: string) {
    // const { gameId } = this.userInfo;
    this.clearNotifications();

    // Reset bidding-related state on restart to prevent persistence from previous game
    this.gameInfo.isBiddingPhase = false;
    this.gameInfo.currentBiddingPlayerId = undefined;
    this.gameInfo.bidHistory = [];
    this.gameInfo.bidPassCount = 0;
    this.gameInfo.bidDouble = false;
    this.gameInfo.bidReDouble = false;
    this.gameInfo.finalBid = undefined;
    this.gameInfo.biddingPlayer = undefined;
    this.gameInfo.biddingTeam = undefined;
    this.gameInfo.currentBet = "27";

    try {
      const ack: common.SuccessResponse =
        await this.gameService.restartGame(gameId);
      if (ack.code === common.RESPONSE_CODES.success) {
        console.log("this.gameInfo.gameId ===> " + this.userInfo.gameId);
      }
    } catch (error) {
      console.log("error ===> " + error);
      this.game.error = JSON.stringify(error);
    }
  }

  public async forfeitGame(gameId: string) {
    this.clearNotifications();

    try {
      const ack: common.SuccessResponse = await this.gameService.forfeitGame(
        gameId,
        this.userInfo.playerId as string,
      );
      if (ack.code === common.RESPONSE_CODES.success) {
        console.log("Forfeit request initiated");
        // Show waiting notification to the player who initiated forfeit
        this.gameInfo.notification = {
          action: "FORFEIT_WAITING",
          data: {
            message:
              "Forfeit request sent to your teammates. Waiting for their approval...",
          },
        };
      }
    } catch (error) {
      console.log("error ===> " + error);
      this.game.error = JSON.stringify(error);
    }
  }

  public async approveForfeit() {
    const gameId = this.userInfo.gameId as string;
    const playerId = this.userInfo.playerId as string;
    this.clearNotifications();

    try {
      const ack: common.SuccessResponse = await this.gameService.forfeitGame(
        gameId,
        playerId,
      );
      if (ack.code === common.RESPONSE_CODES.success) {
        console.log("Forfeit approved");
      }
    } catch (error) {
      console.log("error ===> " + error);
      this.game.error = JSON.stringify(error);
    }
  }

  public async denyForfeit() {
    // For now, we just clear the notification
    // In a more advanced implementation, we could add an explicit deny action
    this.clearNotifications();
  }

  public async selectPlayer(playerId: string) {
    const { gameId, token } = this.userInfo;
    this.clearNotifications();

    try {
      const ack: common.SuccessResponse = await this.gameService.selectPlayer(
        playerId,
        gameId as string,
        token as string,
      );

      if (ack.code === common.RESPONSE_CODES.success) {
        console.log(
          "this.gameInfo.currentPlayerId ===> " + this.gameInfo.currentPlayerId,
        );
      }
    } catch (error) {
      console.log("error ===> " + error);
      this.game.error = JSON.stringify(error);
    }
  }

  public async incrementBetByPlayer(playerBet: string) {
    const { gameId, token } = this.userInfo;
    this.clearNotifications();
    try {
      const ack: common.SuccessResponse =
        await this.gameService.incrementBetByPlayer(
          playerBet,
          gameId as string,
          token as string,
        );

      if (ack.code === common.RESPONSE_CODES.success) {
        console.log("this.gameInfo.playerBet ===> " + this.gameInfo.currentBet);
      }
    } catch (error) {
      console.log("error ===> " + error);
      this.game.error = JSON.stringify(error);
    }
  }

  public async selectTrumpSuit(trumpSuit: string) {
    const { gameId, token, playerId } = this.userInfo;
    this.clearNotifications();

    try {
      const ack: common.SuccessResponse =
        await this.gameService.selectTrumpSuit(
          trumpSuit,
          gameId as string,
          token as string,
          playerId as string,
        );

      if (ack.code === common.RESPONSE_CODES.success) {
        console.log("Trump suit selected: " + trumpSuit);
      }
    } catch (error) {
      console.log("error ===> " + error);
      this.game.error = JSON.stringify(error);
    }
  }

  public async biddingAction(
    action: "bid" | "pass" | "double" | "re-double",
    bidValue?: number,
    suit?: string,
    bidSelectionType?: "direct" | "modifier" | null,
    bidModifier?: number,
    clickOrder?: "bidFirst" | "suitFirst" | null,
    noTrumpType?: "Noes" | "Pass" | "No-Trump" | null,
  ) {
    const { gameId, token } = this.userInfo;
    this.clearNotifications();

    try {
      const ack: common.SuccessResponse = await this.gameService.biddingAction(
        action,
        gameId as string,
        token as string,
        bidValue,
        suit,
        bidSelectionType,
        bidModifier,
        clickOrder,
        noTrumpType,
      );

      if (ack.code === common.RESPONSE_CODES.success) {
        console.log(`Bidding action performed: ${action}`);
      }
    } catch (error) {
      console.log("error ===> " + error);
      this.game.error = JSON.stringify(error);
    }
  }

  public async raiseBid(newBidValue: number) {
    const { gameId, token } = this.userInfo;
    this.clearNotifications();

    try {
      const ack: common.SuccessResponse = await this.gameService.biddingAction(
        "raise-bid" as any,
        gameId as string,
        token as string,
        newBidValue,
        undefined, // suit is kept the same
      );

      if (ack.code === common.RESPONSE_CODES.success) {
        console.log(`Bid raised to: ${newBidValue}`);
      }
    } catch (error) {
      console.log("error ===> " + error);
      this.game.error = JSON.stringify(error);
    }
  }

  public async skipRaise() {
    const { gameId, token } = this.userInfo;
    this.clearNotifications();

    try {
      const ack: common.SuccessResponse = await this.gameService.biddingAction(
        "skip-raise" as any,
        gameId as string,
        token as string,
      );

      if (ack.code === common.RESPONSE_CODES.success) {
        console.log(`Bid raise skipped`);
      }
    } catch (error) {
      console.log("error ===> " + error);
      this.game.error = JSON.stringify(error);
    }
  }

  public async updateGameScore(gameScore: string) {
    const { gameId, token } = this.userInfo;
    this.clearNotifications();
    try {
      const ack: common.SuccessResponse =
        await this.gameService.updateGameScore(
          gameScore,
          gameId as string,
          token as string,
        );

      if (ack.code === common.RESPONSE_CODES.success) {
        console.log("this.gameInfo.gameScore ===> " + this.gameInfo.gameScore);
      }
    } catch (error) {
      console.log("error ===> " + error);
      this.game.error = JSON.stringify(error);
    }
  }

  public leaveGame() {
    this.gameService.leaveGame();
    this.initializeStore();
  }

  public clearNotifications() {
    this.gameInfo.error = "";
    this.gameInfo.notification = "";
  }

  public hideBotSelection(): void {
    this.gameInfo.showBotSelection = false;
  }

  private initializeStore() {
    this.gameInfo = {
      isGameComplete: false,
      teamAScore: undefined,
      teamBScore: undefined,
      winnerMessage: undefined,
      gameCompleteData: undefined,
      finalBid: undefined,
      biddingTeam: undefined,
      biddingPlayer: undefined,
      isBiddingPhase: true,
      currentBiddingPlayerId: undefined,
      bidHistory: [],
      bidPassCount: 0,
      lastBiddingTeam: undefined,
      bidDouble: false,
      bidReDouble: false,
      showBotSelection: false,
      gameMode: null,
      gameIdToJoin: undefined,
      isGameCreator: false,
      sharedGameId: undefined,
      showGameModeSelection: true,
    };
    this.userInfo = {};
    this.userInfo.isSignedIn = false;
  }

  private subscribeToBotReasoning = (data: any) => {
    this.gameInfo.botReasoning = { ...data, ts: Date.now() };
  };

  private subscribeToNotifications = (
    response: common.SuccessResponse | common.ErrorResponse,
  ) => {
    const error = (response as common.ErrorResponse).message;

    if (error) {
      this.gameInfo.error = error;
      return;
    }

    // Handle special response codes that don't go through action based routing
    const responseCode = (response as common.SuccessResponse).code;
    console.log("[STORE] Response Code:", responseCode);

    if (
      responseCode === "RESPONSE_SUCCESS" ||
      responseCode === "RECONNECT_SUCCESS" ||
      responseCode === "LOGIN_SUCCESS"
    ) {
      const payload = (response as common.SuccessResponse).payload;
      console.log("[STORE] Login response payload:", payload);

      // Update user info from payload
      this.userInfo = {
        ...this.userInfo,
        ...(response as common.SuccessResponse).payload,
      };
      this.userInfo.isSignedIn = true;
      this.gameInfo.isPendingReconnection = false;

      // Handle game creator status and shared game ID
      if (payload.isGameCreator !== undefined) {
        (this, (this.gameInfo.isGameCreator = payload.isGameCreator));
        if (payload.isGameCreator && payload.gameId) {
          this.gameInfo.sharedGameId = payload.gameId;
          // Show bot selection for game creators
          this.gameInfo.showBotSelection = true;
          console.log(
            `[STORE] Game Creator set up - Game ID: ${payload.gameId}, showing bot selection`,
          );
        } else {
          // Joiners wait for the creator to start the game
          this.gameInfo.showBotSelection = false;
          console.log("[STORE] Game joiner setup - waiting for creator");
        }
      } else {
        console.log(
          "[STORE] No isGameCreator in payload, payload keys:",
          Object.keys(payload),
        );
      }

      // Extract nested game state and update gameInfo
      if (payload && payload.gameState) {
        const gameState = payload.gameState;
        this.gameInfo = {
          ...this.gameInfo,
          players: gameState.players || [],
          currentPlayerId: gameState.currentPlayerId, // include current player Id
          startingPlayerId: gameState.startingPlayerId,
          droppedCards: gameState.droppedCards || [],
          dropCardPlayer: gameState.dropCardPlayer || [],
          teamACards: gameState.teamACards || [],
          teamBCards: gameState.teamBCards || [],
          currentBet: gameState.currentBet,
          currentBetPlayerId: gameState.currentBetPlayerId,
          gameScore: gameState.gameScore || {},
          trumpSuit: gameState.trumpSuit,
          currentTurn: gameState.currentTurn,
          finalBid: gameState.finalBid,
          biddingTeam: gameState.biddingTeam,
          biddingPlayer: gameState.biddingPlayer,
          isGameComplete: gameState.isGameComplete || false,
          teamAScore: gameState.teamAScore || 0,
          teamBScore: gameState.teamBScore || 0,
          gamePaused: gameState.gamePaused || false,
          // Bidding phase state - ensure these are set during reconnection
          isBiddingPhase: gameState.isBiddingPhase || false,
          currentBiddingPlayerId: gameState.currentBiddingPlayerId,
          bidHistory: gameState.bidHistory || [],
          bidPassCount: gameState.bidPassCount || 0,
          lastBiddingTeam: gameState.lastBiddingTeam,
          bidDouble: gameState.bidDouble || false,
          bidReDouble: gameState.bidReDouble || false,
        };
      }

      // Set canStartGame if we have cards (indicating the game is in progress)
      if (payload && payload.cards) {
        this.gameInfo.cards = payload.cards;
        this.gameInfo.canStartGame = true;
        this.gameInfo.showBotSelection = false; // Hide bot selection when game starts
      }

      // Update yourTurn based on bidding phase or current turn
      if (
        this.gameInfo.isBiddingPhase &&
        this.gameInfo.currentBiddingPlayerId
      ) {
        this.gameInfo.yourTurn =
          this.userInfo.playerId === this.gameInfo.currentBiddingPlayerId;
      } else if (this.gameInfo.currentPlayerId) {
        this.gameInfo.yourTurn =
          this.userInfo.playerId === this.gameInfo.currentPlayerId;
      }

      return;
    }

    const payload = (response as common.SuccessResponse).payload || {};
    const { action = "", data = {} } = payload as common.GameActionResponse;

    switch (action) {
      case common.MESSAGES.gameOver:
        this.initializeStore();
        this.gameInfo.gameOver = true;
        const winnerId = (data as common.IGameOver).winnerId;
        this.gameInfo.notification = `Game over, the Winner is ${winnerId}`;
        break;

      case common.MESSAGES.turnInfo:
        this.gameInfo.currentPlayerId = (
          data as common.INotifyTurn
        ).currentPlayerId;
        this.gameInfo.yourTurn =
          this.userInfo.playerId === this.gameInfo.currentPlayerId;
        break;

      case common.MESSAGES.cards:
        try {
          this.gameInfo.cards = (data as common.ICards).cards;
        } catch (err) {
          console.log("ERROR");
        }
        this.gameInfo.canStartGame = true;
        this.gameInfo.showBotSelection = false; // Hide bot selection when game starts
        break;

      case common.MESSAGES.droppedCards:
        this.gameInfo.droppedCards = (data as common.IDroppedCards).cards;
        break;

      case common.MESSAGES.incrementBetByPlayer:
        this.gameInfo.currentBet = (data as common.IPlayerBet).playerBet;
        this.gameInfo.currentBetPlayerId = (data as common.IPlayerBet).playerId;
        break;

      case common.MESSAGES.updateGameScore:
        this.gameInfo.gameScore = (data as common.IGameScore).gameScore;
        break;

      case common.MESSAGES.dropCardPlayer:
        this.gameInfo.dropCardPlayer = (
          data as common.IDropCardPlayer
        ).dropCardPlayer;
        break;

      case common.MESSAGES.teamACards:
        this.gameInfo.teamACards = (data as common.ITeamACards).cards;
        break;

      case common.MESSAGES.teamBCards:
        this.gameInfo.teamBCards = (data as common.ITeamBCards).cards;
        break;

      case common.MESSAGES.penality:
        const cards = (data as common.IPenality).cards;
        if (cards.length > 0) {
          this.gameInfo.cards = (this.gameInfo.cards as string[]).concat(cards);
        } else {
          this.gameInfo.cards = cards;
        }
        break;

      case common.MESSAGES.playerInfo:
        this.gameInfo.players = (data as common.IPlayers).players;
        break;

      case common.MESSAGES.trumpSuitSelected:
        this.gameInfo.playerTrumpSuit = (
          data as common.ITrumpSuitSelected
        ).playerTrumpSuit;
        this.gameInfo.trumpSuit = (data as common.ITrumpSuitSelected).trumpSuit;
        break;

      case common.MESSAGES.gameAborted:
        this.initializeStore();
        this.gameInfo.notification =
          (data as common.IGameAborted).reason ||
          "Something went wrong. Please try again!";
        break;

      case "reconnection_request":
        // Handle reconnection request notificaiton
        this.gameInfo.notification = {
          action: "reconnection_request",
          data: data,
        };
        break;

      case "player_reconnected":
        // Handle player reconnected notificaiton
        const reconnectedPlayerData = data as any;
        this.gameInfo.notification = `${reconnectedPlayerData.playerName} has reconnected to the game`;
        break;

      case common.MESSAGES.playerReconnected:
        // Handle player reconnected notificaiton from server
        const playerReconnectedData = data as any;
        this.gameInfo.notification =
          playerReconnectedData.message ||
          "A player has successfully reconnected to the game";
        break;

      case common.MESSAGES.gamePaused:
        // Handle game paused notification (when a player disconnects)
        const pausedData = data as any;
        this.gameInfo.notification =
          pausedData.message ||
          "Game has been paused due to player disconnection";
        this.gameInfo.gamePaused = true;
        break;

      case common.MESSAGES.gameResumed:
        // Handle game resumed notification (when all players are back)
        const resumeData = data as any;
        this.gameInfo.notification =
          resumeData.message || "Game has been resumed";
        this.gameInfo.gamePaused = true;
        break;

      case common.MESSAGES.playerDisconnected:
        // Handle player disconnection notificaiton
        const disconnectionData = data as any;
        this.gameInfo.notification =
          disconnectionData.message || "A player has disconnected";
        this.gameInfo.gamePaused = true;
        break;

      case common.MESSAGES.gameComplete:
        const gameCompleteData = data as common.IGameComplete;
        this.gameInfo.isGameComplete = gameCompleteData.isGameComplete;
        this.gameInfo.finalBid = gameCompleteData.finalBid;
        this.gameInfo.biddingTeam = gameCompleteData.biddingTeam;
        this.gameInfo.winnerMessage = gameCompleteData.winnerMessage;
        this.gameInfo.gameCompleteData = {
          biddingTeamAchievedBid: gameCompleteData.biddingTeamAchievedBid,
          teamAPoints: gameCompleteData.teamAPoints,
          teamBPoints: gameCompleteData.teamBPoints,
          teamAScore: gameCompleteData.teamAScore,
          teamBScore: gameCompleteData.teamBScore,
          scoreResetOccurred: gameCompleteData.scoreResetOccurred,
        };
        // Update the team scores
        this.gameInfo.teamAScore = gameCompleteData.teamAScore;
        this.gameInfo.teamBScore = gameCompleteData.teamBScore;
        // Clear bid raise phase state
        this.gameInfo.bidRaisePhase = false;
        this.gameInfo.bidRaiseOfferedTo = undefined;
        this.gameInfo.postRaiseDoubleRound = false;
        this.gameInfo.postRaiseDoubleCount = 0;
        break;

      case common.MESSAGES.teamScores:
        const teamScores = data as common.ITeamScores;
        this.gameInfo.teamAScore = teamScores.teamAScore;
        this.gameInfo.teamBScore = teamScores.teamBScore;
        break;

      case "biddingPhaseStart":
        // Bidding phase has started
        const biddingStartData = data as any;
        this.gameInfo.isBiddingPhase = true;
        this.gameInfo.currentBiddingPlayerId =
          biddingStartData.currentBiddingPlayerId;
        this.gameInfo.startingPlayerId = biddingStartData.startingPlayerId;
        this.gameInfo.bidHistory = [];
        this.gameInfo.bidPassCount = 0;
        // Clear bid raise phase state
        this.gameInfo.bidRaisePhase = false;
        this.gameInfo.bidRaiseOfferedTo = undefined;
        this.gameInfo.postRaiseDoubleRound = false;
        this.gameInfo.postRaiseDoubleCount = 0;
        break;

      case "biddingAction":
        // Update bidding state after an action
        const biddingActionData = data as any;
        this.gameInfo.currentBiddingPlayerId =
          biddingActionData.currentBiddingPlayerId;
        this.gameInfo.bidHistory = biddingActionData.bidHistory || [];
        this.gameInfo.bidPassCount = biddingActionData.bidPassCount || 0;
        this.gameInfo.currentBet = biddingActionData.currentBet;
        this.gameInfo.trumpSuit = biddingActionData.trumpSuit;
        this.gameInfo.lastBiddingTeam = biddingActionData.lastBiddingTeam;
        this.gameInfo.bidDouble = biddingActionData.bidDouble || false;
        this.gameInfo.bidReDouble = biddingActionData.bidReDouble || false;
        this.gameInfo.postRaiseDoubleRound =
          biddingActionData.postRaiseDoubleRound || false;
        this.gameInfo.postRaiseDoubleCount =
          biddingActionData.postRaiseDoubleCount || 0;
        break;

      case "bidRaisePhase":
        // Bid raise phase started - player can chose to raise or skip
        const bidRaiseData = data as any;
        this.gameInfo.bidRaisePhase = true;
        this.gameInfo.bidRaiseOfferedTo = bidRaiseData.bidRaiseOfferedTo;
        this.gameInfo.currentBiddingPlayerId = bidRaiseData.bidRaiseOfferedTo;
        break;

      case "bidRaised":
        // Bid was raised - enter post-raise double round
        const raisedData = data as any;
        this.gameInfo.bidRaisePhase = false;
        this.gameInfo.bidRaiseOfferedTo = undefined;
        this.gameInfo.currentBet = raisedData.newBidValue?.toString();
        this.gameInfo.postRaiseDoubleRound = true;
        this.gameInfo.currentBiddingPlayerId =
          raisedData.currentBiddingPlayerId;
        break;

      case "biddingPhaseEnd":
        // Bidding phase has ended - clear current bet info and set final bid info
        const biddingEndData = data as any;
        this.gameInfo.isBiddingPhase = false;
        this.gameInfo.currentBet = undefined; // Clear current bet when bidding phase ends
        this.gameInfo.currentBetPlayerId = undefined; // Clear to prevent showing wrong player
        this.gameInfo.finalBid = biddingEndData.finalBid;
        this.gameInfo.trumpSuit = biddingEndData.trumpSuit;
        this.gameInfo.biddingTeam = biddingEndData.biddingTeam;
        this.gameInfo.biddingPlayer = biddingEndData.biddingPlayer;
        this.gameInfo.bidDouble = biddingEndData.bidDouble || false;
        this.gameInfo.bidReDouble = biddingEndData.bidReDouble || false;
        // Clear bid raise phase state
        this.gameInfo.bidRaisePhase = false;
        this.gameInfo.bidRaiseOfferedTo = undefined;
        this.gameInfo.postRaiseDoubleRound = false;
        this.gameInfo.postRaiseDoubleCount = 0;
        break;

      case "FORFEIT_REQUEST":
        // Handle forfeit request notification
        this.gameInfo.notification = {
          action: "FORFEIT_REQUEST",
          data: data,
        };
        break;

      case "FORFEIT_APPROVAL_UPDATE":
        // Handle forfeit approval update notification
        this.gameInfo.notification = {
          action: "FORFEIT_APPROVAL_UPDATE",
          data: data,
        };
        break;

      case "GAME_FORFEITED":
        // Handle game forfeited notification
        const forfeitData = data as any;
        this.gameInfo.isGameComplete = true;
        this.gameInfo.teamAScore = forfeitData.teamAScore;
        this.gameInfo.teamBScore = forfeitData.teamBScore;
        // Reset bidding and game state for the upcoming restart
        this.gameInfo.isBiddingPhase = true;
        this.gameInfo.bidHistory = [];
        this.gameInfo.bidPassCount = 0;
        this.gameInfo.currentBet = undefined;
        this.gameInfo.trumpSuit = undefined;
        this.gameInfo.bidDouble = false;
        this.gameInfo.bidReDouble = false;
        this.gameInfo.finalBid = undefined;
        this.gameInfo.droppedCards = [];
        this.gameInfo.teamACards = [];
        this.gameInfo.teamBCards = [];
        this.gameInfo.cards = [];
        // Clear bid raise phase state
        this.gameInfo.bidRaisePhase = false;
        this.gameInfo.bidRaiseOfferedTo = undefined;
        this.gameInfo.postRaiseDoubleRound = false;
        this.gameInfo.postRaiseDoubleCount = 0;
        this.gameInfo.notification = {
          action: "GAME_FORFEITED",
          data: data,
        };
        break;

      case "POSITION_SWITCH_REQUEST":
        // Handle position switch request notification
        this.gameInfo.notification = {
          action: "POSITION_SWITCH_REQUEST",
          data: data,
        };
        break;

      case "POSITION_SWITCH_COMPLETED":
        // Handle position switch completed notification
        const switchData = data as any;
        this.gameInfo.teamAPositionSwitchUsed =
          switchData.teamAPositionSwitchUsed;
        this.gameInfo.teamBPositionSwitchUsed =
          switchData.teamBPositionSwitchUsed;
        this.gameInfo.notification = switchData.message;
        break;

      case "POSITION_SWITCH_DENIED":
        // Handle position switch denied notification
        const switchDeniedData = data as any;
        this.gameInfo.notification = switchDeniedData.message;
        break;

      case "SPECTATOR_JOINED":
        // Handle spectator joined notification
        const spectatorJoinedData = data as any;
        this.gameInfo.notification =
          spectatorJoinedData.message || "A spectator joined the game";
        break;

      default:
        console.log(
          "Default case. Shouldn't hit this. Action:",
          action,
          "Data:",
          data,
        );
        break;
    }
  };

  // Game mode selection methods
  public setGameModeCreate = () => {
    this.gameInfo.gameMode = "create";
    this.gameInfo.isGameCreator = true;
    this.gameInfo.showGameModeSelection = false;
  };

  public setGameModeJoin = (gameId: string) => {
    this.gameInfo.gameMode = "join";
    this.gameInfo.gameIdToJoin = gameId;
    this.gameInfo.isGameCreator = false;
    this.gameInfo.showGameModeSelection = false;
  };

  public setSharedGameId = (gameId: string) => {
    this.gameInfo.sharedGameId = gameId;
  };

  public clearGameMode = () => {
    this.gameInfo.gameMode = null;
    this.gameInfo.gameIdToJoin = undefined;
    this.gameInfo.isGameCreator = false;
    this.gameInfo.sharedGameId = undefined;
    this.gameInfo.showGameModeSelection = true;
  };

  /**
   * Generate a shareable URL for the current game
   * @param gameId The game ID to include in the URL
   * @returns The full shareable URL
   */
  public getShareableGameUrl = (gameId: string): string => {
    if (!gameId) {
      return "";
    }
    const baseUrl = window.location.origin;
    return `${baseUrl}/?gameId=${encodeURIComponent(gameId)}`;
  };

  /**
   * Set game mode to spectator/viewer for an existing game
   */
  public setGameModeView = (gameId: string) => {
    this.gameInfo.gameMode = "view" as any;
    this.gameInfo.gameIdToJoin = gameId;
    this.gameInfo.isGameCreator = false;
    this.gameInfo.showGameModeSelection = false;
  };

  /**
   * Request a team position switch for the current player's team
   */
  public async requestPositionSwitch(team: "A" | "B"): Promise<void> {
    const { gameId, playerId } = this.userInfo;
    this.clearNotifications();

    try {
      await this.gameService.switchTeamPositions(
        gameId as string,
        playerId as string,
        team,
      );
    } catch (error) {
      const errorMessage =
        typeof error === "string"
          ? error
          : (error as any)?.message ||
            "Failed to request position switch request";
      this.gameInfo.error = errorMessage;
    }
  }

  /**
   * Approve or deny a pending position switch request for the current player's team
   */
  public async approvePositionSwitch(approved: boolean): Promise<void> {
    const { gameId, playerId } = this.userInfo;
    // Read requestedBy BEFORE clearing notifications,
    // since the approval/denial action shares the same notification object
    const notification = this.gameInfo.notification;
    const requestedBy =
      notification &&
      typeof notification === "object" &&
      notification.action === "POSITION_SWITCH_REQUEST"
        ? notification.data?.requestedBy
        : "";
    this.clearNotifications();

    try {
      await this.gameService.approvePositionSwitch(
        gameId as string,
        requestedBy,
        playerId as string,
        approved,
      );
    } catch (error) {
      const errorMessage =
        typeof error === "string"
          ? error
          : (error as any)?.message ||
            "Failed to respond to position switch request";
      this.gameInfo.error = errorMessage;
    }
  }
}

const store = new Store();
export default store;
