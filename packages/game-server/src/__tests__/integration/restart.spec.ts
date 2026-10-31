/**
 * Restarting a game: what is kept, what is reset, and how the starter rotates.
 *
 * A restart begins a new hand for the same table: same players in the same
 * seats, scores carried over, a fresh deal, bidding reopened with the next
 * seat clockwise as starter.
 */

import { IPlayer } from "../../core/models/IPlayer";
import { ALL_CARDS, GAME_ID, cardPlayGame, pilesWithTeamAPoints } from "../helpers/builders";
import { assertCardsConserved, assertSixUniquePlayers } from "../helpers/assertions";
import { Harness, bid, call, drop, emitsOf, liveGame, makeCore, seedGame, useQuietConsole } from "../helpers/harness";
import { advanceTrick, seedMathRandom, useGameTimers } from "../helpers/timers";
import { roundTimerPending } from "../helpers/privateAccess";

useQuietConsole();
useGameTimers();

let restoreRandom: () => void;
beforeEach(() => {
  restoreRandom = seedMathRandom(2024);
});
afterEach(() => {
  restoreRandom();
});

/** A finished hand: all 48 cards captured, scores 11 to 9, Ann was the starter. */
function finishedGame(overrides: { [field: string]: any } = {}): Harness {
  const piles = pilesWithTeamAPoints(30);
  const harness = makeCore();
  seedGame(
    harness,
    cardPlayGame({
      hands: [[], [], [], [], [], []],
      teamACards: piles.teamACards,
      teamBCards: piles.teamBCards,
      scores: [11, 9],
      overrides: { isGameComplete: true, isGameCompleted: true, finalBid: 28, ...overrides },
    }),
  );
  return harness;
}

function restart(harness: Harness, gameId: string = GAME_ID) {
  return call((cb) => harness.core.onRestartGame({ gameId } as any, cb));
}

describe("restart after a finished hand", () => {
  test("is accepted and names the next starter", () => {
    const harness = finishedGame();
    const reply = restart(harness);

    expect(reply.called).toBe(1);
    expect(reply.code).not.toBe("FAILED");
    expect(JSON.stringify(reply.res)).toContain('"newStarter":"Ben"');
  });

  test("a game that does not exist cannot be restarted", () => {
    const harness = finishedGame();
    const reply = restart(harness, "nope");
    expect(reply.code).toBe("FAILED");
    expect(reply.message).toBe("Game not found");
  });

  test("keeps the same six players in the same seats", () => {
    const harness = finishedGame();
    const before = liveGame(harness).players.map((p: IPlayer) => `${p.playerId}/${p.token}`);
    restart(harness);

    const game = liveGame(harness);
    assertSixUniquePlayers(game);
    expect(game.players.map((p: IPlayer) => `${p.playerId}/${p.token}`)).toEqual(before);
  });

  test("deals a fresh set of eight cards to each player from the full deck", () => {
    const harness = finishedGame();
    restart(harness);

    const game = liveGame(harness);
    game.players.forEach((p: IPlayer) => expect(game[p.token]).toHaveLength(8));
    assertCardsConserved(game, ALL_CARDS);
  });

  test("empties both capture piles and the table", () => {
    const harness = finishedGame();
    restart(harness);

    const game = liveGame(harness);
    expect(game.teamACards).toEqual([]);
    expect(game.teamBCards).toEqual([]);
    expect(game.droppedCards).toEqual([]);
    expect(game.dropDetails).toEqual([]);
    expect(game.dropCardPlayer).toEqual([]);
  });

  test("keeps the scores from the previous hand", () => {
    const harness = finishedGame();
    restart(harness);

    const game = liveGame(harness);
    expect(game.teamAScore).toBe(11);
    expect(game.teamBScore).toBe(9);
    expect(game.gameScore).toBe("-2");
  });

  test("reopens bidding with no contract, no trump and no bids", () => {
    const harness = finishedGame({ trumpSuit: "H", biddingTeam: "A", biddingPlayer: "Ann" });
    restart(harness);

    const game = liveGame(harness);
    expect(game.isBiddingPhase).toBe(true);
    expect(game.bidHistory).toEqual([]);
    expect(game.bidPassCount).toBe(0);
    expect(game.currentBet).toBe("27");
    expect(game.finalBid).toBeUndefined();
    expect(game.trumpSuit).toBeUndefined();
    expect(game.biddingTeam).toBeUndefined();
    expect(game.biddingPlayer).toBeUndefined();
    expect(game.bidRaisePhase).toBe(false);
    expect(game.postRaiseDoubleRound).toBe(false);
  });

  test("clears the completion flags and announces the reset to the room", () => {
    const harness = finishedGame();
    restart(harness);

    const game = liveGame(harness);
    expect(game.isGameComplete).toBe(false);
    expect(game.isGameCompleted).toBe(false);

    const resets = emitsOf(harness.emitted, "GAME_COMPLETE");
    expect(resets).toHaveLength(1);
    expect(resets[0].payload.payload.data).toMatchObject({ isGameComplete: false, teamAScore: 11, teamBScore: 9 });
  });

  test("keeps the one-time position-switch usage of each team", () => {
    const harness = finishedGame({ teamAPositionSwitchUsed: true, teamBPositionSwitchUsed: false });
    restart(harness);

    const game = liveGame(harness);
    expect(game.teamAPositionSwitchUsed).toBe(true);
    expect(game.teamBPositionSwitchUsed).toBe(false);
  });

  test("bidding can start straight away with a legal bid from the new starter", () => {
    const harness = finishedGame();
    restart(harness);

    const starter = liveGame(harness).currentTurn;
    expect(bid(harness, starter, "bid", { bidValue: 28, suit: "H" }).code).not.toBe("FAILED");
  });
});

describe("starter rotation", () => {
  test("the starter moves one seat clockwise on each restart", () => {
    const harness = finishedGame();
    const seen: string[] = [];
    for (let i = 0; i < 3; i++) {
      restart(harness);
      seen.push(liveGame(harness).startingPlayerId);
      // finish the hand again so the next restart begins from a finished game
      liveGame(harness).isGameComplete = true;
    }
    expect(seen).toEqual(["Ben", "Cal", "Dee"]);
  });

  test("the rotation wraps from the last seat back to seat 0", () => {
    const harness = finishedGame({ startingPlayerId: "Fay" });
    restart(harness);

    const game = liveGame(harness);
    expect(game.startingPlayerId).toBe("Ann");
    expect(game.currentTurn).toBe(0);
  });

  test("the new starter is the one to bid first and to lead the first trick", () => {
    const harness = finishedGame();
    restart(harness);

    const game = liveGame(harness);
    expect(game.currentTurn).toBe(1);
    expect(game.currentBiddingPlayerId).toBe("Ben");
    expect(game.startingPlayerId).toBe("Ben");
  });
});

describe("restart while a trick is waiting to be resolved", () => {
  test("cancels the pending resolution so it cannot touch the new hand", () => {
    const harness = makeCore();
    seedGame(
      harness,
      cardPlayGame({ hands: [["1HA"], ["1HK"], ["1H9"], ["1DJ"], ["1HJ"], ["1HQ"]], trump: "D" }),
    );
    ["1HA", "1HK", "1H9", "1DJ", "1HJ", "1HQ"].forEach((card, seat) => drop(harness, seat, card));
    expect(roundTimerPending(harness.core, GAME_ID)).toBe(true);

    restart(harness);
    expect(roundTimerPending(harness.core, GAME_ID)).toBe(false);

    advanceTrick();
    const game = liveGame(harness);
    expect(game.teamACards).toEqual([]);
    expect(game.teamBCards).toEqual([]);
    assertCardsConserved(game, ALL_CARDS);
  });
});
