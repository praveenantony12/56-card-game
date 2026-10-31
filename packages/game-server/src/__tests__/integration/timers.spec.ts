/**
 * Timer behavior on the virtual clock.
 *
 * Pacing of individual actions (trick resolution, bot moves, disconnect removal)
 * is asserted next to the feature in state/, integration/humanBot and
 * integration/connection. This file covers what only matters across timers:
 * a single resolution per trick, and a whole bot-only hand draining every timer.
 */

import { GAME_ID, cardPlayGame } from "../helpers/builders";
import { assertPointsTotal56 } from "../helpers/assertions";
import { drop, emitsOf, liveGame, makeCore, seedGame, useQuietConsole } from "../helpers/harness";
import { roundTimerPending } from "../helpers/privateAccess";
import { advanceTrick, advanceUntil, seedMathRandom, useGameTimers } from "../helpers/timers";

useQuietConsole();
useGameTimers();

describe("trick resolution timer", () => {
  const hands = [["1HA", "1D9"], ["1HK", "1DA"], ["1H9", "1D10"], ["1DJ", "1EA"], ["1HJ", "1EJ"], ["1HQ", "1CA"]];

  test("a rejected extra card after the sixth does not start a second resolution", () => {
    const harness = makeCore();
    seedGame(harness, cardPlayGame({ hands, trump: "D" }));
    ["1HA", "1HK", "1H9", "1DJ", "1HJ", "1HQ"].forEach((card, seat) => drop(harness, seat, card));

    const turn = liveGame(harness).currentTurn;
    const nextCard = liveGame(harness)[liveGame(harness).players[turn].token][0];
    expect(drop(harness, turn, nextCard).code).toBe("FAILED");
    advanceTrick();

    const won = emitsOf(harness.emitted, "DECK_WON_BY_TEAM_A").concat(emitsOf(harness.emitted, "DECK_WON_BY_TEAM_B"));
    expect(won).toHaveLength(1);
    expect(roundTimerPending(harness.core, GAME_ID)).toBe(false);
  });

  test("the timer slot is free again after resolution so the next trick gets its own timer", () => {
    const harness = makeCore();
    seedGame(harness, cardPlayGame({ hands, trump: "D" }));
    ["1HA", "1HK", "1H9", "1DJ", "1HJ", "1HQ"].forEach((card, seat) => drop(harness, seat, card));
    advanceTrick();
    expect(roundTimerPending(harness.core, GAME_ID)).toBe(false);

    const leader = liveGame(harness).currentTurn;
    ["1D9", "1DA", "1D10", "1EA", "1EJ", "1CA"].forEach((card, k) => {
      const seat = (leader + k) % 6;
      const hand = liveGame(harness)[liveGame(harness).players[seat].token];
      drop(harness, seat, hand[0]);
    });
    expect(roundTimerPending(harness.core, GAME_ID)).toBe(true);
    advanceTrick();
    expect(roundTimerPending(harness.core, GAME_ID)).toBe(false);
    expect(liveGame(harness).teamACards.length + liveGame(harness).teamBCards.length).toBe(12);
  });
});

describe("a hand played entirely by bots", () => {
  test("finishes on the virtual clock with every card played once, 56 points awarded and no work left", () => {
    const restore = seedMathRandom(4);
    try {
      const harness = makeCore();
      const bots = [0, 1, 2, 3, 4, 5].map((i) => ({
        playerId: `Bot${i}`,
        token: `bot-token-${i}`,
        socketId: `bot-socket-${i}`,
        gameId: GAME_ID,
        isBotAgent: true,
      }));
      harness.core.startGame(GAME_ID, bots, true);

      const elapsed = advanceUntil(() => !!liveGame(harness).isGameComplete, { stepMs: 250, maxMs: 30 * 60 * 1000 });
      expect(elapsed).toBeGreaterThan(0);

      const game = liveGame(harness);
      expect(game.teamACards.length + game.teamBCards.length).toBe(48);
      assertPointsTotal56(game);
      expect(new Set(game.teamACards.concat(game.teamBCards)).size).toBe(48);
      expect(emitsOf(harness.emitted, "GAME_COMPLETE")).toHaveLength(1);

      jest.advanceTimersByTime(120 * 1000);
      expect(emitsOf(harness.emitted, "GAME_COMPLETE")).toHaveLength(1);
      expect(roundTimerPending(harness.core, GAME_ID)).toBe(false);
    } finally {
      restore();
    }
  });
});
