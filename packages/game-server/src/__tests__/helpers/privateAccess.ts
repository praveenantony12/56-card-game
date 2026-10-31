import { TeamBotAgent } from "../../agents/TeamBotAgent";
import { GameCore } from "../../core/GameCore";
import { SocketServer } from "../../core/SocketServer";

/** The GameCore a SocketServer routes to. */
export function gameCoreOf(server: SocketServer): GameCore {
  return (server as any).gameCore;
}

/**
 * The only place the test suite reaches into GameCore's private members.
 *
 * Completion is normally reached by resolving the last trick of a full hand,
 * which the scenarios and simulations do through the public path. For scoring
 * tables it is far clearer to set up the captured piles directly and ask for the
 * completion check. If GameCore is ever refactored, only this file changes.
 */

/** Runs GameCore's completion check for a game whose piles are already filled. */
export function runCompletionCheck(core: GameCore, gameId: string): void {
  (core as any).checkGameCompletion(gameId);
}

/** GameCore's own team lookup for a player in a game. */
export function gameCoreTeamOf(core: GameCore, game: any, playerId: string): string {
  return (core as any).getPlayerTeam(game, playerId);
}

/** The cards TeamBotAgent considers legal for a token (its private legality filter). */
export function botLegalMoves(game: any, token: string): string[] {
  return (new TeamBotAgent() as any).getLegalMoves(game, token);
}

/** The bot's own team numbering for a player id (0 or 1). */
export function botTeamIdOf(game: any, playerId: string): any {
  return (new TeamBotAgent() as any).getTeamId(playerId, game);
}

/** Asks GameCore to schedule the current bidder's move if that bidder is a bot. */
export function triggerBotBidding(core: GameCore, gameId: string): void {
  (core as any).checkAndPlayBotBiddingTurn(gameId);
}

/** Whether the trick-resolution timer of a game is currently pending. */
export function roundTimerPending(core: GameCore, gameId: string): boolean {
  return !!(core as any).roundTimers[gameId];
}

/** Whether a bot-turn timer of a game is currently pending. */
export function botTimerPending(core: GameCore, gameId: string): boolean {
  return !!(core as any).botTimers[gameId];
}

/** Whether a disconnect-removal timer is pending for a player of a game. */
export function disconnectTimerPending(core: GameCore, gameId: string, playerId: string): boolean {
  const timers = (core as any).disconnectTimeouts[gameId];
  return !!(timers && timers[playerId]);
}
