import { ICardGame } from "../core/models/ICardGame";
import { resolveSeatTeam } from "../core/teams";
import { buildAliasMap, seatAlias } from "./pseudonyms";
import { ShadowBid, ShadowTrickEntry, ShadowVisibleState } from "./types";

/**
 * Field classification used to build the projection (allowlist):
 *
 *  ACTOR_ONLY          the acting player's own hand
 *  PUBLIC_ALWAYS       seats, current trick, team piles, trump, bidding history,
 *                      double/re-double flags, scores
 *  PUBLIC_AFTER_REVEAL finalBid, biddingTeam, biddingPlayer (set at bidding end)
 *  SERVER_ONLY         tokens, socket ids, connection, forfeit and seat-switch
 *                      state: never copied
 *  NOT_REQUIRED_BY_BOT playerTrumpSuit, droppedCards, dropDetails, tableCards,
 *                      turn bookkeeping: not copied
 *
 * Anything not listed in this file is excluded by default.
 */

type VisibleStateResult =
  | { state: ShadowVisibleState; skipReason?: undefined }
  | { state?: undefined; skipReason: "INCONSISTENT_TRICK" };

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.keys(value).forEach((key) => deepFreeze((value as any)[key]));
  }
  return value;
}

function stringArray(value: any): string[] {
  return Array.isArray(value)
    ? value.filter((v) => typeof v === "string")
    : [];
}

/**
 * Builds the player-visible, pseudonymized, deeply frozen state for the player
 * seated at actorSeat. Returns INCONSISTENT_TRICK when the cards on the table
 * cannot be attributed to the seats in play order (for example because an
 * earlier request claimed a different player id); such a state must not be
 * trained on.
 */
export function buildVisibleState(
  game: ICardGame,
  actorSeat: number,
): VisibleStateResult {
  const players = game.players as any[];
  const aliases = buildAliasMap(players);
  const seatCount = players.length;
  const actor = players[actorSeat];

  const rawTrick = stringArray(game.dropCardPlayer);
  const trickLength = rawTrick.length;
  const turn = Number(game.currentTurn);
  if (trickLength >= seatCount || !isFinite(turn)) {
    return { skipReason: "INCONSISTENT_TRICK" };
  }

  // Card ids contain no "-" but player ids may, so split on the first one only.
  const currentTrick: ShadowTrickEntry[] = [];
  for (let k = 0; k < trickLength; k++) {
    const entry = rawTrick[k];
    const dash = entry.indexOf("-");
    const by = dash > 0 ? aliases.get(entry.slice(dash + 1)) : undefined;
    const expectedSeat = (turn - trickLength + k + seatCount * 2) % seatCount;
    if (!by || by !== seatAlias(expectedSeat)) {
      return { skipReason: "INCONSISTENT_TRICK" };
    }
    currentTrick.push({ card: entry.slice(0, dash), by });
  }

  const bidHistory: ShadowBid[] = (game.bidHistory || []).map((bid) => {
    const copy: ShadowBid = {
      by: aliases.get(bid.playerId) || "unknown",
      action: bid.action,
    };
    if (bid.bidValue !== undefined) copy.bidValue = bid.bidValue;
    if (bid.suit !== undefined) copy.suit = bid.suit;
    if (bid.bidSelectionType !== undefined)
      copy.bidSelectionType = bid.bidSelectionType;
    if (bid.bidModifier !== undefined) copy.bidModifier = bid.bidModifier;
    if (bid.clickOrder !== undefined) copy.clickOrder = bid.clickOrder;
    if (bid.noTrumpType !== undefined) copy.noTrumpType = bid.noTrumpType;
    return copy;
  });

  const state: ShadowVisibleState = {
    actorRef: seatAlias(actorSeat),
    seats: players.map((p, seat) => ({
      ref: seatAlias(seat),
      seat,
      team: resolveSeatTeam(seat),
      isBot: !!(p && p.isBotAgent),
    })),
    hand: stringArray(game[actor.token]),
    currentTrick,
    teamACards: stringArray(game.teamACards),
    teamBCards: stringArray(game.teamBCards),
    trumpSuit: game.trumpSuit,
    finalBid: game.finalBid,
    currentBet: game.currentBet,
    biddingTeam: game.biddingTeam,
    biddingPlayer: game.biddingPlayer
      ? aliases.get(game.biddingPlayer)
      : undefined,
    lastBiddingTeam: game.lastBiddingTeam,
    bidDouble: !!game.bidDouble,
    bidReDouble: !!game.bidReDouble,
    bidHistory,
    teamAScore: game.teamAScore,
    teamBScore: game.teamBScore,
  };

  return { state: deepFreeze(state) };
}
