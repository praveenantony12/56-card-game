/**
 * Playing cards through GameCore.onDropCard: turn order, following suit,
 * duplicate copies, and what each accepted play changes.
 *
 * Hands are small and explicit (two cards per seat) so each test shows exactly
 * why a card is legal or not.
 */

import { GAME_ID, SMALL_HANDS, cardPlayGame } from "../helpers/builders";
import { cardsInPlay } from "../helpers/assertions";
import {
  Harness,
  actionsOf,
  drop,
  emitsOf,
  expectRejectedWithoutMutation,
  liveGame,
  makeCore,
  seedGame,
  useQuietConsole,
} from "../helpers/harness";
import { TRICK_RESOLUTION_MS, useGameTimers } from "../helpers/timers";
import { roundTimerPending } from "../helpers/privateAccess";

useQuietConsole();
useGameTimers();

function table(options: Parameters<typeof cardPlayGame>[0] = {}): Harness {
  const harness = makeCore();
  seedGame(harness, cardPlayGame(options));
  return harness;
}

describe("an accepted card", () => {
  test("is removed from the hand and appended to the trick as card-and-player", () => {
    const harness = table();
    const reply = drop(harness, 0, "1D9");

    expect(reply.called).toBe(1);
    expect(reply.code).toBe("SUCCESS");
    const game = liveGame(harness);
    expect(game["tok-0"]).toEqual(["1HA"]);
    expect(game.droppedCards).toEqual(["1D9"]);
    expect(game.dropDetails).toEqual(["1D9"]);
    expect(game.dropCardPlayer).toEqual(["1D9-Ann"]);
  });

  test("passes the turn to the next seat", () => {
    const harness = table();
    drop(harness, 0, "1HA");
    expect(liveGame(harness).currentTurn).toBe(1);
  });

  test("is announced to the room and followed by a turn notification", () => {
    const harness = table();
    drop(harness, 0, "1HA");

    const actions = actionsOf(harness.emitted);
    expect(actions).toContain("DROP_CARD_PLAYER");
    expect(actions).toContain("DROPPED_CARDS");
    expect(actions).toContain("TURN_INFO");
    const turn = emitsOf(harness.emitted, "TURN_INFO")[0];
    expect(turn.payload.payload.data).toMatchObject({ currentPlayerId: "Ben" });
  });

  test("keeps every card accounted for", () => {
    const harness = table();
    const universe = cardsInPlay(liveGame(harness)).sort();
    drop(harness, 0, "1D9");
    drop(harness, 1, "1HK");
    expect(cardsInPlay(liveGame(harness)).sort()).toEqual(universe);
  });
});

describe("turn order", () => {
  test("seats play in order and the turn wraps after seat 5", () => {
    const harness = table({ leader: 4, hands: SMALL_HANDS });
    expect(liveGame(harness).currentTurn).toBe(4);

    drop(harness, 4, "1HJ");
    expect(liveGame(harness).currentTurn).toBe(5);
    drop(harness, 5, "1HQ");
    expect(liveGame(harness).currentTurn).toBe(0);
  });

  test("a seat that is not on turn is refused and nothing changes", () => {
    const harness = table();
    expectRejectedWithoutMutation(harness, () => drop(harness, 2, "1H9"), { message: "Its not your turn!!" });
  });

  test("the seat that already played cannot play again before the others", () => {
    const harness = table();
    drop(harness, 0, "1HA");
    expectRejectedWithoutMutation(harness, () => drop(harness, 0, "1D9"), { message: "Its not your turn!!" });
  });

  test("a play is judged by the token, not by the name the client claims", () => {
    const harness = table();
    expectRejectedWithoutMutation(
      harness,
      () => drop(harness, 2, "1H9", { claimedPlayerId: "Ann" }),
      { message: "Its not your turn!!" },
    );
  });

  test("an unknown token is never on turn", () => {
    const harness = table();
    expectRejectedWithoutMutation(harness, () => drop(harness, 0, "1HA", { token: "stranger" }), {
      message: "Its not your turn!!",
    });
  });
});

describe("following suit", () => {
  // Seat 0 leads a heart; seat 1 holds 1HK and 1DA.
  const led = (): Harness => {
    const harness = table({ trick: [[0, "1HA"]], hands: [["1D9"], ["1HK", "1DA"], ["1H9", "1D10"], ["1DJ", "1EA"], ["1HJ", "1EJ"], ["1HQ", "1CA"]] });
    return harness;
  };

  test("a player holding the led suit must play it", () => {
    const harness = led();
    expectRejectedWithoutMutation(harness, () => drop(harness, 1, "1DA"), {
      message: "You have the same suit card",
    });
  });

  test("a player holding the led suit may play it", () => {
    const harness = led();
    expect(drop(harness, 1, "1HK").code).toBe("SUCCESS");
    expect(liveGame(harness).droppedCards).toEqual(["1HA", "1HK"]);
  });

  test("a player with no card of the led suit may play any card, including a trump", () => {
    ["1DJ", "1EA"].forEach((card) => {
      const harness = table({
        trick: [[0, "1HA"], [1, "1HK"], [2, "1H9"]],
        hands: [["1D9"], ["1DA"], ["1D10"], ["1DJ", "1EA"], ["1HJ"], ["1HQ"]],
        trump: "D",
      });
      expect(drop(harness, 3, card).code).toBe("SUCCESS");
    });
  });

  test("the follow-suit duty applies to every later seat in the trick", () => {
    const harness = table({
      trick: [[0, "1HA"], [1, "1HK"], [2, "1H9"], [3, "1DJ"]],
      hands: [["1D9"], ["1DA"], ["1D10"], ["1EA"], ["1HJ", "1EJ"], ["1HQ", "1CA"]],
    });
    expectRejectedWithoutMutation(harness, () => drop(harness, 4, "1EJ"), { message: "You have the same suit card" });
    expect(drop(harness, 4, "1HJ").code).toBe("SUCCESS");
  });

  test("a trump lead obliges followers to play trump if they hold it", () => {
    const harness = table({
      trump: "D",
      trick: [[0, "1DA"]],
      hands: [["1H9"], ["1D9", "1HK"], ["1H10"], ["1EJ"], ["1HJ"], ["1HQ"]],
    });
    expectRejectedWithoutMutation(harness, () => drop(harness, 1, "1HK"), { message: "You have the same suit card" });
    expect(drop(harness, 1, "1D9").code).toBe("SUCCESS");
  });

  test("a leader may open with any card of the hand", () => {
    ["1HA", "1D9"].forEach((card) => {
      const harness = table();
      expect(drop(harness, 0, card).code).toBe("SUCCESS");
    });
  });
});

describe("duplicate cards", () => {
  test("both copies of a card are playable by their holders in the same trick", () => {
    const harness = table({
      hands: [["1HA"], ["2HA"], ["1HK"], ["1HQ"], ["1H10"], ["1H9"]],
    });
    expect(drop(harness, 0, "1HA").code).toBe("SUCCESS");
    expect(drop(harness, 1, "2HA").code).toBe("SUCCESS");
    expect(liveGame(harness).dropCardPlayer).toEqual(["1HA-Ann", "2HA-Ben"]);
  });

  test("a holder of both copies plays one and keeps the other", () => {
    const harness = table({
      hands: [["1HA", "2HA"], ["1HK"], ["1HQ"], ["1H10"], ["1H9"], ["1HJ"]],
    });
    drop(harness, 0, "2HA");
    expect(liveGame(harness)["tok-0"]).toEqual(["1HA"]);
  });

  test("the copy digit does not matter for following suit", () => {
    const harness = table({
      trick: [[0, "2HQ"]],
      hands: [["1D9"], ["1HA", "1DA"], ["1H9"], ["1DJ"], ["1HJ"], ["1CA"]],
    });
    expectRejectedWithoutMutation(harness, () => drop(harness, 1, "1DA"), { message: "You have the same suit card" });
  });
});

describe("requests that are not a card play", () => {
  test("an empty card is refused", () => {
    const harness = table();
    expectRejectedWithoutMutation(harness, () => drop(harness, 0, ""), { message: "Invalid card!!" });
  });

  test("a game that does not exist is refused", () => {
    const harness = table();
    const reply = drop(harness, 0, "1HA", { gameId: GAME_ID });
    expect(reply.code).toBe("SUCCESS");

    let result: any;
    harness.core.onDropCard({ gameId: "nope", card: "1HA", token: "tok-0", playerId: "Ann" } as any, (e: any, r: any) => {
      result = r;
    });
    expect(result.code).toBe("FAILED");
    expect(result.message).toBe("Game not found");
  });
});

describe("a complete trick", () => {
  function playSixCards(harness: Harness): void {
    const cards = ["1HA", "1HK", "1H9", "1DJ", "1HJ", "1HQ"];
    cards.forEach((card, seat) => expect(drop(harness, seat, card).code).toBe("SUCCESS"));
  }

  test("holds six cards and schedules its own resolution after five seconds", () => {
    const harness = table({ hands: [["1HA"], ["1HK"], ["1H9"], ["1DJ"], ["1HJ"], ["1HQ"]] });
    playSixCards(harness);

    expect(liveGame(harness).dropDetails).toHaveLength(6);
    expect(roundTimerPending(harness.core, GAME_ID)).toBe(true);
    expect(TRICK_RESOLUTION_MS).toBe(5000);
  });

  test("accepts no seventh card while the trick is waiting to be resolved", () => {
    const harness = table({ hands: [["1HA", "1D9"], ["1HK"], ["1H9"], ["1DJ"], ["1HJ"], ["1HQ"]] });
    playSixCards(harness);

    expectRejectedWithoutMutation(harness, () => drop(harness, liveGame(harness).currentTurn, "1D9"), {
      message: "Round completed",
    });
  });

  test("does not announce another turn until the trick has been resolved", () => {
    const harness = table({ hands: [["1HA"], ["1HK"], ["1H9"], ["1DJ"], ["1HJ"], ["1HQ"]] });
    playSixCards(harness);
    const turnsBefore = emitsOf(harness.emitted, "TURN_INFO").length;
    expect(turnsBefore).toBe(5);
  });
});
