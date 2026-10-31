import { IPlayer } from "./models/IPlayer";

export type Team = "A" | "B";

/**
 * Team for a seat. Seats 0, 2, 4 are Team A and seats 1, 3, 5 are Team B.
 *
 * This is the same rule the live game applies in many places (for example
 * GameCore.getPlayerTeam and the position-switch handler). Training code uses
 * this single helper; teams.spec.ts pins it to the live implementations.
 */
export function resolveSeatTeam(seat: number): Team {
  return seat % 2 === 0 ? "A" : "B";
}

/**
 * Team of a player, or null when the player is not seated.
 * @param players The seat-ordered players of the game.
 * @param playerId The player to look up.
 */
export function resolvePlayerTeam(
  players: Array<Pick<IPlayer, "playerId">>,
  playerId: string,
): Team | null {
  const seat = players.findIndex((p) => p && p.playerId === playerId);
  return seat === -1 ? null : resolveSeatTeam(seat);
}
