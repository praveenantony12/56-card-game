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

  // This is to store the card details by userId/token.
  [token: string]: Array<any>;
}
