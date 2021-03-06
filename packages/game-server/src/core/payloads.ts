import * as common from "@rcg/common";
import { IDropCardPlayer } from "@rcg/common";

export class Payloads {
  /**
   * Forms the response that needs to be send for 'recieveCards' action.
   * @param cards The cards array needs to send
   */
  public static sendCards(cards: string[]): common.GameActionResponse {
    const data: common.ICards = {
      cards,
    };
    return {
      action: common.MESSAGES.cards,
      data,
    };
  }

  /**
   * Forms reponse to notify the turn.
   * @param currentPlayerId The current player id.
   */
  public static sendNotifyTurn(currentPlayerId): common.GameActionResponse {
    const data: common.INotifyTurn = {
      currentPlayerId,
    };
    return {
      action: common.MESSAGES.turnInfo,
      data,
    };
  }

  /**
   * Forms reponse to notify the turn.
   */
  public static sendCardDropAccepted(): common.GameActionResponse {
    return {
      action: common.MESSAGES.cardDropAccepted,
      data: {},
    };
  }

  /**
   * Forms reponse to notify the dropped card.
   * @param cards The card to send.
   */
  public static sendDroppedCards(cards: string[]): common.GameActionResponse {
    const data: common.IDroppedCards = {
      cards,
    };
    return {
      action: common.MESSAGES.droppedCards,
      data,
    };
  }

  /**
   * Forms reponse to notify the updated Bet.
   * @param playerBet The player bet to send
   * @param playerId The player Id who made the bet to send.
   */
  public static sendBetByPlayer(
    playerBet: string,
    playerId: string
  ): common.GameActionResponse {
    const data: common.IPlayerBet = {
      playerBet,
      playerId,
    };
    return {
      action: common.MESSAGES.incrementBetByPlayer,
      data,
    };
  }

  /**
   * Forms reponse to notify the updated Score.
   * @param gameScore The game score to send
   */
  public static sendUpdatedGameScore(
    gameScore: string
  ): common.GameActionResponse {
    const data: common.IGameScore = {
      gameScore,
    };
    return {
      action: common.MESSAGES.updateGameScore,
      data,
    };
  }

  /**
   * Forms reponse to notify the updated game score.
   * @param game The player who dropped card.
   */
  public static sendDropCardByPlayer(
    dropCardPlayer: string[]
  ): common.GameActionResponse {
    const data: common.IDropCardPlayer = {
      dropCardPlayer,
    };
    return {
      action: common.MESSAGES.dropCardPlayer,
      data,
    };
  }

  /**
   * Forms reponse to notify the cards won by Team A.
   * @param cards The card to send.
   */
  public static sendTeamACards(cards: string[]): common.GameActionResponse {
    const data: common.ITeamACards = {
      cards,
    };
    return {
      action: common.MESSAGES.teamACards,
      data,
    };
  }

  /**
   * Forms reponse to notify the cards won by Team B.
   * @param cards The card to send.
   */
  public static sendTeamBCards(cards: string[]): common.GameActionResponse {
    const data: common.ITeamBCards = {
      cards,
    };
    return {
      action: common.MESSAGES.teamBCards,
      data,
    };
  }

  /**
   * Forms reponse to notify the cards on Table
   * @param cards The card to send.
   */
  public static sendTableCards(cards: string[]): common.GameActionResponse {
    const data: common.ITableCards = {
      cards,
    };
    return {
      action: common.MESSAGES.tableCards,
      data,
    };
  }

  /**
   * Forms reponse to notify the game has over.
   * @param winnerId The winner id.
   */
  public static sendGameOver(winnerId: string): common.GameActionResponse {
    const data: common.IGameOver = {
      winnerId,
    };
    return {
      action: common.MESSAGES.gameOver,
      data,
    };
  }

  /**
   * Forms reponse to notify the game is aborted.
   * @param reason The reason to abort the game.
   */
  public static sendGameAborted(reason: string): common.GameActionResponse {
    const data: common.IGameAborted = {
      reason,
    };
    return {
      action: common.MESSAGES.gameAborted,
      data,
    };
  }

  /**
   * Forms response to send the penality to the players.
   * @param cards The cards
   */
  public static sendPenality(cards: string[]): common.GameActionResponse {
    const data: common.IPenality = {
      cards,
    };
    return {
      action: common.MESSAGES.penality,
      data,
    };
  }

  /**
   * Forms reponse to notify the players information.
   * @param players The player id's
   */
  public static sendPlayersInfo(players: string[]): common.GameActionResponse {
    const data: common.IPlayers = {
      players,
    };
    return {
      action: common.MESSAGES.playerInfo,
      data,
    };
  }
}
