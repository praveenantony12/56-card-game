/**
 * Characterization: card-play behaviors that look wrong but are what the code
 * does today.
 *
 * READ THIS BEFORE EDITING. Nothing in this file is a confirmed rule of the
 * game. Each "CURRENT BEHAVIOR" test records what the server does now, so an
 * accidental change is noticed, and is paired with a skipped "DESIRED" test that
 * states the behavior that is almost certainly intended. When the behavior is
 * fixed: delete the CURRENT test, unskip the DESIRED one.
 *
 * Ids (S1, S2, ...) match the final report.
 */

import { PLAYER_NAMES, cardPlayGame, sixPlayers } from "../helpers/builders";
import { drop, liveGame, makeCore, seedGame, snapshot, useQuietConsole } from "../helpers/harness";
import { advanceTrick, useGameTimers } from "../helpers/timers";

useQuietConsole();
useGameTimers();

describe("S1: a card that is not in the player's hand", () => {
  const table = () => {
    const harness = makeCore();
    seedGame(harness, cardPlayGame());
    return harness;
  };

  test("CURRENT BEHAVIOR (S1): a leading player can put a card on the table that they do not hold", () => {
    const harness = table();
    const reply = drop(harness, 0, "2EQ");

    expect(reply.code).toBe("SUCCESS");
    expect(liveGame(harness).droppedCards).toEqual(["2EQ"]);
    expect(liveGame(harness)["tok-0"]).toEqual(["1HA", "1D9"]);
  });

  test.skip("DESIRED (S1): a card that is not in the player's hand is refused and nothing changes", () => {
    const harness = table();
    const before = snapshot(liveGame(harness));
    expect(drop(harness, 0, "2EQ").code).toBe("FAILED");
    expect(snapshot(liveGame(harness))).toEqual(before);
  });
});

describe("S2: a card with an invalid encoding", () => {
  const table = () => {
    const harness = makeCore();
    seedGame(harness, cardPlayGame());
    return harness;
  };

  test("CURRENT BEHAVIOR (S2): a leader can play a card string that is not in the deck at all", () => {
    const harness = table();
    expect(drop(harness, 0, "ZZZ").code).toBe("SUCCESS");
    expect(liveGame(harness).droppedCards).toEqual(["ZZZ"]);
  });

  test.skip("DESIRED (S2): a card that is not one of the 48 deck cards is refused", () => {
    const harness = table();
    const before = snapshot(liveGame(harness));
    expect(drop(harness, 0, "ZZZ").code).toBe("FAILED");
    expect(snapshot(liveGame(harness))).toEqual(before);
  });
});

describe("S3: playing after the hand is complete", () => {
  const finished = () => {
    const harness = makeCore();
    seedGame(
      harness,
      cardPlayGame({
        hands: [[], [], [], [], [], []],
        overrides: { isGameComplete: true, isGameCompleted: true },
      }),
    );
    return harness;
  };

  test("CURRENT BEHAVIOR (S3): the seat whose turn it is can still 'play' a card after completion", () => {
    const harness = finished();
    expect(drop(harness, 0, "1HA").code).toBe("SUCCESS");
    expect(liveGame(harness).droppedCards).toEqual(["1HA"]);
  });

  test.skip("DESIRED (S3): no card is accepted once the hand is complete", () => {
    const harness = finished();
    const before = snapshot(liveGame(harness));
    expect(drop(harness, 0, "1HA").code).toBe("FAILED");
    expect(snapshot(liveGame(harness))).toEqual(before);
  });
});

describe("S4: a rejected first card still changes the contract", () => {
  const unbid = () => {
    const harness = makeCore();
    seedGame(
      harness,
      cardPlayGame({
        overrides: { finalBid: undefined, trumpSuit: undefined, currentBet: "27", biddingPlayer: undefined },
      }),
    );
    return harness;
  };

  test("CURRENT BEHAVIOR (S4): an out-of-turn first card is refused but the default 28/no-trump contract is already written", () => {
    const harness = unbid();
    const reply = drop(harness, 3, "1DJ");

    expect(reply.code).toBe("FAILED");
    const game = liveGame(harness);
    expect(game.finalBid).toBe(28);
    expect(game.trumpSuit).toBe("N");
    expect(game.biddingPlayer).toBe(PLAYER_NAMES[3]);
  });

  test.skip("DESIRED (S4): a refused first card leaves the game exactly as it was", () => {
    const harness = unbid();
    const before = snapshot(liveGame(harness));
    expect(drop(harness, 3, "1DJ").code).toBe("FAILED");
    expect(snapshot(liveGame(harness))).toEqual(before);
  });
});

describe("S12: a player id that contains a hyphen", () => {
  // The trick is stored as "card-playerId" and split on "-", so a hyphenated id is cut short.
  const hyphenated = () => {
    const players = sixPlayers({ 2: { playerId: "Mary-Ann" } });
    const harness = makeCore();
    seedGame(harness, cardPlayGame({ players, hands: [["1H9"], ["1HK"], ["1HJ"], ["1HQ"], ["1H10"], ["1HA"]], trump: "D" }));
    ["1H9", "1HK", "1HJ", "1HQ", "1H10", "1HA"].forEach((card, seat) => drop(harness, seat, card));
    advanceTrick();
    return harness;
  };

  test("CURRENT BEHAVIOR (S12): the winning card of a hyphen-named player is not credited to them", () => {
    const harness = hyphenated();
    // 1HJ (seat 2, "Mary-Ann") is the strongest card, but it is skipped and the Nine of seat 0 is credited.
    expect(liveGame(harness).currentTurn).toBe(0);
  });

  test.skip("DESIRED (S12): the player holding the winning card wins the trick whatever their name", () => {
    const harness = hyphenated();
    expect(liveGame(harness).currentTurn).toBe(2);
  });
});

describe("S14: a paused game", () => {
  const paused = () => {
    const harness = makeCore();
    seedGame(harness, cardPlayGame({ overrides: { gamePaused: true } }));
    return harness;
  };

  test("CURRENT BEHAVIOR (S14): cards are still accepted while the game is flagged as paused", () => {
    const harness = paused();
    expect(drop(harness, 0, "1HA").code).toBe("SUCCESS");
  });

  test.skip("DESIRED (S14, if pause is meant to stop play): no card is accepted while the game is paused", () => {
    const harness = paused();
    const before = snapshot(liveGame(harness));
    expect(drop(harness, 0, "1HA").code).toBe("FAILED");
    expect(snapshot(liveGame(harness))).toEqual(before);
  });
});
