/**
 * Resolving a trick: who wins, who leads next, and where the cards go.
 *
 * The 24-row matrix in fixtures/trickMatrix.ts holds hand-derived winners. Each
 * row is played through the public onDropCard path, the five-second trick timer
 * is advanced on fake timers, and the outcome is compared both with the literal
 * expectation and with the independent oracle.
 */

import { GAME_ID, cardPlayGame } from "../helpers/builders";
import { TRICK_MATRIX, TrickRow } from "../helpers/fixtures/trickMatrix";
import { Harness, drop, emitsOf, liveGame, makeCore, seedGame, useQuietConsole } from "../helpers/harness";
import { Play, pointsOf, teamOfSeat, trickWinner } from "../helpers/referenceRules";
import { roundTimerPending } from "../helpers/privateAccess";
import { TRICK_RESOLUTION_MS, advanceTrick, useGameTimers } from "../helpers/timers";

useQuietConsole();
useGameTimers();

/** Each seat holds only the card the row has it play, so every play is legal. */
function playRow(row: TrickRow): Harness {
  const hands: string[][] = [[], [], [], [], [], []];
  const plays: Play[] = row.cards.map((card, k) => ({ seat: (row.leader + k) % 6, card }));
  plays.forEach((play) => hands[play.seat].push(play.card));

  const harness = makeCore();
  seedGame(harness, cardPlayGame({ hands, trump: row.trump, leader: row.leader }));
  plays.forEach((play) => expect(drop(harness, play.seat, play.card).code).toBe("SUCCESS"));
  return harness;
}

describe("trick winner matrix", () => {
  test.each(TRICK_MATRIX.map((row) => [row.name, row]))("%s", (_name: string, row: any) => {
    const harness = playRow(row);
    advanceTrick();

    const game = liveGame(harness);
    const winningTeam = teamOfSeat(row.winnerSeat);
    const winnersPile = winningTeam === "A" ? game.teamACards : game.teamBCards;
    const otherPile = winningTeam === "A" ? game.teamBCards : game.teamACards;

    expect(game.currentTurn).toBe(row.winnerSeat);
    expect(game.roundWinnerTeam).toBe(winningTeam);
    expect(winnersPile.slice().sort()).toEqual(row.cards.slice().sort());
    expect(otherPile).toEqual([]);

    const oracle = trickWinner(
      row.cards.map((card: string, k: number) => ({ seat: (row.leader + k) % 6, card })),
      row.trump,
    );
    expect(oracle.seat).toBe(row.winnerSeat);
    expect(oracle.card).toBe(row.winningCard);
  });
});

describe("after a trick is resolved", () => {
  const ROW: TrickRow = TRICK_MATRIX[1]; // seat 2 wins with a trump

  test("nothing is resolved before the five seconds are up", () => {
    const harness = playRow(ROW);
    jest.advanceTimersByTime(TRICK_RESOLUTION_MS - 1);

    const game = liveGame(harness);
    expect(game.teamACards).toEqual([]);
    expect(game.teamBCards).toEqual([]);
    expect(game.dropDetails).toHaveLength(6);
    expect(roundTimerPending(harness.core, GAME_ID)).toBe(true);
  });

  test("the table is cleared, the timer is gone and the round winner is announced once", () => {
    const harness = playRow(ROW);
    advanceTrick();

    const game = liveGame(harness);
    expect(game.dropDetails).toEqual([]);
    expect(game.dropCardPlayer).toEqual([]);
    expect(game.droppedCards).toEqual([]);
    expect(roundTimerPending(harness.core, GAME_ID)).toBe(false);

    const wins = emitsOf(harness.emitted, "DECK_WON_BY_TEAM_A").concat(emitsOf(harness.emitted, "DECK_WON_BY_TEAM_B"));
    expect(wins).toHaveLength(1);
    expect(wins[0].payload.payload.data.roundWinnerTeam).toBe("A");
  });

  test("waiting longer never resolves the same trick twice", () => {
    const harness = playRow(ROW);
    advanceTrick();
    const after = JSON.stringify(liveGame(harness));
    jest.advanceTimersByTime(TRICK_RESOLUTION_MS * 10);
    expect(JSON.stringify(liveGame(harness))).toBe(after);
  });

  test("the winner is announced as the next player to play", () => {
    const harness = playRow(ROW);
    advanceTrick();
    const turns = emitsOf(harness.emitted, "TURN_INFO");
    expect(turns[turns.length - 1].payload.payload.data.currentPlayerId).toBe("Cal");
  });

  test("captured points are counted for the team that won the trick", () => {
    const harness = playRow(ROW);
    advanceTrick();
    // 1HJ(3) 1H9(2) 1DQ(0) 1HA(1) 1HK(0) 1H10(1)
    expect(pointsOf(liveGame(harness).teamACards)).toBe(7);
  });
});

describe("leading the next trick", () => {
  const hands = [
    ["1HA", "1D9"],
    ["1HK", "1DA"],
    ["1H9", "1D10"],
    ["1HJ", "1DJ"],
    ["1HQ", "1DK"],
    ["1H10", "1DQ"],
  ];

  function afterFirstTrick(): Harness {
    const harness = makeCore();
    seedGame(harness, cardPlayGame({ hands, trump: "D", leader: 0 }));
    ["1HA", "1HK", "1H9", "1HJ", "1HQ", "1H10"].forEach((card, seat) => drop(harness, seat, card));
    advanceTrick();
    return harness;
  }

  test("the winner of the previous trick leads and the others cannot", () => {
    const harness = afterFirstTrick();
    // 1HJ played by seat 3 wins.
    expect(liveGame(harness).currentTurn).toBe(3);
    expect(drop(harness, 0, "1D9").code).toBe("FAILED");
    expect(drop(harness, 3, "1DJ").code).toBe("SUCCESS");
  });

  test("the second trick is resolved the same way and captured cards accumulate", () => {
    const harness = afterFirstTrick();
    // Seat 3 leads 1DJ (a trump lead); everyone else holds a diamond and must follow.
    drop(harness, 3, "1DJ");
    drop(harness, 4, "1DK");
    drop(harness, 5, "1DQ");
    drop(harness, 0, "1D9");
    drop(harness, 1, "1DA");
    drop(harness, 2, "1D10");
    advanceTrick();

    const game = liveGame(harness);
    // 1DJ (seat 3) is the highest diamond, so Team B wins both tricks.
    expect(game.currentTurn).toBe(3);
    expect(game.teamBCards).toHaveLength(12);
    expect(game.teamACards).toEqual([]);
    expect(game.roundWinnerTeam).toBe("B");
  });
});
