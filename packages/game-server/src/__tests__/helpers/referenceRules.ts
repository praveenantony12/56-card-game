/**
 * Independent reference implementation of the trick-taking rules, written from
 * the rules table rather than from production code.
 *
 * It is the test oracle: scenarios and simulations compare what the real game
 * does against these functions. It is itself pinned by domain/oracle.spec.ts.
 *
 * Rules encoded (the ones the approved plan classifies as STRICT_RULE):
 *  - rank order J > 9 > A > 10 > K > Q
 *  - card points J=3, 9=2, A=1, 10=1, K=0, Q=0 (56 points in the deck)
 *  - a trick has six plays; a trump beats the led suit; otherwise the highest
 *    card of the led suit wins; among equal cards the EARLIER play wins
 *  - a player must follow the led suit when able, otherwise may play any card
 *
 * Card encoding: <copy 1|2><suit letter><rank>, e.g. "1HJ"; the suit is the
 * second character and the rank is everything after the first two.
 */

export const RANK_ORDER_HIGH_TO_LOW = ["J", "9", "A", "10", "K", "Q"];

export const RANK_POINTS: { [rank: string]: number } = {
  J: 3,
  "9": 2,
  A: 1,
  "10": 1,
  K: 0,
  Q: 0,
};

export function cardSuit(card: string): string {
  return card.charAt(1);
}

export function cardRank(card: string): string {
  return card.slice(2);
}

/** Higher is stronger. */
export function rankStrength(card: string): number {
  return RANK_ORDER_HIGH_TO_LOW.length - RANK_ORDER_HIGH_TO_LOW.indexOf(cardRank(card));
}

export function cardPoints(card: string): number {
  return RANK_POINTS[cardRank(card)] || 0;
}

export function pointsOf(cards: string[]): number {
  return cards.reduce((sum, card) => sum + cardPoints(card), 0);
}

export function teamOfSeat(seat: number): "A" | "B" {
  return seat % 2 === 0 ? "A" : "B";
}

export interface Play {
  seat: number;
  card: string;
}

/**
 * The winning play of a complete trick. `trump` is a suit letter, or "N"/undefined
 * for a game without trump (only the led suit counts).
 */
export function trickWinner(plays: Play[], trump?: string): Play {
  const ledSuit = cardSuit(plays[0].card);
  const trumpPlays =
    trump && trump !== "N" ? plays.filter((p) => cardSuit(p.card) === trump) : [];
  const contenders =
    trumpPlays.length > 0 ? trumpPlays : plays.filter((p) => cardSuit(p.card) === ledSuit);

  let winner = contenders[0];
  for (let i = 1; i < contenders.length; i++) {
    // strictly greater: an equal later card never overtakes the earlier one
    if (rankStrength(contenders[i].card) > rankStrength(winner.card)) {
      winner = contenders[i];
    }
  }
  return winner;
}

/** Cards a player may legally play given the first card on the table (or none). */
export function legalCards(hand: string[], leadCard?: string): string[] {
  if (!leadCard) {
    return hand.slice();
  }
  const following = hand.filter((card) => cardSuit(card) === cardSuit(leadCard));
  return following.length > 0 ? following : hand.slice();
}

/**
 * Score change for the bidding team, from the documented CURRENT tier table:
 *   bid 28-39: +1 / -2, 40-47: +2 / -3, 48-55: +3 / -4, 56: +4 / -5.
 * (Confirmation of these tiers is an open domain question; see the report.)
 */
export function biddingTeamScoreChange(finalBid: number, contractMet: boolean): number {
  let win: number;
  let lose: number;
  if (finalBid === 56) {
    win = 4;
    lose = -5;
  } else if (finalBid >= 48) {
    win = 3;
    lose = -4;
  } else if (finalBid >= 40) {
    win = 2;
    lose = -3;
  } else {
    win = 1;
    lose = -2;
  }
  return contractMet ? win : lose;
}
