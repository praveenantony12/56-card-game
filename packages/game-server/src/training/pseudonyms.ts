import { IPlayer } from "../core/models/IPlayer";

/**
 * Alias for a seat, e.g. seat_2. An underscore is used on purpose: the live
 * game and the bot parse "card-playerId" strings by splitting on "-".
 */
export function seatAlias(seat: number): string {
  return `seat_${seat}`;
}

/**
 * Maps real player ids to game-scoped aliases for the current seating.
 * The map is built per decision and lives only in memory; it is never
 * serialized.
 */
export function buildAliasMap(
  players: Array<Pick<IPlayer, "playerId">>,
): Map<string, string> {
  const map = new Map<string, string>();
  players.forEach((p, seat) => {
    if (p && typeof p.playerId === "string" && !map.has(p.playerId)) {
      map.set(p.playerId, seatAlias(seat));
    }
  });
  return map;
}
