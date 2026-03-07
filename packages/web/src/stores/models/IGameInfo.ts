export interface IGame {
  cards?: string[];
  droppedCards?: string[];
  dropCardPlayer?: string[];
  teamACards?: string[];
  teamBCards?: string[];
  tableCards?: string[];
  currentBet?: string;
  currentTurn?: string;
  gameScore?: string;
  currentBetPlayerId?: string;
  notification?: string | any;
  canStartGame?: boolean;
  showBotSelection?: boolean;
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
  isPendingReconnection?: boolean;
  gamePaused?: boolean;
  // Bidding phase state
  isBiddingPhase?: boolean;
  currentBiddingPlayerId?: string;
  startingPlayerId?: string;
  bidHistory?: Array<{
    playerId: string;
    action:
      | "bid"
      | "pass"
      | "double"
      | "re-double"
      | "raise-bid"
      | "skip-raise";
    bidValue?: number;
    suit?: string;
    bidSelectionType?: "direct" | "modifier" | null;
    bidModifier?: number;
    clickOrder?: "bidFirst" | "suitFirst" | null;
    noTrumpType?: "Noes" | "Pass" | "No-Trump" | null;
  }>;
  bidPassCount?: number;
  lastBiddingTeam?: string;
  bidDouble?: boolean;
  bidReDouble?: boolean;
  // Bid raise phase (after normal bidding ends, before game starts)
  bidRaisePhase?: boolean;
  bidRaiseOfferedTo?: string;
  // Post-raise double/re-double round (after bid is raised)
  postRaiseDoubleRound?: boolean;
  postRaiseDoubleCount?: number;
  gameCompleteData?: {
    biddingTeamAchievedBid: boolean;
    teamAPoints: number;
    teamBPoints: number;
    teamAScore: number;
    teamBScore: number;
    scoreResetOccurred: boolean;
  };
  gameMode?: "create" | "join" | null;
  gameIdToJoin?: string;
  isGameCreator?: boolean;
  sharedGameId?: string;
  showGameModeSelection?: boolean;
}
