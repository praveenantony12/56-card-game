/**
 * Self-test of the test oracle (helpers/referenceRules.ts).
 *
 * The scenarios and simulations trust the oracle, so it is pinned against the
 * hand-derived trick matrix and against literal rule tables before anything
 * relies on it.
 */

import { ALL_CARDS } from "../helpers/builders";
import { TRICK_MATRIX } from "../helpers/fixtures/trickMatrix";
import {
  Play,
  biddingTeamScoreChange,
  cardPoints,
  legalCards,
  pointsOf,
  rankStrength,
  teamOfSeat,
  trickWinner,
} from "../helpers/referenceRules";

const playsOf = (leader: number, cards: string[]): Play[] =>
  cards.map((card, k) => ({ seat: (leader + k) % 6, card }));

describe("reference rules oracle", () => {
  test.each(TRICK_MATRIX.map((row) => [row.name, row]))("trick winner: %s", (_name: string, row: any) => {
    const winner = trickWinner(playsOf(row.leader, row.cards), row.trump);
    expect(winner.card).toBe(row.winningCard);
    expect(winner.seat).toBe(row.winnerSeat);
  });

  test("the trick matrix covers both teams as winners", () => {
    const teams = TRICK_MATRIX.map((row) => teamOfSeat(row.winnerSeat));
    expect(teams).toContain("A");
    expect(teams).toContain("B");
  });

  test("every card in every matrix row is a real card and no card repeats within a row", () => {
    TRICK_MATRIX.forEach((row) => {
      row.cards.forEach((card) => expect(ALL_CARDS).toContain(card));
      expect(new Set(row.cards).size).toBe(6);
    });
  });

  test("an undefined trump behaves like no trump", () => {
    const plays = playsOf(0, ["1HK", "1DJ", "1H10", "1EJ", "1HQ", "1H9"]);
    expect(trickWinner(plays, undefined).card).toBe("1H9");
  });

  test("rank strength is J > 9 > A > 10 > K > Q", () => {
    const order = ["1HJ", "1H9", "1HA", "1H10", "1HK", "1HQ"].map(rankStrength);
    expect(order).toEqual(order.slice().sort((a, b) => b - a));
    expect(new Set(order).size).toBe(6);
  });

  test("the deck is worth 56 points and each rank has its value", () => {
    expect(pointsOf(ALL_CARDS)).toBe(56);
    expect(["1HJ", "1H9", "1HA", "1H10", "1HK", "1HQ"].map(cardPoints)).toEqual([3, 2, 1, 1, 0, 0]);
  });

  test("seats alternate Team A and Team B", () => {
    expect([0, 1, 2, 3, 4, 5].map(teamOfSeat)).toEqual(["A", "B", "A", "B", "A", "B"]);
  });

  describe("legal cards", () => {
    test("any card may lead", () => {
      expect(legalCards(["1HA", "1D9"])).toEqual(["1HA", "1D9"]);
    });

    test("a player holding the led suit must follow it", () => {
      expect(legalCards(["1HA", "1D9", "2HK"], "1HQ")).toEqual(["1HA", "2HK"]);
    });

    test("a player without the led suit may play anything", () => {
      expect(legalCards(["1DJ", "1EA"], "1HK")).toEqual(["1DJ", "1EA"]);
    });

    test("the copy digit is irrelevant to following suit", () => {
      expect(legalCards(["2HA", "1D9"], "1HK")).toEqual(["2HA"]);
    });
  });

  describe("current score-change table (tiers confirmed only as current behavior)", () => {
    test.each([
      [28, true, 1], [28, false, -2], [39, true, 1], [39, false, -2],
      [40, true, 2], [40, false, -3], [47, true, 2], [47, false, -3],
      [48, true, 3], [48, false, -4], [55, true, 3], [55, false, -4],
      [56, true, 4], [56, false, -5],
    ] as Array<[number, boolean, number]>)("bid %i, contract met %s: %i", (bid: number, met: boolean, change: number) => {
      expect(biddingTeamScoreChange(bid, met)).toBe(change);
    });
  });
});
