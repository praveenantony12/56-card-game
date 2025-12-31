import * as common from "@rcg/common";
import { IDropCardPlayer } from "@rcg/common";
import { stat } from "fs";

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

  /**
   * Forms response to send the selected trump suits.
   * @param playerTrumpSuit The trump suits selected by each player
   * @param trumpSuit The final trump suit for the game (first one selected)
   */
  public static sendTrumpSuitSelected(
    playerTrumpSuit: { [playerId: string]: string },
    trumpSuit?: string
  ): common.GameActionResponse {
    const data: common.ITrumpSuitSelected = {
      playerTrumpSuit,
      trumpSuit,
    };
    return {
      action: common.MESSAGES.trumpSuitSelected,
      data,
    };
  }

  /**
   * Forms response to send the round winner determined automatically.
   * @param roundWinnerTeam The team that won the round
   */
  public static sendRoundWinner(
    roundWinnerTeam: string
  ): common.GameActionResponse {
    const data: common.IRoundWinner = {
      roundWinnerTeam,
    };
    return {
      action: roundWinnerTeam === "B" ? common.MESSAGES.deckWonByTeamB : common.MESSAGES.deckWonByTeamA,
      data,
    };
  }

  /**
   * Forms response to send the game complete information.
   * @param gameCompleteData The game complete data
   */
  public static sendGameComplete(
    gameCompleteData: common.IGameComplete
  ): common.GameActionResponse {
    return {
      action: common.MESSAGES.gameComplete,
      data: gameCompleteData,
    };
  }

  /**
   * Forms response to send the team scores.
   * @param teamScores The team scores data
   */
  public static sendTeamScores(
    teamScores: common.ITeamScores
  ): common.GameActionResponse {
    return {
      action: common.MESSAGES.teamScores,
      data: teamScores,
    };
  }

  /**
   * Forms response to notify player reconnection.
   * @param message The reconnection message
   */
  public static sendPlayerReconnected(
    message: string
  ): common.GameActionResponse {
    return {
      action: common.MESSAGES.playerReconnected,
      data: { message },
    };
  }

  /**
   * Forms response to notify player disconnection.
   * @param message The disconnection message
   */
  public static sendPlayerDisconnected(
    message: string
  ): common.GameActionResponse {
    return {
      action: common.MESSAGES.playerDisconnected,
      data: { message },
    };
  }

  /**
   * Forms response to notify game paused.
   * @param message The game paused message
   */
  public static sendGamePaused(
    message: string
  ): common.GameActionResponse {
    return {
      action: common.MESSAGES.gamePaused,
      data: { message },
    };
  }

  /**
   * Forms response to notify game resumed.
   * @param message The game resumed message
   */
  public static sendGameResumed(
    message: string
  ): common.GameActionResponse {
    return {
      action: common.MESSAGES.gameResumed,
      data: { message },
    };
  }
}