import { IGame } from "./models/IGameInfo";
import { IUser } from "./models/IUserInfo";

export interface IStore {
  game: IGame;

  user: IUser;

  isAttemptingReconnection: boolean;

  isPendingReconnectionApproval: boolean;

  showReconnectMode: boolean;
  toggleReconnectMode(): void;

  signIn(userId: string): Promise<any>;

  reconnect(): Promise<any>;

  addBots(botCount: number, startImmediately?: boolean): Promise<any>;

  dropCard(card: string): Promise<any>;

  deckWonByTeamA(): Promise<any>;

  deckWonByTeamB(): Promise<any>;

  incrementBetByPlayer(playerBet: string): Promise<any>;

  updateGameScore(gameScore: string): Promise<any>;

  selectPlayer(player: string): Promise<any>;

  selectTrumpSuit(trumpSuit: string): Promise<any>;

  biddingAction(
    action:
      | "bid"
      | "pass"
      | "double"
      | "re-double"
      | "raise-bid"
      | "skip-raise",
    bidValue?: number,
    suit?: string,
    bidSelectionType?: "direct" | "modifier" | null,
    bidModifier?: number,
    clickOrder?: "bidFirst" | "suitFirst" | null,
    noTrumpType?: "Noes" | "Pass" | "No-Trump" | null,
  ): Promise<any>;

  raiseBid(newBidValue: number): Promise<any>;

  skipRaise(): Promise<any>;

  restartGame(gameId: string): Promise<any>;

  approveReconnection(playerId: string): Promise<void>;

  denyReconnection(playerId: string): Promise<void>;

  ping(): Promise<void>;

  hideBotSelection(): void;

  leaveGame(): void;

  clearNotifications(): void;

  approveForfeit(): Promise<void>;

  denyForfeit(): Promise<void>;

  forfeitGame(gameId: string): Promise<void>;

  forceReconnect(targetPlayerId: string): Promise<void>;

  getShareableGameUrl(gameId: string): string;

  requestPositionSwitch(team: "A" | "B"): Promise<void>;

  approvePositionSwitch(approved: boolean): Promise<void>;

  setGameModeView(gameId: string): void;
  setGameModeCreate(): void;
  setGameModeJoin(gameId: string): void;
  setGameModeLobby(): void;
  joinLobby(playerId: string): Promise<any>;
  leaveLobby(): Promise<any>;
  voteBotSubstitution(vote: boolean): Promise<any>;
}
