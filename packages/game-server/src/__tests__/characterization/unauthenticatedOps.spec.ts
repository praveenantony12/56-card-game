/**
 * Characterization: operations that any client can send without proving who it
 * is, and malformed requests. See cardPlayLegacy.spec.ts for how CURRENT
 * BEHAVIOR / DESIRED pairs work. Nothing here is a confirmed rule of the game.
 */

import { InMemoryStore } from "../../persistence/InMemoryStore";
import { SocketServer } from "../../core/SocketServer";
import { GAME_ID, cardPlayGame } from "../helpers/builders";
import {
  FakeIo,
  FakeSocket,
  call,
  fakeSocket,
  liveGame,
  makeCore,
  recordingIo,
  seedGame,
  snapshot,
  useQuietConsole,
} from "../helpers/harness";
import { flushPromises, useGameTimers } from "../helpers/timers";

useQuietConsole();
useGameTimers();

describe("S9: legacy operations that need no player identity", () => {
  test("CURRENT BEHAVIOR (S9): anyone can overwrite the team scores", () => {
    const harness = makeCore();
    seedGame(harness, cardPlayGame());
    call((cb) => harness.core.onUpdateGameScore({ gameId: GAME_ID, gameScore: "5" } as any, cb));

    expect(liveGame(harness).teamAScore).toBe(5);
    expect(liveGame(harness).teamBScore).toBe(15);
  });

  test("CURRENT BEHAVIOR (S9): anyone can restart the game in the middle of a hand", () => {
    const harness = makeCore();
    seedGame(harness, cardPlayGame({ trick: [[0, "1HA"], [1, "1HK"]] }));
    const reply = call((cb) => harness.core.onRestartGame({ gameId: GAME_ID } as any, cb));

    expect(reply.code).not.toBe("FAILED");
    expect(liveGame(harness).isBiddingPhase).toBe(true);
    expect(liveGame(harness).droppedCards).toEqual([]);
  });

  test("CURRENT BEHAVIOR (S9): anyone can award the cards on the table to a team before the trick is complete", () => {
    const harness = makeCore();
    seedGame(harness, cardPlayGame({ trick: [[0, "1HA"], [1, "1HK"]] }));
    call((cb) => harness.core.onDeckWonByTeamA({ gameId: GAME_ID } as any, cb));

    expect(liveGame(harness).teamACards.slice().sort()).toEqual(["1HA", "1HK"]);
    expect(liveGame(harness).dropDetails).toEqual([]);
  });

  test("CURRENT BEHAVIOR (S9): until the first card is played anyone can change the trump after bidding has ended", () => {
    const harness = makeCore();
    seedGame(harness, cardPlayGame({ trump: "H", leader: 0 }));
    call((cb) => harness.core.onSelectTrumpSuit({ gameId: GAME_ID, playerId: "Stranger", trumpSuit: "D" }, cb));

    expect(liveGame(harness).trumpSuit).toBe("D");
  });

  test("CURRENT BEHAVIOR (S9): selecting a player rotates the whole seating, so an odd rotation moves players to the other team", () => {
    const harness = makeCore();
    seedGame(harness, cardPlayGame());
    call((cb) => harness.core.onSelectPlayer({ gameId: GAME_ID, currentPlayerId: "Ben" } as any, cb));

    const seats = liveGame(harness).players.map((p: any) => p.playerId);
    expect(seats).toEqual(["Ben", "Cal", "Dee", "Eli", "Fay", "Ann"]);
  });

  test.skip("DESIRED (S9): sensitive operations require the identity and the role of the requester", () => {
    const harness = makeCore();
    seedGame(harness, cardPlayGame({ trick: [[0, "1HA"], [1, "1HK"]] }));
    const before = snapshot(liveGame(harness));
    call((cb) => harness.core.onUpdateGameScore({ gameId: GAME_ID, gameScore: "5" } as any, cb));
    call((cb) => harness.core.onRestartGame({ gameId: GAME_ID } as any, cb));
    expect(snapshot(liveGame(harness))).toEqual(before);
  });
});

// ---------------------------------------------------------------------------

interface Wire {
  io: FakeIo;
  socket: FakeSocket;
}

function connect(): Wire {
  new InMemoryStore();
  const io = recordingIo();
  const server = new SocketServer(io as any);
  server.watchConnection();
  const socket = io.addSocket("client-1");
  io.connectionHandlers.forEach((handler) => handler(socket));
  return { io, socket };
}

describe("S10 and S11: malformed socket requests", () => {
  test("CURRENT BEHAVIOR (S10): a request with no body makes the handler throw and the client gets no reply", async () => {
    const wire = connect();
    const replies: any[] = [];
    let failure: any;
    try {
      await wire.socket.handlers.data(null, (...args: any[]) => replies.push(args));
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect(replies).toEqual([]);
  });

  test("CURRENT BEHAVIOR (S10): a request whose payload is null also throws", async () => {
    const wire = connect();
    const replies: any[] = [];
    let failure: any;
    try {
      await wire.socket.handlers.data({ operation: "DROP_CARD", payload: null }, (...args: any[]) => replies.push(args));
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeDefined();
    expect(replies).toEqual([]);
  });

  test.skip("DESIRED (S10): a malformed request is answered with FAILED and never throws out of the handler", async () => {
    const wire = connect();
    const replies: any[] = [];
    await wire.socket.handlers.data(null, (...args: any[]) => replies.push(args));
    expect(replies).toHaveLength(1);
    expect(replies[0][1].code).toBe("FAILED");
  });

  test("CURRENT BEHAVIOR (S11): an unknown operation gets no reply at all", async () => {
    const wire = connect();
    const replies: any[] = [];
    await wire.socket.handlers.data({ operation: "NOT_A_THING", payload: {} }, (...args: any[]) => replies.push(args));
    expect(replies).toEqual([]);
  });

  test.skip("DESIRED (S11): an unknown operation is answered with FAILED", async () => {
    const wire = connect();
    const replies: any[] = [];
    await wire.socket.handlers.data({ operation: "NOT_A_THING", payload: {} }, (...args: any[]) => replies.push(args));
    expect(replies).toHaveLength(1);
    expect(replies[0][1].code).toBe("FAILED");
  });
});

describe("S13: proving who is reconnecting and who is approving", () => {
  async function disconnectedGame() {
    const harness = makeCore();
    harness.io.addSocket("sock-0");
    seedGame(harness, cardPlayGame());
    const dee = liveGame(harness).players[3];
    harness.core.handlePlayerDisconnection(GAME_ID, dee.playerId, dee.socketId);
    return harness;
  }

  test("CURRENT BEHAVIOR (S13): a reconnection request with a wrong token is accepted for approval", async () => {
    const harness = await disconnectedGame();
    const reply = call((cb) => {
      harness.core.reconnectPlayerToGame(fakeSocket("intruder") as any, "Dee", cb, "WRONG-TOKEN", GAME_ID);
    });
    await flushPromises();

    expect(reply.err).toBeNull();
    expect(liveGame(harness).pendingReconnections.Dee).toBeDefined();
  });

  test("CURRENT BEHAVIOR (S13): the approver is whoever the request says it is, even the reconnecting player themself", async () => {
    const harness = await disconnectedGame();
    call((cb) => {
      harness.core.reconnectPlayerToGame(fakeSocket("intruder") as any, "Dee", cb, "WRONG-TOKEN", GAME_ID);
    });
    await flushPromises();
    call((cb) => {
      harness.core.approveReconnection(fakeSocket("intruder") as any, GAME_ID, "Dee", "Dee", cb);
    });
    await flushPromises();

    expect(liveGame(harness).players[3].isDisconnected).toBe(false);
    expect(liveGame(harness).players[3].socketId).toBe("intruder");
  });

  test.skip("DESIRED (S13): a reconnection request with the wrong token is refused", async () => {
    const harness = await disconnectedGame();
    const reply = call((cb) => {
      harness.core.reconnectPlayerToGame(fakeSocket("intruder") as any, "Dee", cb, "WRONG-TOKEN", GAME_ID);
    });
    await flushPromises();
    expect(reply.err).toBeTruthy();
    expect(liveGame(harness).pendingReconnections).toBeUndefined();
  });

  test.skip("DESIRED (S13): a player cannot approve their own reconnection", async () => {
    const harness = await disconnectedGame();
    call((cb) => {
      harness.core.reconnectPlayerToGame(fakeSocket("returning") as any, "Dee", cb, "tok-3", GAME_ID);
    });
    await flushPromises();
    call((cb) => {
      harness.core.approveReconnection(fakeSocket("returning") as any, GAME_ID, "Dee", "Dee", cb);
    });
    await flushPromises();
    expect(liveGame(harness).players[3].isDisconnected).toBe(true);
  });
});
