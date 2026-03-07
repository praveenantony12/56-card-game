import { IPlayer } from "./IPlayer";
import { IDropCardPlayer } from "./IDropCardPlayer";
import { IDroppedDetails } from "./IDroppedDetails";

/**
 * The main Game model object.
 */
export interface ICardGame {
  players: [IPlayer];
  dropCardPlayer: string[];
  currentTurn: any;
  maxTurn: any;
  droppedCards: Array<string>;
  teamACards: Array<string>;
  teamBCards: Array<string>;
  tableCards: Array<string>;
  dropDetails: Array<string>;
  currentBet: any;
  gameScore?: any;
  playerWithCurrentBet: any;
  trumpSuit?: string;
  playerTrumpSuit?: { [playerId: string]: string };
  roundWinnerTeam?: string;
  finalBid?: number;
  biddingTeam?: string;
  biddingPlayer?: string;
  isGameComplete?: boolean;
  teamAScore?: number;
  teamBScore?: number;
  disconnectedPlayers?: { [playerId: string]: IPlayer };
  pendingConnections?: { [playerId: string]: IPlayer };
  gameCreatedAt?: Date;
  gamePausedAt?: boolean;
  pausedAt?: Date;
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

  // Forfeit state
  forfeitRequestedBy?: string;
  forfeitApprovals?: { [playerId: string]: boolean };
  forfeitInProgress?: boolean;

  // This is to store the card details by userId/token.
  [token: string]: any;
}
