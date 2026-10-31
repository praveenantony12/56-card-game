/**
 * Golden bot decisions.
 *
 * These pin what TeamBotAgent chooses in fixed situations, and tie that
 * behavior to BOT_POLICY_VERSION. Training records are stamped with the version
 * so data from different policies is never mixed; this test is what makes the
 * stamp trustworthy.
 *
 * If a test here fails because you intentionally changed the bot:
 *   1. bump BOT_POLICY_VERSION in src/agents/botPolicyVersion.ts, AND
 *   2. update GOLDEN_FOR_VERSION and the expected values below.
 * If you did not intend to change the bot's behavior, fix the regression.
 */

import { BOT_POLICY_VERSION } from "../agents/botPolicyVersion";
import { ShadowEvaluator } from "../training/ShadowEvaluator";
import { GOLDEN_SCENARIOS } from "./helpers/golden-scenarios";

const GOLDEN_FOR_VERSION = "team-bot-agent@1";

const EXPECTED: { [name: string]: { card: string; strategy: string } } = {
  "lead with trump jack and ace as the bidder": { card: "1HJ", strategy: "HIGHEST_CARD_WIN" },
  "follow suit while a teammate is winning": { card: "1DK", strategy: "TEAMMATE_WINNING_NO_TRUMP_DISCARD" },
  "follow suit while an opponent is winning": { card: "1DJ", strategy: "HIGHEST_CARD_WIN" },
  "void in the led suit with trump available": { card: "1HK", strategy: "TRUMP_OPPORTUNITY" },
  "void in the led suit with no trump to play": { card: "2CQ", strategy: "DUCK_NO_WIN" },
  "last to play with points on the table": { card: "1DJ", strategy: "HIGHEST_CARD_WIN" },
  "lead late in the hand with few cards left": { card: "1DA", strategy: "HIGHEST_CARD_WIN" },
  "No-Trump (Noes) lead": { card: "1DJ", strategy: "HIGHEST_CARD_WIN" },
  "No-Trump (Noes) follow with a teammate winning": { card: "1HK", strategy: "TEAMMATE_WINNING" },
};

describe("bot policy golden decisions", () => {
  let log: jest.SpyInstance;
  beforeEach(() => {
    log = jest.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => log.mockRestore());

  test("the golden table was recorded for the current BOT_POLICY_VERSION", () => {
    expect(BOT_POLICY_VERSION).toBe(GOLDEN_FOR_VERSION);
  });

  test("every scenario has a pinned expectation and vice versa", () => {
    expect(GOLDEN_SCENARIOS.map((s) => s.name).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  GOLDEN_SCENARIOS.forEach((scenario) => {
    test(scenario.name, () => {
      const decision = new ShadowEvaluator().evaluate(scenario.state);
      const expected = EXPECTED[scenario.name];

      // A mismatch means the bot's behavior changed: see the note at the top
      // of this file (bump BOT_POLICY_VERSION and update the golden table).
      expect({ card: decision.card, strategy: decision.strategy }).toEqual(expected);
    });
  });

  test("decisions are repeatable", () => {
    GOLDEN_SCENARIOS.forEach((scenario) => {
      const evaluator = new ShadowEvaluator();
      expect(evaluator.evaluate(scenario.state).card).toBe(evaluator.evaluate(scenario.state).card);
    });
  });

  test("every pinned card is legal in its scenario", () => {
    GOLDEN_SCENARIOS.forEach((scenario) => {
      const { card } = EXPECTED[scenario.name];
      const led = scenario.state.currentTrick.length ? scenario.state.currentTrick[0].card[1] : null;
      const hand = scenario.state.hand;
      const mustFollow = led && hand.some((c) => c[1] === led);
      expect(hand).toContain(card);
      if (mustFollow) expect(card[1]).toBe(led);
    });
  });
});
