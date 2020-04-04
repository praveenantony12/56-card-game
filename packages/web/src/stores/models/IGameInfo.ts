export interface IGame {
  cards?: string[];
  droppedCards?: string[];
  teamACards?: string[];
  teamBCards?: string[];
  tableCards?: string[];
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
}
