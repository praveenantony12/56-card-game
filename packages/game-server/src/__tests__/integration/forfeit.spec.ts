/**
 * Forfeiting a hand.
 *
 * A forfeit needs every teammate of the requester to agree. When it completes,
 * the hand ends and a fresh one is dealt to the same table. Forfeit score
 * changes are NOT asserted here: they have an open discrepancy against the
 * regular scoring (see characterization/forfeitScoring.spec.ts).
 */

import { IPlayer } from "../../core/models/IPlayer";
import { GAME_ID, cardPlayGame } from "../helpers/builders";
import { assertSixUniquePlayers } from "../helpers/assertions";
import {
  Harness,
  Reply,
  drop,
  emitsOf,
  liveGame,
  makeCore,
  seedGame,
  useQuietConsole,
} from "../helpers/harness";
import { flushPromises, seedMathRandom, useGameTimers } from "../helpers/timers";
import { roundTimerPending } from "../helpers/privateAccess";

useQuietConsole();
useGameTimers();

let restoreRandom: () => void;
beforeEach(() => {
  restoreRandom = seedMathRandom(31);
});
afterEach(() => {
  restoreRandom();
});

function table(overrides: { [field: string]: any } = {}, options: { hands?: string[][]; trick?: Array<[number, string]> } = {}): Harness {
  const harness = makeCore();
  [0, 1, 2, 3, 4, 5].forEach((seat) => harness.io.addSocket(`sock-${seat}`));
  seedGame(harness, cardPlayGame({ ...options, overrides }));
  return harness;
}

/** Calls the async handler and lets its short internal delay run on the fake clock. */
async function forfeit(harness: Harness, playerId: string): Promise<Reply> {
  let reply: any;
  const pending = harness.core.onForfeitGame({ gameId: GAME_ID, playerId } as any, (err: any, res: any) => {
    reply = { called: 1, err, res, code: res && res.code, message: res && res.message };
  });
  jest.advanceTimersByTime(20);
  await flushPromises();
  await pending;
  return reply;
}

const received = (harness: Harness, seat: number, action: string) =>
  emitsOf(harness.emitted.filter((e) => e.room === `sock-${seat}`), action).length;

describe("forfeit requests that are refused", () => {
  test("a game that does not exist", async () => {
    const harness = table();
    let reply: any;
    await harness.core.onForfeitGame({ gameId: "nope", playerId: "Ann" } as any, (e: any, r: any) => (reply = r));
    expect(reply.code).toBe("FAILED");
    expect(reply.message).toBe("Game not found");
  });

  test("a hand that is already complete", async () => {
    const harness = table({ isGameComplete: true });
    const before = JSON.stringify(liveGame(harness));
    const reply = await forfeit(harness, "Ann");
    expect(reply.code).toBe("FAILED");
    expect(reply.message).toBe("Cannot forfeit a completed game");
    expect(JSON.stringify(liveGame(harness))).toBe(before);
  });

  test("a player who is not in the game", async () => {
    const harness = table();
    const before = JSON.stringify(liveGame(harness));
    const reply = await forfeit(harness, "Zed");
    expect(reply.code).toBe("FAILED");
    expect(reply.message).toBe("Player not found");
    expect(JSON.stringify(liveGame(harness))).toBe(before);
  });
});

describe("asking the team", () => {
  test("the request is recorded and every teammate must approve", async () => {
    const harness = table();
    const reply = await forfeit(harness, "Ann");

    expect(reply.code).toBe("SUCCESS");
    const game = liveGame(harness);
    expect(game.forfeitRequestedBy).toBe("Ann");
    expect(game.forfeitInProgress).toBe(true);
    expect(game.forfeitApprovals).toEqual({ Cal: false, Eli: false });
    expect(game.isGameComplete).toBe(false);
  });

  test("only the requester's teammates are asked, never the requester or the opponents", async () => {
    const harness = table();
    await forfeit(harness, "Ann");

    expect(received(harness, 2, "FORFEIT_REQUEST")).toBe(1);
    expect(received(harness, 4, "FORFEIT_REQUEST")).toBe(1);
    [0, 1, 3, 5].forEach((seat) => expect(received(harness, seat, "FORFEIT_REQUEST")).toBe(0));
  });

  test("Team B can forfeit too, with its own teammates asked", async () => {
    const harness = table();
    await forfeit(harness, "Dee");

    expect(liveGame(harness).forfeitApprovals).toEqual({ Ben: false, Fay: false });
    expect(received(harness, 1, "FORFEIT_REQUEST")).toBe(1);
    expect(received(harness, 5, "FORFEIT_REQUEST")).toBe(1);
  });

  test("one approval out of two does not end the hand", async () => {
    const harness = table();
    await forfeit(harness, "Ann");
    const reply = await forfeit(harness, "Cal");

    expect(reply.code).toBe("SUCCESS");
    const game = liveGame(harness);
    expect(game.forfeitApprovals).toEqual({ Cal: true, Eli: false });
    expect(game.isGameComplete).toBe(false);
    expect(emitsOf(harness.emitted, "GAME_FORFEITED")).toHaveLength(0);
    expect(received(harness, 1, "FORFEIT_APPROVAL_UPDATE")).toBe(1);
  });

  test("a player of the other team cannot approve for the forfeiting team", async () => {
    const harness = table();
    await forfeit(harness, "Ann");
    await forfeit(harness, "Ben");

    expect(liveGame(harness).forfeitApprovals).toEqual({ Cal: false, Eli: false });
    expect(emitsOf(harness.emitted, "GAME_FORFEITED")).toHaveLength(0);
  });
});

describe("a forfeit that everyone approves", () => {
  async function completeForfeit(harness: Harness): Promise<void> {
    await forfeit(harness, "Ann");
    await forfeit(harness, "Cal");
    await forfeit(harness, "Eli");
  }

  test("announces the forfeiting and winning team once", async () => {
    const harness = table();
    await completeForfeit(harness);

    const done = emitsOf(harness.emitted, "GAME_FORFEITED");
    expect(done).toHaveLength(1);
    expect(done[0].payload.payload.data).toMatchObject({ forfeitTeam: "TeamA", winningTeam: "TeamB" });
  });

  test("keeps the same six players in the same seats", async () => {
    const harness = table();
    const seated = liveGame(harness).players.map((p: IPlayer) => `${p.playerId}/${p.token}`);
    await completeForfeit(harness);

    const game = liveGame(harness);
    assertSixUniquePlayers(game);
    expect(game.players.map((p: IPlayer) => `${p.playerId}/${p.token}`)).toEqual(seated);
  });

  test("ends the in-progress forfeit request", async () => {
    const harness = table();
    await completeForfeit(harness);
    expect(liveGame(harness).forfeitInProgress).toBe(false);
  });

  test("conserves the combined score of the two teams", async () => {
    const harness = table();
    await completeForfeit(harness);

    const game = liveGame(harness);
    expect(game.teamAScore + game.teamBScore).toBe(20);
  });

  test("the scores in the announcement match the scores carried into the new hand", async () => {
    const harness = table();
    await completeForfeit(harness);

    const game = liveGame(harness);
    const data = emitsOf(harness.emitted, "GAME_FORFEITED")[0].payload.payload.data;
    expect(data.teamAScore).toBe(game.teamAScore);
    expect(data.teamBScore).toBe(game.teamBScore);
  });

  test("a trick that was waiting to be resolved is not resolved after the forfeit", async () => {
    const harness = table({}, { hands: [["1HA"], ["1HK"], ["1H9"], ["1DJ"], ["1HJ"], ["1HQ"]] });
    ["1HA", "1HK", "1H9", "1DJ", "1HJ", "1HQ"].forEach((card, seat) => drop(harness, seat, card));
    expect(roundTimerPending(harness.core, GAME_ID)).toBe(true);

    await completeForfeit(harness);
    expect(roundTimerPending(harness.core, GAME_ID)).toBe(false);

    jest.advanceTimersByTime(10000);
    const game = liveGame(harness);
    expect(game.teamACards).toEqual([]);
    expect(game.teamBCards).toEqual([]);
  });
});
