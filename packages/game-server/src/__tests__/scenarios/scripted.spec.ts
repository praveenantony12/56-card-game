/**
 * Complete deterministic hands, from the first bid to the final score.
 *
 * Each scenario is a hand-written deal with every bid and every trick spelled
 * out in fixtures/scenarios.ts. The game is driven only through its public
 * handlers (onBiddingAction, onDropCard) and the trick timer on a fake clock, and
 * after every action the whole table is checked: all 48 cards accounted for,
 * six distinct players, the turn where it should be, no card played twice.
 *
 * Every trick winner is verified three ways: against the literal in the fixture,
 * against the independent oracle, and against what the game really did.
 *
 * Precondition shared by all scenarios: the starter seat (seat 0) leads the
 * first trick, whoever won the bid. Whether the bid winner should lead instead
 * is an open domain question (see the final report); if that rule is ever
 * changed these scenarios will fail loudly at the first-lead check.
 */

import { ALL_CARDS, GAME_ID, PLAYER_NAMES, biddingGame } from "../helpers/builders";
import { SCENARIOS, ScenarioDef } from "../helpers/fixtures/scenarios";
import {
  assertCardsConserved,
  assertPointsTotal56,
  assertSixUniquePlayers,
} from "../helpers/assertions";
import {
  Harness,
  bid,
  drop,
  emitsOf,
  expectRejectedWithoutMutation,
  liveGame,
  makeCore,
  seedGame,
  useQuietConsole,
} from "../helpers/harness";
import { roundTimerPending } from "../helpers/privateAccess";
import { pointsOf, teamOfSeat, trickWinner } from "../helpers/referenceRules";
import { advanceTrick, useGameTimers } from "../helpers/timers";

useQuietConsole();
useGameTimers();

function runBidding(harness: Harness, scenario: ScenarioDef): void {
  scenario.bidding.forEach((step, index) => {
    const fields: any = {};
    if (step.bidValue !== undefined) fields.bidValue = step.bidValue;
    if (step.suit !== undefined) fields.suit = step.suit;
    const reply = bid(harness, step.seat, step.action, fields);
    expect({ step: index, code: reply.code }).not.toEqual({ step: index, code: "FAILED" });
    assertSixUniquePlayers(liveGame(harness));
  });
}

function playTrick(harness: Harness, trickIndex: number, scenario: ScenarioDef, pilesBefore: { a: number; b: number }) {
  const trick = scenario.tricks[trickIndex];
  expect(liveGame(harness).currentTurn).toBe(trick.leader);
  expect(liveGame(harness).dropDetails).toEqual([]);

  trick.cards.forEach((card, k) => {
    const seat = (trick.leader + k) % 6;
    const game = liveGame(harness);
    expect(game.currentTurn).toBe(seat);
    expect(game[game.players[seat].token]).toContain(card);

    const reply = drop(harness, seat, card);
    expect({ trick: trickIndex, card, code: reply.code }).toEqual({ trick: trickIndex, card, code: "SUCCESS" });

    expect(liveGame(harness).dropDetails).toHaveLength(k + 1);
    assertCardsConserved(liveGame(harness), ALL_CARDS);
    assertSixUniquePlayers(liveGame(harness));
  });

  // Six cards, one resolution pending, nothing resolved yet.
  expect(liveGame(harness).dropDetails).toHaveLength(6);
  expect(roundTimerPending(harness.core, GAME_ID)).toBe(true);

  // Winner by three independent means.
  const oracle = trickWinner(
    trick.cards.map((card, k) => ({ seat: (trick.leader + k) % 6, card })),
    scenario.expected.trump,
  );
  expect(oracle).toEqual({ seat: trick.winnerSeat, card: trick.winningCard });
  expect(pointsOf(trick.cards)).toBe(trick.points);
  expect(teamOfSeat(trick.winnerSeat)).toBe(trick.team);

  advanceTrick();

  const game = liveGame(harness);
  expect(roundTimerPending(harness.core, GAME_ID)).toBe(false);
  expect(game.dropDetails).toEqual([]);
  expect(game.currentTurn).toBe(trick.winnerSeat);
  expect(game.roundWinnerTeam).toBe(trick.team);
  expect(game.teamACards.length - pilesBefore.a).toBe(trick.team === "A" ? 6 : 0);
  expect(game.teamBCards.length - pilesBefore.b).toBe(trick.team === "B" ? 6 : 0);
  assertCardsConserved(game, ALL_CARDS);
}

describe.each(SCENARIOS.map((scenario) => [scenario.name, scenario]))("%s", (_name: string, scenario: any) => {
  const s: ScenarioDef = scenario;
  let harness: Harness;

  beforeEach(() => {
    harness = makeCore();
    seedGame(harness, biddingGame({ hands: s.hands }));
  });

  test("starts from a valid table: six unique players, alternating teams, 48 distinct cards", () => {
    const game = liveGame(harness);
    assertSixUniquePlayers(game);
    assertCardsConserved(game, ALL_CARDS);
    game.players.forEach((p: any, seat: number) => {
      expect(game[p.token]).toHaveLength(8);
      expect(teamOfSeat(seat)).toBe(seat % 2 === 0 ? "A" : "B");
    });
  });

  test("bidding reaches the scripted contract", () => {
    runBidding(harness, s);

    const game = liveGame(harness);
    expect(game.isBiddingPhase).toBe(false);
    expect(game.finalBid).toBe(s.expected.finalBid);
    expect(game.trumpSuit).toBe(s.expected.trump);
    expect(game.biddingTeam).toBe(s.expected.biddingTeam);
    expect(game.biddingPlayer).toBe(PLAYER_NAMES[s.expected.biddingSeat]);
    expect(emitsOf(harness.emitted, "biddingPhaseEnd")).toHaveLength(1);
  });

  test("the first trick is led by the starter seat", () => {
    runBidding(harness, s);
    expect(liveGame(harness).currentTurn).toBe(s.tricks[0].leader);
  });

  test("all eight tricks play out legally with the scripted winners and the winner leading next", () => {
    runBidding(harness, s);
    const piles = { a: 0, b: 0 };
    s.tricks.forEach((trick, index) => {
      playTrick(harness, index, s, { ...piles });
      if (trick.team === "A") piles.a += 6;
      else piles.b += 6;
      const game = liveGame(harness);
      game.players.forEach((p: any) => expect(game[p.token]).toHaveLength(8 - (index + 1)));
    });

    const game = liveGame(harness);
    expect(game.teamACards).toHaveLength(piles.a);
    expect(game.teamBCards).toHaveLength(piles.b);
    assertPointsTotal56(game);
  });

  test("the final points, contract result and score are as scripted, and completion is announced exactly once", () => {
    runBidding(harness, s);
    s.tricks.forEach((trick, index) => {
      const game = liveGame(harness);
      playTrick(harness, index, s, { a: game.teamACards.length, b: game.teamBCards.length });
    });

    const game = liveGame(harness);
    expect(pointsOf(game.teamACards)).toBe(s.expected.teamAPoints);
    expect(pointsOf(game.teamBCards)).toBe(s.expected.teamBPoints);
    expect(s.expected.teamAPoints + s.expected.teamBPoints).toBe(56);

    const completions = emitsOf(harness.emitted, "GAME_COMPLETE");
    expect(completions).toHaveLength(1);
    expect(completions[0].payload.payload.data).toMatchObject({
      isGameComplete: true,
      biddingTeam: s.expected.biddingTeam,
      finalBid: s.expected.finalBid,
      teamAPoints: s.expected.teamAPoints,
      teamBPoints: s.expected.teamBPoints,
      biddingTeamAchievedBid: s.expected.contractMet,
      teamAScore: s.expected.teamAScore,
      teamBScore: s.expected.teamBScore,
      scoreResetOccurred: s.expected.scoreResetOccurred,
    });
    expect(game.teamAScore).toBe(s.expected.teamAScore);
    expect(game.teamBScore).toBe(s.expected.teamBScore);
    expect(game.isGameComplete).toBe(true);
  });

  test("after completion nothing more is accepted from the table and nothing fires again", () => {
    runBidding(harness, s);
    s.tricks.forEach((trick, index) => {
      const game = liveGame(harness);
      playTrick(harness, index, s, { a: game.teamACards.length, b: game.teamBCards.length });
    });

    const lastWinner = s.tricks[s.tricks.length - 1].winnerSeat;
    expectRejectedWithoutMutation(harness, () => bid(harness, 0, "bid", { bidValue: 28, suit: "H" }), {
      message: "Not in bidding phase",
    });
    [0, 1, 2, 3, 4, 5]
      .filter((seat) => seat !== lastWinner)
      .forEach((seat) => {
        expectRejectedWithoutMutation(harness, () => drop(harness, seat, "1HA"), { message: "Its not your turn!!" });
      });

    jest.advanceTimersByTime(120000);
    expect(emitsOf(harness.emitted, "GAME_COMPLETE")).toHaveLength(1);
    expect(roundTimerPending(harness.core, GAME_ID)).toBe(false);
  });
});
