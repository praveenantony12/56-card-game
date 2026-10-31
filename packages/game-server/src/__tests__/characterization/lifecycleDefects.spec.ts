/**
 * Characterization: lifecycle behaviors (forfeit, abort, disconnect, restart
 * bookkeeping) that look wrong but are what the code does today.
 *
 * See cardPlayLegacy.spec.ts for how CURRENT BEHAVIOR / DESIRED pairs work.
 * Nothing here is a confirmed rule of the game. S23 and S24 are the most
 * serious: after a completed forfeit the score change does not depend on who
 * forfeited, and the table is left in the OLD hand.
 */

import { IPlayer } from "../../core/models/IPlayer";
import { GAME_ID, cardPlayGame, sixPlayers } from "../helpers/builders";
import {
  Harness,
  call,
  drop,
  emitsOf,
  liveGame,
  makeCore,
  seedGame,
  useQuietConsole,
} from "../helpers/harness";
import { roundTimerPending } from "../helpers/privateAccess";
import { flushPromises, useGameTimers } from "../helpers/timers";

useQuietConsole();
useGameTimers();

const FIFTEEN_MINUTES = 15 * 60 * 1000;

function sixHumans(extra: { [field: string]: any } = {}, players: IPlayer[] = sixPlayers()): Harness {
  const harness = makeCore();
  players.forEach((p) => harness.io.addSocket(p.socketId));
  seedGame(harness, cardPlayGame({ players, overrides: extra }));
  return harness;
}

async function forfeit(harness: Harness, playerId: string) {
  const pending = harness.core.onForfeitGame({ gameId: GAME_ID, playerId } as any, () => {});
  jest.advanceTimersByTime(20);
  await flushPromises();
  await pending;
}

async function forfeitByTeam(team: "A" | "B", extra: { [field: string]: any } = {}): Promise<Harness> {
  const harness = sixHumans(extra);
  const order = team === "A" ? ["Ann", "Cal", "Eli"] : ["Ben", "Dee", "Fay"];
  for (const name of order) await forfeit(harness, name);
  return harness;
}

describe("S23: forfeit scoring ignores who forfeited and who had bid", () => {
  test("CURRENT BEHAVIOR (S23): whichever team forfeits, the scores come out Team A 9, Team B 11", async () => {
    const outcomes: number[][] = [];
    for (const team of ["A", "B"] as Array<"A" | "B">) {
      const game = liveGame(await forfeitByTeam(team));
      outcomes.push([game.teamAScore, game.teamBScore]);
    }
    expect(outcomes).toEqual([[9, 11], [9, 11]]);
  });

  test.skip("DESIRED (S23): the forfeiting team never gains points from forfeiting", async () => {
    const byA = liveGame(await forfeitByTeam("A"));
    expect(byA.teamAScore).toBeLessThan(10);
    const byB = liveGame(await forfeitByTeam("B"));
    expect(byB.teamBScore).toBeLessThan(10);
  });
});

describe("S24: the table after a completed forfeit", () => {
  test("CURRENT BEHAVIOR (S24): the store ends up holding the OLD, completed hand instead of the new deal", async () => {
    const harness = await forfeitByTeam("A");
    const game = liveGame(harness);

    expect(game.isGameComplete).toBe(true);
    expect(game.isBiddingPhase).toBe(false);
    expect(game.forfeitRequestedBy).toBe("Ann");
  });

  test.skip("DESIRED (S24): a completed forfeit leaves a fresh hand in the bidding phase", async () => {
    const game = liveGame(await forfeitByTeam("A"));
    expect(game.isGameComplete).toBe(false);
    expect(game.isBiddingPhase).toBe(true);
    expect(game.forfeitRequestedBy).toBeUndefined();
  });
});

describe("S22: a bot on the forfeiting team", () => {
  const withBot = () => sixPlayers({ 2: { isBotAgent: true, socketId: "bot-socket-2" } });

  test("CURRENT BEHAVIOR (S22): the bot is listed among the approvals the team must give, but a bot can never approve", async () => {
    const harness = sixHumans({}, withBot());
    await forfeit(harness, "Ann");

    expect(liveGame(harness).forfeitApprovals).toEqual({ Cal: false, Eli: false });
  });

  test.skip("DESIRED (S22): only human teammates are asked to approve a forfeit", async () => {
    const harness = sixHumans({}, withBot());
    await forfeit(harness, "Ann");
    expect(liveGame(harness).forfeitApprovals).toEqual({ Eli: false });
  });
});

describe("S21: aborting a game with a trick waiting to be resolved", () => {
  const pendingTrick = () => {
    const harness = makeCore();
    seedGame(harness, cardPlayGame({ hands: [["1HA"], ["1HK"], ["1H9"], ["1DJ"], ["1HJ"], ["1HQ"]], trump: "D" }));
    ["1HA", "1HK", "1H9", "1DJ", "1HJ", "1HQ"].forEach((card, seat) => drop(harness, seat, card));
    harness.core.abortGame(GAME_ID);
    return harness;
  };

  test("CURRENT BEHAVIOR (S21): the trick timer is not cancelled, though firing it is harmless", () => {
    const harness = pendingTrick();
    expect(liveGame(harness)).toBeUndefined();
    expect(roundTimerPending(harness.core, GAME_ID)).toBe(true);
    expect(() => jest.advanceTimersByTime(5000)).not.toThrow();
  });

  test.skip("DESIRED (S21): aborting a game cancels its pending timers", () => {
    const harness = pendingTrick();
    expect(roundTimerPending(harness.core, GAME_ID)).toBe(false);
  });
});

describe("S15: removing a long-disconnected player", () => {
  test("CURRENT BEHAVIOR (S15): one player away for 15 minutes aborts the whole game", () => {
    const harness = sixHumans();
    const dee = liveGame(harness).players[3];
    harness.core.handlePlayerDisconnection(GAME_ID, dee.playerId, dee.socketId);
    jest.advanceTimersByTime(FIFTEEN_MINUTES);

    expect(liveGame(harness)).toBeUndefined();
  });

  test("CURRENT BEHAVIOR (S15): when the game survives, removal is announced with a GAME_ABORTED event", () => {
    const harness = sixHumans();
    [3, 4, 5].forEach((seat) => {
      const p = liveGame(harness).players[seat];
      harness.core.handlePlayerDisconnection(GAME_ID, p.playerId, p.socketId);
    });
    jest.advanceTimersByTime(FIFTEEN_MINUTES);

    expect(liveGame(harness)).toBeDefined();
    expect(emitsOf(harness.emitted, "GAME_ABORTED").length).toBeGreaterThan(0);
  });

  test.skip("DESIRED (S15): one player away for 15 minutes does not end the game for the other five", () => {
    const harness = sixHumans();
    const dee = liveGame(harness).players[3];
    harness.core.handlePlayerDisconnection(GAME_ID, dee.playerId, dee.socketId);
    jest.advanceTimersByTime(FIFTEEN_MINUTES);
    expect(liveGame(harness)).toBeDefined();
  });
});

describe("S16: the starter index is shared by every game on the server", () => {
  const otherGame = (harness: Harness) => {
    const players = sixPlayers().map((p, seat) => ({ ...p, token: `b-tok-${seat}`, socketId: `b-sock-${seat}`, gameId: "game-b" }));
    players.forEach((p) => harness.io.addSocket(p.socketId));
    harness.core.startGame("game-b", players, true);
    return liveGame(harness, "game-b");
  };

  function afterRestartingAnotherGame(): Harness {
    const harness = sixHumans({ isGameComplete: true });
    call((cb) => harness.core.onRestartGame({ gameId: GAME_ID } as any, cb));
    return harness;
  }

  test("CURRENT BEHAVIOR (S16): restarting one game changes who starts a brand-new game elsewhere", () => {
    const harness = afterRestartingAnotherGame();
    expect(otherGame(harness).currentTurn).toBe(1);
  });

  test.skip("DESIRED (S16): a new game always starts with seat 0, whatever happened in other games", () => {
    const harness = afterRestartingAnotherGame();
    expect(otherGame(harness).currentTurn).toBe(0);
  });
});

describe("S25: reconnecting when nobody else is connected", () => {
  const lastOneStanding = () => {
    const harness = sixHumans();
    const game = liveGame(harness);
    game.players.forEach((p: IPlayer, seat: number) => {
      if (seat !== 3) p.isDisconnected = true;
    });
    game.players[3].isDisconnected = true;
    game.disconnectedPlayers = { Dee: { ...game.players[3] } };
    return harness;
  };

  test("CURRENT BEHAVIOR (S25): the immediate-reconnect path overwrites the first player's name with the returning player's", async () => {
    const harness = lastOneStanding();
    call((cb) => {
      harness.core.reconnectPlayerToGame(harness.io.addSocket("back") as any, "Dee", cb, "tok-3", GAME_ID);
    });
    await flushPromises();

    expect(liveGame(harness).players[0].playerId).toBe("Dee");
  });

  test.skip("DESIRED (S25): reconnecting leaves every other player's name alone", async () => {
    const harness = lastOneStanding();
    call((cb) => {
      harness.core.reconnectPlayerToGame(harness.io.addSocket("back") as any, "Dee", cb, "tok-3", GAME_ID);
    });
    await flushPromises();
    expect(liveGame(harness).players[0].playerId).toBe("Ann");
  });
});
