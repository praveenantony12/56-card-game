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
import { InMemoryStore } from "../persistence/InMemoryStore";
import { stringify } from "querystring";
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

        this.startGame(starvingGamePoolId, [...starvingPlayers]);
      }
    } catch (error) {
      cb(null, errorResponse(RESPONSE_CODES.loginFailed, error && error.message ? error.message : "Unknown error"));
    }
  }

  /**
   * Starts the game.
   * @param gameId The game id.
   */
  public startGame(gameId: string, players: IPlayer[]) {
    const gameObject = this.createGameObject(players);
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
    this.startGame(gameId, this.playersPoolForReGame);
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
    // const dropCardByPlayerPayload: GameActionResponse = Payloads.sendDropCardByPlayer(
    //   []
    // );
    // response = successResponse(
    //   RESPONSE_CODES.gameNotification,
    //   dropCardByPlayerPayload
    // );
    // this.ioServer.to(req.gameId).emit("data", response);
    const gameObj = this.inMemoryStore.fetchGame(req.gameId);
    gameObj.dropCardPlayer = [];
    this.inMemoryStore.saveGame(req.gameId, gameObj);
    const incrementBetPayload: GameActionResponse = Payloads.sendBetByPlayer(
      "27",
      this.playersPoolForReGame[0].playerId
    );
    response = successResponse(
      RESPONSE_CODES.gameNotification,
      incrementBetPayload
    );
    this.ioServer.to(req.gameId).emit("data", response);
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

    const gameObj = this.inMemoryStore.fetchGame(req.gameId);
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
    const UpdateGameScorePayload: GameActionResponse = Payloads.sendUpdatedGameScore(
      req.gameScore
    );
    let response = successResponse(
      RESPONSE_CODES.gameNotification,
      UpdateGameScorePayload
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
    this.inMemoryStore.deleteGame(gameId);

    if (this.currentGameId === gameId) {
      this.playersPool = [];
    }

    const payload: GameActionResponse = Payloads.sendGameAborted(
      "The player(s) disconnected from the game pool. So we aborted the game. Please sign in again to play."
    );

    const response = successResponse(RESPONSE_CODES.gameNotification, payload);
    this.ioServer.to(gameId).emit("data", response);
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

    const { cardToWeightageDict } = require("../constants/deck");
    if (!cardToWeightageDict) return;

    const dropCardPlayer = gameObj.dropCardPlayer || [];
    if (!dropCardPlayer || dropCardPlayer.length === 0) return;

    let highestCardWeight = -1;
    let winningPlayerIndex = -1;
    let winnerTeam = "A";

    // Find the player with the highest single card
    for (const cardDetail of dropCardPlayer) {
      if (!cardDetail) continue;

      const [card, playerId] = cardDetail.split("-");
      if (!card || !playerId) continue;

      const playerIndex = gameObj.players.findIndex(
        (p: IPlayer) => p && p.playerId === playerId
      );

      if (playerIndex === -1) continue;

      let cardWeight = cardToWeightageDict[card.slice(2)] || 0;

      // Add trump bonus (+10) if card suit matches trump suit
      if (gameObj.trumpSuit && card.length > 1 && card[1] === gameObj.trumpSuit) {
        cardWeight += 10;
      }

      // Check if this is the highest card so far
      if (cardWeight > highestCardWeight) {
        highestCardWeight = cardWeight;
        winningPlayerIndex = playerIndex;
        // Determine team based on player index (0,2,4... = Team A | 1,3,5... = Team B)
        winnerTeam = playerIndex % 2 === 0 ? "A" : "B";
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
    players: IPlayer[]
  ): GameModel {
    const game = {};
    game["players"] = [];
    game["currentTurn"] = 0;
    game["maxTurn"] = MAX_PLAYERS - 1;
    game["droppedCards"] = [];
    game["dropdetails"] = [];
    game["teamACards"] = [];
    game["teamBCards"] = [];
    game["tableCards"] = [];
    game["dropDetails"] = [];
    game["dropCardPlayer"] = [];
    game["currentBet"] = "27";
    game["playerWithCurrentBet"] = players[0].playerId;

    const cards: string[][] = this.deck.getCardsForGame();
    const sortedCards = cards.map((handCards) =>
      this.deck.sortCards(handCards)
    );

    for (let idx in players) {
      const player: IPlayer = players[idx];
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
}
