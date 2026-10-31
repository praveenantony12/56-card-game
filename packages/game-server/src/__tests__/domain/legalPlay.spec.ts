/**
 * Legal card play: the follow-suit rule, as implemented by each of the three
 * places that decide it, checked against the independent oracle.
 *
 *   1. utils/misc.isCardAvail          (helper used by the server's cheat check)
 *   2. Game.isCheating                 (what GameCore.onDropCard enforces)
 *   3. TeamBotAgent.getLegalMoves      (what bots choose from)
 *
 * The three must never drift: a bot must never choose a card the server
 * rejects, and the server must never reject a card a human may legally play.
 */

import { Game } from "../../core/Game";
import { isCardAvail } from "../../utils/misc";
import { ALL_CARDS, GAME_ID, cardPlayGame, sixPlayers } from "../helpers/builders";
import { makeCore, seedGame, useQuietConsole } from "../helpers/harness";
import { botLegalMoves } from "../helpers/privateAccess";
import { legalCards } from "../helpers/referenceRules";
import { mulberry32 } from "../helpers/timers";

useQuietConsole();

/** Does the server's cheat check accept `card` for `hand` against `led`? */
function serverAccepts(hand: string[], led: string, card: string): boolean {
  const harness = makeCore();
  const hands = [["1HA"], hand, ["1HK"], ["1HQ"], ["1H10"], ["1H9"]];
  seedGame(harness, cardPlayGame({ hands, trick: [[0, led]], leader: 0 }));
  const players = sixPlayers();
  return !new Game(harness.store, GAME_ID, card, players[1].token).isCheating;
}

describe("isCardAvail (suit-availability helper)", () => {
  test.each([
    ["a null led card means nothing to follow, so the answer is yes", null, ["1D9"], true],
    ["the hand holds a card of the led suit", "1HK", ["1D9", "2HA"], true],
    ["the hand holds no card of the led suit", "1HK", ["1D9", "1EA"], false],
    ["an empty hand holds no card of the led suit", "1HK", [], false],
    ["the copy digit is irrelevant", "2HK", ["1HA"], true],
    ["the rank is irrelevant", "1H9", ["1HQ"], true],
  ] as Array<[string, string | null, string[], boolean]>)("%s", (_name: string, led: any, hand: string[], expected: boolean) => {
    expect(isCardAvail(led, hand)).toBe(expected);
  });
});

describe("follow-suit rule enforced by the server (Game.isCheating)", () => {
  const hand = ["1HA", "2HK", "1D9", "1EJ"];

  test.each([
    ["1HA", true],
    ["2HK", true],
    ["1D9", false],
    ["1EJ", false],
  ] as Array<[string, boolean]>)("holding hearts and diamonds, led a heart: playing %s is legal=%s", (card: string, legal: boolean) => {
    expect(serverAccepts(hand, "1HQ", card)).toBe(legal);
  });

  test.each(["1HA", "2HK", "1D9", "1EJ"])("a hand with no clubs may play %s on a club lead", (card: string) => {
    expect(serverAccepts(hand, "1CQ", card)).toBe(true);
  });

  test("a trump card is not exempt from following the led suit while the hand still holds it", () => {
    // Led hearts, trump is diamonds: the hand holds hearts, so a trump is illegal.
    expect(serverAccepts(hand, "1HQ", "1D9")).toBe(false);
  });

  test("leading, any card of the hand is accepted by the cheat check", () => {
    const harness = makeCore();
    seedGame(harness, cardPlayGame({ hands: [hand, ["1HK"], ["1HQ"], ["1H10"], ["1H9"], ["1HJ"]], trick: [] }));
    hand.forEach((card) => {
      expect(new Game(harness.store, GAME_ID, card, sixPlayers()[0].token).isCheating).toBe(false);
    });
  });
});

describe("legal-move agreement between the server, the bot and the oracle", () => {
  test("a mid-trick hand: all three agree on exactly which cards are legal", () => {
    const hand = ["1HA", "2HK", "1D9", "1EJ"];
    const game: any = cardPlayGame({
      hands: [["1HA"], hand, ["1HK"], ["1HQ"], ["1H10"], ["1H9"]],
      trick: [[0, "1HQ"]],
      leader: 0,
    });
    const botSees = botLegalMoves(game, sixPlayers()[1].token).slice().sort();
    expect(botSees).toEqual(legalCards(hand, "1HQ").sort());
    expect(botSees).toEqual(["1HA", "2HK"]);
  });

  test("on a lead the bot may choose any card in its hand", () => {
    const hand = ["1HA", "2HK", "1D9", "1EJ"];
    const game: any = cardPlayGame({ hands: [hand, ["1HK"], ["1HQ"], ["1H10"], ["1H9"], ["1HJ"]], trick: [] });
    expect(botLegalMoves(game, sixPlayers()[0].token)).toEqual(hand);
  });

  test("a bot with no cards has no legal move", () => {
    const game: any = cardPlayGame({ hands: [[], ["1HK"], ["1HQ"], ["1H10"], ["1H9"], ["1HJ"]], trick: [] });
    expect(botLegalMoves(game, sixPlayers()[0].token)).toEqual([]);
  });

  test("seeded random hands and leads: the three implementations never disagree", () => {
    const random = mulberry32(5600);
    let comparisons = 0;

    for (let round = 0; round < 150; round++) {
      const deck = ALL_CARDS.slice();
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        const tmp = deck[i];
        deck[i] = deck[j];
        deck[j] = tmp;
      }
      const led = deck[0];
      const hand = deck.slice(1, 1 + 1 + Math.floor(random() * 8));
      const expectedLegal = legalCards(hand, led).sort();

      const game: any = cardPlayGame({
        hands: [["1HA"], hand, ["1HK"], ["1HQ"], ["1H10"], ["1H9"]],
        trick: [[0, led]],
        leader: 0,
      });
      const botLegal = botLegalMoves(game, sixPlayers()[1].token).slice().sort();
      expect(botLegal).toEqual(expectedLegal);

      hand.forEach((card) => {
        const serverSays = serverAccepts(hand, led, card);
        expect(serverSays).toBe(expectedLegal.indexOf(card) !== -1);
        comparisons++;
      });
    }
    expect(comparisons).toBeGreaterThan(300);
  });
});
