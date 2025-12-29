export interface IGame {
  cards?: string[];
  droppedCards?: string[];
  dropCardPlayer?: string[];
  teamACards?: string[];
  teamBCards?: string[];
  tableCards?: string[];
  currentBet?: string;
  gameScore?: string;
  currentBetPlayerId?: string;
  notification?: string;
  canStartGame?: boolean;
  yourTurn?: boolean;
  gameOver?: boolean;
  leftGame?: boolean;
  error?: string;
  currentPlayerId?: string;
  players?: string[];
  penalityCards?: string[];
  isConnected?: boolean;
  trumpSuit?: string;
  playerTrumpSuit?: { [playerId: string]: string };
  roundWinnerTeam?: string;
  finalBid?: number;
  biddingTeam?: string;
  biddingPlayer?: string;
  isGameComplete?: boolean;
  teamAScore?: number;
  teamBScore?: number;
  winnerMessage?: string;
  gameCompleteData?: {
    biddingTeamAchievedBid: boolean;
    teamAPoints: number;
    teamBPoints: number;
    teamAScore: number;
    teamBScore: number;
    scoreResetOccurred: boolean;
  }
}
