/**
 * Deck, card encoding, rank order and point values.
 *
 * Expectations here are literal tables written from the rules, not values read
 * back from the production constants, so a wrong constant is caught rather than
 * echoed. Randomness is always seeded.
 */

import { cardToWeightageDict, cardToWeightagePoints, names, suits } from "../../constants/deck";
import { Deck } from "../../utils/deck";
import { ALL_CARDS, COPIES, RANKS, SUIT_LETTERS } from "../helpers/builders";
import { RANK_ORDER_HIGH_TO_LOW, RANK_POINTS, cardPoints } from "../helpers/referenceRules";
import { seedMathRandom } from "../helpers/timers";

const deal = (seed: number): string[][] => {
  const restore = seedMathRandom(seed);
  try {
    return new Deck().getCardsForGame();
  } finally {
    restore();
  }
};

const flatten = (hands: string[][]): string[] => hands.reduce((all, hand) => all.concat(hand), [] as string[]);

describe("Deck composition", () => {
  test("a deal uses exactly 48 cards", () => {
    expect(flatten(deal(1))).toHaveLength(48);
  });

  test("every suit prefix and rank appears exactly once, giving 8 suits of 6 ranks", () => {
    const dealt = flatten(deal(2));
    const expected: string[] = [];
    COPIES.forEach((copy) =>
      SUIT_LETTERS.forEach((letter) => RANKS.forEach((rank) => expected.push(`${copy}${letter}${rank}`))),
    );
    expect(dealt.slice().sort()).toEqual(expected.sort());
  });

  test("the deck holds two copies of every rank in every suit letter", () => {
    const dealt = flatten(deal(3));
    SUIT_LETTERS.forEach((letter) =>
      RANKS.forEach((rank) => {
        const copies = dealt.filter((card) => card.charAt(1) === letter && card.slice(2) === rank);
        expect(copies.slice().sort()).toEqual([`1${letter}${rank}`, `2${letter}${rank}`]);
      }),
    );
  });

  test("the production suit and rank lists match the literal rules", () => {
    expect(suits.slice().sort()).toEqual(["1C", "1D", "1E", "1H", "2C", "2D", "2E", "2H"]);
    expect(names.slice().sort()).toEqual(RANKS.slice().sort());
  });

  test.each(ALL_CARDS.map((card) => [card]))("card %s follows the encoding: copy digit, suit letter, rank", (card: string) => {
    expect(["1", "2"]).toContain(card.charAt(0));
    expect(SUIT_LETTERS).toContain(card.charAt(1));
    expect(RANKS).toContain(card.slice(2));
  });
});

describe("Dealing", () => {
  test("six hands of eight cards", () => {
    const hands = deal(4);
    expect(hands).toHaveLength(6);
    hands.forEach((hand) => expect(hand).toHaveLength(8));
  });

  test.each([1, 2, 3, 5, 8, 13, 21, 34, 55, 89].map((seed) => [seed]))(
    "seed %i: every card is dealt to exactly one hand and none is invented or lost",
    (seed: number) => {
      const dealt = flatten(deal(seed));
      expect(new Set(dealt).size).toBe(48);
      expect(dealt.slice().sort()).toEqual(ALL_CARDS.slice().sort());
    },
  );

  test("many seeded deals each partition the deck", () => {
    for (let seed = 100; seed < 140; seed++) {
      const dealt = flatten(deal(seed));
      expect(dealt.slice().sort()).toEqual(ALL_CARDS.slice().sort());
    }
  });

  test("the same seed always produces the same deal", () => {
    expect(deal(77)).toEqual(deal(77));
  });

  test("shuffling keeps the same cards", () => {
    const restore = seedMathRandom(9);
    try {
      expect(new Deck().cardsShuffled.slice().sort()).toEqual(ALL_CARDS.slice().sort());
    } finally {
      restore();
    }
  });

  test("sorting a hand keeps every card and groups cards by suit letter", () => {
    const hand = deal(6)[0];
    const sorted = new Deck().sortCards(hand.slice());

    expect(sorted.slice().sort()).toEqual(hand.slice().sort());

    const seenSuits: string[] = [];
    sorted.forEach((card) => {
      const suit = card.charAt(1);
      if (seenSuits[seenSuits.length - 1] !== suit) {
        expect(seenSuits).not.toContain(suit);
        seenSuits.push(suit);
      }
    });
  });
});

describe("Rank order J > 9 > A > 10 > K > Q", () => {
  const pairs: string[][] = [];
  RANK_ORDER_HIGH_TO_LOW.forEach((higher, i) =>
    RANK_ORDER_HIGH_TO_LOW.slice(i + 1).forEach((lower) => pairs.push([higher, lower])),
  );

  test("the literal order lists all six ranks", () => {
    expect(RANK_ORDER_HIGH_TO_LOW.slice().sort()).toEqual(RANKS.slice().sort());
  });

  test.each(pairs)("%s outranks %s", (higher: string, lower: string) => {
    expect(cardToWeightageDict[higher]).toBeGreaterThan(cardToWeightageDict[lower]);
  });

  test("the production weights define a strict total order of six distinct values", () => {
    const weights = RANKS.map((rank) => cardToWeightageDict[rank]);
    expect(new Set(weights).size).toBe(6);
  });
});

describe("Card point values", () => {
  test.each([["J", 3], ["9", 2], ["A", 1], ["10", 1], ["K", 0], ["Q", 0]] as Array<[string, number]>)(
    "%s is worth %i points",
    (rank: string, points: number) => {
      expect(cardToWeightagePoints[rank]).toBe(points);
      expect(RANK_POINTS[rank]).toBe(points);
    },
  );

  test("the production table defines exactly the six ranks", () => {
    expect(Object.keys(cardToWeightagePoints).sort()).toEqual(RANKS.slice().sort());
  });

  test("the whole deck is worth exactly 56 points", () => {
    expect(ALL_CARDS.reduce((sum, card) => sum + cardPoints(card), 0)).toBe(56);
    expect(ALL_CARDS.reduce((sum, card) => sum + cardToWeightagePoints[card.slice(2)], 0)).toBe(56);
  });

  test("each of the four suit letters carries 14 points", () => {
    SUIT_LETTERS.forEach((letter) => {
      const points = ALL_CARDS.filter((card) => card.charAt(1) === letter).reduce(
        (sum, card) => sum + cardToWeightagePoints[card.slice(2)],
        0,
      );
      expect(points).toBe(14);
    });
  });
});
