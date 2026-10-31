/**
 * Game completion and scoring.
 *
 * Completion is reached when all 48 cards are in the two capture piles. The piles
 * are filled directly (fixtures: pilesWithTeamAPoints) and GameCore's completion
 * check is asked to run, so each tier and boundary is visible in one table row.
 * Full hands that reach completion through play are in scenarios/.
 *
 * The score tiers below are the CURRENT table (28-39: +1/-2, 40-47: +2/-3,
 * 48-55: +3/-4, 56: +4/-5, zero-sum for the other team). They are pinned as
 * current behavior; whether they are the intended house rules is a domain
 * question, and double/re-double multipliers are deliberately not asserted
 * (see characterization/ for the open issue).
 */

import { GAME_ID, cardPlayGame, pilesWithTeamAPoints } from "../helpers/builders";
import { assertPointsTotal56 } from "../helpers/assertions";
import {
  Harness,
  bid,
  emitsOf,
  expectRejectedWithoutMutation,
  liveGame,
  makeCore,
  seedGame,
  snapshot,
  useQuietConsole,
} from "../helpers/harness";
import { runCompletionCheck } from "../helpers/privateAccess";
import { pointsOf } from "../helpers/referenceRules";
import { useGameTimers } from "../helpers/timers";

useQuietConsole();
useGameTimers();

interface Setup {
  bid: number;
  biddingTeam: "A" | "B";
  teamAPoints: number;
  scores?: [number, number];
}

const EMPTY_HANDS: string[][] = [[], [], [], [], [], []];

function finishedHand(setup: Setup): Harness {
  const piles = pilesWithTeamAPoints(setup.teamAPoints);
  const harness = makeCore();
  seedGame(
    harness,
    cardPlayGame({
      hands: EMPTY_HANDS,
      bid: setup.bid,
      biddingSeat: setup.biddingTeam === "A" ? 0 : 1,
      teamACards: piles.teamACards,
      teamBCards: piles.teamBCards,
      scores: setup.scores || [10, 10],
    }),
  );
  return harness;
}

function complete(setup: Setup): { harness: Harness; game: any; payload: any } {
  const harness = finishedHand(setup);
  runCompletionCheck(harness.core, GAME_ID);
  const completions = emitsOf(harness.emitted, "GAME_COMPLETE");
  return { harness, game: liveGame(harness), payload: completions.length ? completions[0].payload.payload.data : undefined };
}

describe("score tiers: the bidding team's change when the contract is met or missed", () => {
  // bid, bidding team points when met, bidding team points when missed, win, lose
  const tiers: Array<[number, number, number, number]> = [
    [28, 28, 27, 1],
    [30, 30, 29, 1],
    [39, 39, 38, 1],
    [40, 40, 39, 2],
    [47, 47, 46, 2],
    [48, 48, 47, 3],
    [55, 55, 54, 3],
    [56, 56, 55, 4],
  ];
  const lose: { [bid: number]: number } = { 28: 2, 30: 2, 39: 2, 40: 3, 47: 3, 48: 4, 55: 4, 56: 5 };

  test.each(tiers.map((t) => [t[0], t[3]]).reduce((rows: any[], r: any) => rows.concat([[r[0], "A", r[1]], [r[0], "B", r[1]]]), []))(
    "a bid of %i by Team %s that is met gains %i for the bidders and costs the opponents the same",
    (finalBid: number, team: "A" | "B", gain: number) => {
      const points = tiers.filter((t) => t[0] === finalBid)[0][1];
      const teamAPoints = team === "A" ? points : 56 - points;
      const { game } = complete({ bid: finalBid, biddingTeam: team, teamAPoints });

      const bidders = team === "A" ? game.teamAScore : game.teamBScore;
      const opponents = team === "A" ? game.teamBScore : game.teamAScore;
      expect(bidders).toBe(10 + gain);
      expect(opponents).toBe(10 - gain);
    },
  );

  test.each(tiers.map((t) => [t[0]]).reduce((rows: any[], r: any) => rows.concat([[r[0], "A"], [r[0], "B"]]), []))(
    "a bid of %i by Team %s that is missed by one point costs the bidders and rewards the opponents",
    (finalBid: number, team: "A" | "B") => {
      const missed = tiers.filter((t) => t[0] === finalBid)[0][2];
      const teamAPoints = team === "A" ? missed : 56 - missed;
      const { game } = complete({ bid: finalBid, biddingTeam: team, teamAPoints });

      const bidders = team === "A" ? game.teamAScore : game.teamBScore;
      const opponents = team === "A" ? game.teamBScore : game.teamAScore;
      expect(bidders).toBe(10 - lose[finalBid]);
      expect(opponents).toBe(10 + lose[finalBid]);
    },
  );
});

describe("contract outcome boundary", () => {
  test("exactly the bid in points meets the contract", () => {
    const { payload } = complete({ bid: 30, biddingTeam: "A", teamAPoints: 30 });
    expect(payload.biddingTeamAchievedBid).toBe(true);
  });

  test("one point short of the bid misses the contract", () => {
    const { payload } = complete({ bid: 30, biddingTeam: "A", teamAPoints: 29 });
    expect(payload.biddingTeamAchievedBid).toBe(false);
  });

  test("more points than the bid meets the contract and the extra points do not change the score", () => {
    const { game, payload } = complete({ bid: 28, biddingTeam: "A", teamAPoints: 50 });
    expect(payload.biddingTeamAchievedBid).toBe(true);
    expect(game.teamAScore).toBe(11);
  });

  test("a bidding team holding every point meets any contract", () => {
    const { payload } = complete({ bid: 56, biddingTeam: "B", teamAPoints: 0 });
    expect(payload.biddingTeamAchievedBid).toBe(true);
    expect(payload.teamBPoints).toBe(56);
  });

  test("the points of the bidding team are measured from its own captured cards", () => {
    const { payload } = complete({ bid: 28, biddingTeam: "B", teamAPoints: 40 });
    expect(payload.teamAPoints).toBe(40);
    expect(payload.teamBPoints).toBe(16);
    expect(payload.biddingTeamAchievedBid).toBe(false);
  });
});

describe("score reset", () => {
  test("a score that would fall below zero resets both teams to 10 and says so", () => {
    const { game, payload } = complete({ bid: 28, biddingTeam: "A", teamAPoints: 20, scores: [1, 19] });
    expect(game.teamAScore).toBe(10);
    expect(game.teamBScore).toBe(10);
    expect(payload.scoreResetOccurred).toBe(true);
    expect(payload.winnerMessage).toContain("Score reset to 10-10");
  });

  test("a score that lands exactly on zero is kept", () => {
    const { game, payload } = complete({ bid: 28, biddingTeam: "A", teamAPoints: 20, scores: [2, 18] });
    expect(game.teamAScore).toBe(0);
    expect(game.teamBScore).toBe(20);
    expect(payload.scoreResetOccurred).toBe(false);
  });

  test("the reset also applies when the opponents would go negative after a met contract", () => {
    const { game, payload } = complete({ bid: 28, biddingTeam: "B", teamAPoints: 20, scores: [0, 20] });
    expect(payload.biddingTeamAchievedBid).toBe(true);
    expect(game.teamAScore).toBe(10);
    expect(game.teamBScore).toBe(10);
    expect(payload.scoreResetOccurred).toBe(true);
  });

  test("scores start from whatever the previous hands left, not from 10", () => {
    const { game } = complete({ bid: 28, biddingTeam: "A", teamAPoints: 30, scores: [14, 6] });
    expect(game.teamAScore).toBe(15);
    expect(game.teamBScore).toBe(5);
  });
});

describe("completion", () => {
  test("is announced exactly once, however often the check runs", () => {
    const harness = finishedHand({ bid: 28, biddingTeam: "A", teamAPoints: 30 });
    runCompletionCheck(harness.core, GAME_ID);
    runCompletionCheck(harness.core, GAME_ID);
    runCompletionCheck(harness.core, GAME_ID);

    expect(emitsOf(harness.emitted, "GAME_COMPLETE")).toHaveLength(1);
    expect(liveGame(harness).teamAScore).toBe(11);
    expect(liveGame(harness).teamBScore).toBe(9);
  });

  test("marks the game complete", () => {
    const { game } = complete({ bid: 28, biddingTeam: "A", teamAPoints: 30 });
    expect(game.isGameComplete).toBe(true);
    expect(game.isGameCompleted).toBe(true);
  });

  test("reports the contract, the points of both teams and the new scores", () => {
    const { payload } = complete({ bid: 40, biddingTeam: "B", teamAPoints: 20 });
    expect(payload).toMatchObject({
      isGameComplete: true,
      biddingTeam: "B",
      finalBid: 40,
      teamAPoints: 20,
      teamBPoints: 36,
      biddingTeamAchievedBid: false,
      teamAScore: 13,
      teamBScore: 7,
      scoreResetOccurred: false,
    });
    expect(typeof payload.winnerMessage).toBe("string");
  });

  test("names the bidder in the result message", () => {
    const won = complete({ bid: 28, biddingTeam: "A", teamAPoints: 30 }).payload.winnerMessage;
    expect(won).toContain("Ann's team wins");
    const lost = complete({ bid: 28, biddingTeam: "A", teamAPoints: 20 }).payload.winnerMessage;
    expect(lost).toContain("Ann's team loses");
  });

  test("the two piles always hold all 56 points", () => {
    [0, 14, 28, 29, 41, 56].forEach((teamAPoints) => {
      const { game } = complete({ bid: 28, biddingTeam: "A", teamAPoints });
      assertPointsTotal56(game);
      expect(pointsOf(game.teamACards)).toBe(teamAPoints);
    });
  });

  test("is not declared while any card is still in a hand or on the table", () => {
    const piles = pilesWithTeamAPoints(30);
    const harness = makeCore();
    const withheld = piles.teamBCards.pop() as string;
    seedGame(
      harness,
      cardPlayGame({
        hands: [[withheld], [], [], [], [], []],
        teamACards: piles.teamACards,
        teamBCards: piles.teamBCards,
      }),
    );
    runCompletionCheck(harness.core, GAME_ID);

    expect(emitsOf(harness.emitted, "GAME_COMPLETE")).toHaveLength(0);
    expect(liveGame(harness).isGameComplete).toBe(false);
    expect(liveGame(harness).teamAScore).toBe(10);
  });

  test("no bid is accepted once the game is complete", () => {
    const { harness } = complete({ bid: 28, biddingTeam: "A", teamAPoints: 30 });
    expectRejectedWithoutMutation(harness, () => bid(harness, 0, "bid", { bidValue: 28, suit: "H" }), {
      message: "Not in bidding phase",
    });
  });

  test("a completed game is left unchanged by a later completion check", () => {
    const { harness } = complete({ bid: 28, biddingTeam: "A", teamAPoints: 30 });
    const before = snapshot(liveGame(harness));
    runCompletionCheck(harness.core, GAME_ID);
    expect(snapshot(liveGame(harness))).toEqual(before);
  });
});
