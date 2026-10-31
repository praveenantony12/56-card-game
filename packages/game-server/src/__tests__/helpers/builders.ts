import { ICardGame } from "../../core/models/ICardGame";
import { IPlayer } from "../../core/models/IPlayer";
import { DEAL_ONE } from "./fixtures/scenarios";

// ---------------------------------------------------------------------------
// Literal card tables, deliberately independent of production constants.
// ---------------------------------------------------------------------------

export const SUIT_LETTERS = ["H", "D", "E", "C"];
export const COPIES = ["1", "2"];
export const RANKS = ["A", "9", "10", "J", "Q", "K"];

/** The 48 physical cards: two copies of every rank in every suit. */
export const ALL_CARDS: string[] = (() => {
  const cards: string[] = [];
  COPIES.forEach((copy) =>
    SUIT_LETTERS.forEach((suit) => RANKS.forEach((rank) => cards.push(`${copy}${suit}${rank}`))),
  );
  return cards;
})();

export const GAME_ID = "game-under-test";
export const PLAYER_NAMES = ["Ann", "Ben", "Cal", "Dee", "Eli", "Fay"];
export const GAME_START = new Date("2026-01-01T00:00:00.000Z");

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

export function player(seat: number, overrides: Partial<IPlayer> = {}): IPlayer {
  return {
    playerId: PLAYER_NAMES[seat],
    token: `tok-${seat}`,
    socketId: `sock-${seat}`,
    gameId: GAME_ID,
    ...overrides,
  };
}

/** Six players in seat order; seats 0,2,4 are Team A and 1,3,5 are Team B. */
export function sixPlayers(overrides: { [seat: number]: Partial<IPlayer> } = {}): IPlayer[] {
  return [0, 1, 2, 3, 4, 5].map((seat) => player(seat, overrides[seat] || {}));
}

// ---------------------------------------------------------------------------
// Games
// ---------------------------------------------------------------------------

/** Two cards per seat: small, explicit, and enough for single-action tests. */
export const SMALL_HANDS: string[][] = [
  ["1HA", "1D9"],
  ["1HK", "1DA"],
  ["1H9", "1D10"],
  ["1DJ", "1EA"],
  ["1HJ", "1EJ"],
  ["1HQ", "1CA"],
];

export interface CardPlayOptions {
  players?: IPlayer[];
  /** Hands as they are NOW: cards already on the table are not in them. */
  hands?: string[][];
  trump?: string;
  bid?: number;
  /** Seat that won the bidding (default 0). */
  biddingSeat?: number;
  /** Seat that led the current trick (default 0). */
  leader?: number;
  /** Plays already on the table this trick, as [seat, card], in play order. */
  trick?: Array<[number, string]>;
  /** Captured piles. Pile sizes are not forced to multiples of six. */
  teamACards?: string[];
  teamBCards?: string[];
  scores?: [number, number];
  overrides?: { [field: string]: any };
}

/**
 * A game in the card-play phase: bidding finished, hands dealt, some of the
 * current trick possibly on the table. `currentTurn` is the seat after the last
 * play of the trick unless overridden.
 */
export function cardPlayGame(options: CardPlayOptions = {}): ICardGame {
  const players = options.players || sixPlayers();
  const hands = options.hands || SMALL_HANDS;
  const trick = options.trick || [];
  const leader = options.leader || 0;
  const biddingSeat = options.biddingSeat || 0;
  const bid = options.bid || 28;
  const biddingTeam = biddingSeat % 2 === 0 ? "A" : "B";
  const scores = options.scores || [10, 10];

  const game: any = {
    players,
    currentTurn: (leader + trick.length) % players.length,
    maxTurn: 5,
    droppedCards: trick.map((play) => play[1]),
    dropDetails: trick.map((play) => play[1]),
    dropCardPlayer: trick.map((play) => `${play[1]}-${players[play[0]].playerId}`),
    tableCards: [],
    teamACards: (options.teamACards || []).slice(),
    teamBCards: (options.teamBCards || []).slice(),
    currentBet: String(bid),
    finalBid: bid,
    trumpSuit: options.trump === undefined ? "H" : options.trump,
    biddingTeam,
    biddingPlayer: players[biddingSeat].playerId,
    playerWithCurrentBet: players[biddingSeat].playerId,
    lastBiddingTeam: biddingTeam,
    bidDouble: false,
    bidReDouble: false,
    bidHistory: [],
    bidPassCount: 0,
    isBiddingPhase: false,
    isGameStarted: true,
    isGameComplete: false,
    isGameCompleted: false,
    startingPlayerId: players[0].playerId,
    gameStartTime: GAME_START,
    disconnectedPlayers: {},
    teamAScore: scores[0],
    teamBScore: scores[1],
  };
  players.forEach((p, seat) => {
    game[p.token] = hands[seat].slice();
  });
  return Object.assign(game, options.overrides || {});
}

export interface BiddingOptions {
  players?: IPlayer[];
  /** Full eight-card hands (default: DEAL_ONE). */
  hands?: string[][];
  /** Seat that opens the bidding and leads the first trick (default 0). */
  starter?: number;
  overrides?: { [field: string]: any };
}

/** A game at the very start of bidding, before any action. */
export function biddingGame(options: BiddingOptions = {}): ICardGame {
  const players = options.players || sixPlayers();
  const hands = options.hands || DEAL_ONE;
  const starter = options.starter || 0;

  const game: any = {
    players,
    currentTurn: starter,
    maxTurn: 5,
    droppedCards: [],
    dropDetails: [],
    dropCardPlayer: [],
    tableCards: [],
    teamACards: [],
    teamBCards: [],
    currentBet: "27",
    playerWithCurrentBet: players[starter].playerId,
    isBiddingPhase: true,
    currentBiddingPlayerId: players[starter].playerId,
    startingPlayerId: players[starter].playerId,
    bidHistory: [],
    bidPassCount: 0,
    bidDouble: false,
    bidReDouble: false,
    bidRaisePhase: false,
    postRaiseDoubleRound: false,
    postRaiseDoubleCount: 0,
    isGameStarted: true,
    isGameComplete: false,
    isGameCompleted: false,
    gameStartTime: GAME_START,
    disconnectedPlayers: {},
    teamAScore: 10,
    teamBScore: 10,
  };
  players.forEach((p, seat) => {
    game[p.token] = hands[seat].slice();
  });
  return Object.assign(game, options.overrides || {});
}

/**
 * Splits the full deck into two piles where `teamAPoints` card points go to
 * Team A and the rest to Team B (56 in total). Deterministic.
 */
export function pilesWithTeamAPoints(teamAPoints: number): { teamACards: string[]; teamBCards: string[] } {
  const points: { [rank: string]: number } = { J: 3, "9": 2, A: 1, "10": 1, K: 0, Q: 0 };
  const byValueDescending = ALL_CARDS.slice().sort(
    (a, b) => (points[b.slice(2)] || 0) - (points[a.slice(2)] || 0),
  );
  let remaining = teamAPoints;
  const teamACards: string[] = [];
  const teamBCards: string[] = [];
  byValueDescending.forEach((card) => {
    const value = points[card.slice(2)] || 0;
    if (value > 0 && value <= remaining) {
      remaining -= value;
      teamACards.push(card);
    } else {
      teamBCards.push(card);
    }
  });
  if (remaining !== 0) {
    throw new Error(`Cannot split ${teamAPoints} points exactly`);
  }
  return { teamACards, teamBCards };
}
