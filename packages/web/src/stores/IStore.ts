import { IGame } from "./models/IGameInfo";
import { IUser } from "./models/IUserInfo";

export interface IStore {
  game: IGame;

  user: IUser;

  isAttemptingReconnection: boolean

  isPendingReconnectionApproval: boolean;

  signIn(userId: string): Promise<any>;

  reconnect(): Promise<any>;

  dropCard(card: string): Promise<any>;

  deckWonByTeamA(): Promise<any>;

  deckWonByTeamB(): Promise<any>;

  incrementBetByPlayer(playerBet: string): Promise<any>;

  updateGameScore(gameScore: string): Promise<any>;

  selectPlayer(player: string): Promise<any>;

  selectTrumpSuit(trumpSuit: string): Promise<any>;

  restartGame(gameId: string): Promise<any>;

  approveReconnection(playerId: string): Promise<void>;

  denyReconnection(playerId: string): Promise<void>;

  ping(): Promise<void>;

  leaveGame(): void;

  clearNotifications(): void;
}
