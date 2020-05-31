import * as common from "@rcg/common";
import { computed, observable } from "mobx";
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

  constructor() {
    this.gameService = new GameService(this.subscribeToNotifications);
    this.initializeStore();
  }

  @computed
  public get user() {
    return this.userInfo;
  }

  @computed
  public get game() {
    return this.gameInfo;
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

    try {
      const userInfo = await this.gameService.signIn(userId);
      this.userInfo = userInfo;
      this.userInfo.isSignedIn = true;
    } catch (error) {
      this.gameInfo.error = error;
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
        playerId as string
      );
      if (ack.code === common.RESPONSE_CODES.success) {
        try {
          this.gameInfo.cards = (this.gameInfo.cards || []).filter(
            (x) => x !== card
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
      const ack: common.SuccessResponse = await this.gameService.dropCardPlayer(
        dropCardPlayer
      );
      if (ack.code === common.RESPONSE_CODES.success) {
        console.log(
          "this.gameInfo.dropCardPlayer ===> " + this.gameInfo.dropCardPlayer
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
        gameId as string
      );

      if (ack.code === common.RESPONSE_CODES.success) {
        // this.gameInfo.teamACards = (this.gameInfo.teamACards || []).filter(
        //   x => x !== cards
        // );
        console.log(
          "this.gameInfo.teamACards ===> " + this.gameInfo.teamACards
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
        gameId as string
      );

      if (ack.code === common.RESPONSE_CODES.success) {
        // this.gameInfo.teamACards = (this.gameInfo.teamACards || []).filter(
        //   x => x !== cards
        // );
        console.log(
          "this.gameInfo.teamBCards ===> " + this.gameInfo.teamBCards
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

    try {
      const ack: common.SuccessResponse = await this.gameService.restartGame(
        gameId
      );
      if (ack.code === common.RESPONSE_CODES.success) {
        console.log("this.gameInfo.gameId ===> " + this.userInfo.gameId);
      }
    } catch (error) {
      console.log("error ===> " + error);
      this.game.error = JSON.stringify(error);
    }
  }

  public async selectPlayer(playerId: string) {
    const { gameId, token } = this.userInfo;
    this.clearNotifications();

    try {
      const ack: common.SuccessResponse = await this.gameService.selectPlayer(
        playerId,
        gameId as string,
        token as string
      );

      if (ack.code === common.RESPONSE_CODES.success) {
        console.log(
          "this.gameInfo.currentPlayerId ===> " + this.gameInfo.currentPlayerId
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
      const ack: common.SuccessResponse = await this.gameService.incrementBetByPlayer(
        playerBet,
        gameId as string,
        token as string
      );

      if (ack.code === common.RESPONSE_CODES.success) {
        console.log("this.gameInfo.playerBet ===> " + this.gameInfo.currentBet);
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
      const ack: common.SuccessResponse = await this.gameService.updateGameScore(
        gameScore,
        gameId as string,
        token as string
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

  private initializeStore() {
    this.gameInfo = {};
    this.userInfo = {};
    this.userInfo.isSignedIn = false;
  }

  private subscribeToNotifications = (
    response: common.SuccessResponse | common.ErrorResponse
  ) => {
    this.clearNotifications();

    console.log(response);

    const error = (response as common.ErrorResponse).message;

    if (error) {
      this.gameInfo.error = error;
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
        this.gameInfo.currentPlayerId = (data as common.INotifyTurn).currentPlayerId;
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
        this.gameInfo.dropCardPlayer = (data as common.IDropCardPlayer).dropCardPlayer;
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

      case common.MESSAGES.gameAborted:
        this.initializeStore();
        this.gameInfo.notification =
          (data as common.IGameAborted).reason ||
          "Something went wrong. Please try again!";
        break;

      default:
        console.log("Default case. Shouldn't hit this");
        break;
    }
  };
}

const store = new Store();
export default store;
