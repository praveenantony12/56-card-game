/**
 * Characterization: bidding behaviors that look wrong but are what the code does
 * today. See cardPlayLegacy.spec.ts for how CURRENT BEHAVIOR / DESIRED pairs work.
 * Nothing here is a confirmed rule of the game.
 */

import { GAME_ID, biddingGame, cardPlayGame, pilesWithTeamAPoints } from "../helpers/builders";
import { Harness, bid, emitsOf, liveGame, makeCore, seedGame, snapshot, useQuietConsole } from "../helpers/harness";
import { runCompletionCheck } from "../helpers/privateAccess";
import { useGameTimers } from "../helpers/timers";

useQuietConsole();
useGameTimers();

const bidding = (): Harness => {
  const harness = makeCore();
  seedGame(harness, biddingGame());
  return harness;
};

describe("S5: bidding out of turn", () => {
  test("CURRENT BEHAVIOR (S5): a seat that is not the current bidder can act, and the turn moves on from the real bidder", () => {
    const harness = bidding();
    const reply = bid(harness, 3, "pass");

    expect(reply.code).not.toBe("FAILED");
    expect(liveGame(harness).bidHistory[0].playerId).toBe("Dee");
    expect(liveGame(harness).currentBiddingPlayerId).toBe("Ben");
  });

  test.skip("DESIRED (S5): only the player whose turn it is to bid may act", () => {
    const harness = bidding();
    const before = snapshot(liveGame(harness));
    expect(bid(harness, 3, "pass").code).toBe("FAILED");
    expect(snapshot(liveGame(harness))).toEqual(before);
  });
});

describe("S6: bid values", () => {
  test("CURRENT BEHAVIOR (S6): a bid lower than the standing bid is accepted", () => {
    const harness = bidding();
    bid(harness, 0, "bid", { bidValue: 40, suit: "H" });
    expect(bid(harness, 1, "bid", { bidValue: 30, suit: "D" }).code).not.toBe("FAILED");
    expect(liveGame(harness).currentBet).toBe("30");
  });

  test("CURRENT BEHAVIOR (S6): a bid equal to the standing bid is accepted", () => {
    const harness = bidding();
    bid(harness, 0, "bid", { bidValue: 40, suit: "H" });
    expect(bid(harness, 1, "bid", { bidValue: 40, suit: "D" }).code).not.toBe("FAILED");
  });

  test("CURRENT BEHAVIOR (S6): a fractional bid and a numeric string are accepted", () => {
    expect(bid(bidding(), 0, "bid", { bidValue: 28.5, suit: "H" }).code).not.toBe("FAILED");
    expect(bid(bidding(), 0, "bid", { bidValue: "30", suit: "H" }).code).not.toBe("FAILED");
  });

  test.skip("DESIRED (S6, if bids must increase): a bid that does not beat the standing bid is refused", () => {
    const harness = bidding();
    bid(harness, 0, "bid", { bidValue: 40, suit: "H" });
    const before = snapshot(liveGame(harness));
    expect(bid(harness, 1, "bid", { bidValue: 30, suit: "D" }).code).toBe("FAILED");
    expect(snapshot(liveGame(harness))).toEqual(before);
  });

  test.skip("DESIRED (S6): a bid must be a whole number", () => {
    const harness = bidding();
    expect(bid(harness, 0, "bid", { bidValue: 28.5, suit: "H" }).code).toBe("FAILED");
  });
});

describe("S7: five passes by one seat", () => {
  test("CURRENT BEHAVIOR (S7): one seat passing five times in a row ends the bidding", () => {
    const harness = bidding();
    bid(harness, 0, "bid", { bidValue: 28, suit: "H" });
    for (let i = 0; i < 5; i++) bid(harness, 1, "pass");
    expect(liveGame(harness).bidRaisePhase).toBe(true);
  });

  test.skip("DESIRED (S7): bidding ends only when five different seats have passed", () => {
    const harness = bidding();
    bid(harness, 0, "bid", { bidValue: 28, suit: "H" });
    for (let i = 0; i < 5; i++) bid(harness, 1, "pass");
    expect(liveGame(harness).bidRaisePhase).toBeFalsy();
  });
});

describe("S8: double and re-double in the final score", () => {
  function finished(flags: { [field: string]: any }): Harness {
    const piles = pilesWithTeamAPoints(30);
    const harness = makeCore();
    seedGame(
      harness,
      cardPlayGame({
        hands: [[], [], [], [], [], []],
        bid: 28,
        teamACards: piles.teamACards,
        teamBCards: piles.teamBCards,
        overrides: flags,
      }),
    );
    runCompletionCheck(harness.core, GAME_ID);
    return harness;
  }

  test("CURRENT BEHAVIOR (S8): a doubled contract scores exactly like an undoubled one", () => {
    const plain = liveGame(finished({}));
    const doubled = liveGame(finished({ bidDouble: true }));
    const redoubled = liveGame(finished({ bidReDouble: true }));

    expect([doubled.teamAScore, doubled.teamBScore]).toEqual([plain.teamAScore, plain.teamBScore]);
    expect([redoubled.teamAScore, redoubled.teamBScore]).toEqual([plain.teamAScore, plain.teamBScore]);
    expect(emitsOf(finished({ bidDouble: true }).emitted, "GAME_COMPLETE")).toHaveLength(1);
  });

  test.skip("DESIRED (S8, factor to be confirmed): a doubled contract does not score the same as an undoubled one", () => {
    const plain = liveGame(finished({}));
    const doubled = liveGame(finished({ bidDouble: true }));
    expect([doubled.teamAScore, doubled.teamBScore]).not.toEqual([plain.teamAScore, plain.teamBScore]);
  });
});
