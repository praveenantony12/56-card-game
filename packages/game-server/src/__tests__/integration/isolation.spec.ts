/**
 * Several games on one server must not see or change each other.
 *
 * Two games share one GameCore and one store; every action on one is checked
 * against an exact before/after snapshot of the other.
 */

import { ALL_CARDS, cardPlayGame, biddingGame, sixPlayers } from "../helpers/builders";
import { assertCardsConserved } from "../helpers/assertions";
import { Harness, bid, drop, liveGame, makeCore, seedGame, snapshot, useQuietConsole } from "../helpers/harness";
import { roundTimerPending } from "../helpers/privateAccess";
import { advanceTrick, useGameTimers } from "../helpers/timers";

useQuietConsole();
useGameTimers();

const A = "game-a";
const B = "game-b";

const playersOf = (prefix: string) =>
  sixPlayers().map((p, seat) => ({ ...p, token: `${prefix}-tok-${seat}`, socketId: `${prefix}-sock-${seat}`, gameId: prefix }));

const HANDS = [["1HA", "1D9"], ["1HK", "1DA"], ["1H9", "1D10"], ["1DJ", "1EA"], ["1HJ", "1EJ"], ["1HQ", "1CA"]];

function twoCardPlayGames(): Harness {
  const harness = makeCore();
  seedGame(harness, cardPlayGame({ players: playersOf("a"), hands: HANDS }), A);
  seedGame(harness, cardPlayGame({ players: playersOf("b"), hands: HANDS }), B);
  return harness;
}

describe("two games on one server", () => {
  test("a card played in one game does not touch the other", () => {
    const harness = twoCardPlayGames();
    const otherBefore = snapshot(liveGame(harness, B));

    expect(drop(harness, 0, "1HA", { gameId: A }).code).toBe("SUCCESS");

    expect(snapshot(liveGame(harness, B))).toEqual(otherBefore);
    expect(liveGame(harness, A).droppedCards).toEqual(["1HA"]);
  });

  test("a bid in one game does not touch the other", () => {
    const harness = makeCore();
    seedGame(harness, biddingGame({ players: playersOf("a") }), A);
    seedGame(harness, biddingGame({ players: playersOf("b") }), B);
    const otherBefore = snapshot(liveGame(harness, B));

    expect(bid(harness, 0, "bid", { bidValue: 30, suit: "D" }, A).code).not.toBe("FAILED");

    expect(snapshot(liveGame(harness, B))).toEqual(otherBefore);
  });

  test("the two games can have different turns, tricks and bids at the same time", () => {
    const harness = twoCardPlayGames();
    drop(harness, 0, "1HA", { gameId: A });
    drop(harness, 1, "1HK", { gameId: A });
    drop(harness, 0, "1D9", { gameId: B });

    expect(liveGame(harness, A).currentTurn).toBe(2);
    expect(liveGame(harness, B).currentTurn).toBe(1);
  });

  test("a player token from one game has no standing in another", () => {
    const harness = twoCardPlayGames();
    const before = snapshot(liveGame(harness, B));
    const foreign = liveGame(harness, A).players[0].token;

    const reply = drop(harness, 0, "1HA", { gameId: B, token: foreign });
    expect(reply.code).toBe("FAILED");
    expect(snapshot(liveGame(harness, B))).toEqual(before);
  });

  test("each game resolves its own trick on its own timer", () => {
    const harness = twoCardPlayGames();
    const full = ["1HA", "1HK", "1H9", "1DJ", "1HJ", "1HQ"];
    full.forEach((card, seat) => drop(harness, seat, card, { gameId: A }));
    expect(roundTimerPending(harness.core, A)).toBe(true);
    expect(roundTimerPending(harness.core, B)).toBe(false);

    advanceTrick();
    expect(liveGame(harness, A).teamBCards.length + liveGame(harness, A).teamACards.length).toBe(6);
    expect(liveGame(harness, B).teamACards).toEqual([]);
    expect(liveGame(harness, B).teamBCards).toEqual([]);
  });

  test("both games resolve independently when their tricks finish together", () => {
    const harness = twoCardPlayGames();
    const full = ["1HA", "1HK", "1H9", "1DJ", "1HJ", "1HQ"];
    full.forEach((card, seat) => drop(harness, seat, card, { gameId: A }));
    full.forEach((card, seat) => drop(harness, seat, card, { gameId: B }));
    advanceTrick();

    [A, B].forEach((id) => {
      const game = liveGame(harness, id);
      expect(game.teamACards.length + game.teamBCards.length).toBe(6);
      expect(game.dropDetails).toEqual([]);
      expect(roundTimerPending(harness.core, id)).toBe(false);
    });
  });

  test("restarting one game leaves the other alone", () => {
    const harness = twoCardPlayGames();
    const otherBefore = snapshot(liveGame(harness, B));
    harness.core.onRestartGame({ gameId: A } as any, () => {});

    expect(snapshot(liveGame(harness, B))).toEqual(otherBefore);
    assertCardsConserved(liveGame(harness, A), ALL_CARDS);
  });

  test("deleting one game leaves the other in the store", () => {
    const harness = twoCardPlayGames();
    harness.store.deleteGame(A);
    expect(liveGame(harness, A)).toBeUndefined();
    expect(liveGame(harness, B)).toBeDefined();
    expect(harness.store.count).toBe(1);
  });

  test("events are addressed to the room of the game they belong to", () => {
    const harness = twoCardPlayGames();
    drop(harness, 0, "1HA", { gameId: A });
    expect(harness.emitted.length).toBeGreaterThan(0);
    expect(harness.emitted.every((e) => e.room === A)).toBe(true);
  });
});
