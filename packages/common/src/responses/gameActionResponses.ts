/**
 * Model for all game action response.
 */
export interface GameActionResponse {
  action: string;
  data: object;
}

/**
 * Card response model.
 */
export interface ICards {
  cards: string[];
}

/**
 * Turn response model.
 */
export interface INotifyTurn {
  currentPlayerId: string;
}

/**
 * Player Bet response model.
 */
export interface IPlayerBet {
  playerBet: string;
  playerId: string;
}

/**
 * Game Scpre response model.
 */
export interface IGameScore {
  gameScore: string;
}

/**
 * Dropped response model.
 */
export interface IDroppedCards {
  cards: string[];
}

/**
 * Team A response model.
 */
export interface ITeamACards {
  cards: string[];
}

/**
 * Team B response model.
 */
export interface ITeamBCards {
  cards: string[];
}

/**
 * Cards on table response model.
 */
export interface ITableCards {
  cards: string[];
}

/**
 * Game over response model.
 */
export interface IGameOver {
  winnerId: string;
}

/**
 * Abort game model.
 */
export interface IGameAborted {
  reason: string;
}

/**
 * Penality cards response model.
 */
export interface IPenality extends ICards { }

/**
 * Players response model.
 */
export interface IPlayers {
  players: string[];
}

/**
 * Players response model.
 */
export interface IDropCardPlayer {
  dropCardPlayer: string[];
}

/**
 * Trump suit response model.
 */
export interface ITrumpSuitSelected {
  playerTrumpSuit: { [playerId: string]: string };
  trumpSuit?: string;
}

/**
 * Round winner response model.
 */
export interface IRoundWinner {
  roundWinnerTeam: string;
}
