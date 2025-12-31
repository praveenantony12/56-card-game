/**
 * The player details model.
 */
export interface IPlayer {
  token: string;
  socketId: string;
  playerId: string;
  gameId: string;
  isDisconnected?: boolean;
  disconnectedAt?: Date;
  lastActivity?: Date;
}
