/**
 * Disconnection and reconnection.
 *
 * A player who drops is marked, the game pauses and a 15-minute removal timer
 * starts. A returning player must be approved by someone still connected.
 * Everything runs on fake timers; no real socket is involved.
 */

import { IPlayer } from "../../core/models/IPlayer";
import { GAME_ID, cardPlayGame, sixPlayers } from "../helpers/builders";
import { Harness, actionsOf, call, emitsOf, fakeSocket, liveGame, makeCore, seedGame, snapshot, useQuietConsole } from "../helpers/harness";
import { flushPromises, useGameTimers } from "../helpers/timers";
import { disconnectTimerPending } from "../helpers/privateAccess";

useQuietConsole();
useGameTimers();

const FIFTEEN_MINUTES = 15 * 60 * 1000;

function table(players: IPlayer[] = sixPlayers()): Harness {
  const harness = makeCore();
  players.forEach((p) => harness.io.addSocket(p.socketId));
  seedGame(harness, cardPlayGame({ players }));
  return harness;
}

const disconnect = (harness: Harness, seat: number) => {
  const p = liveGame(harness).players[seat];
  harness.core.handlePlayerDisconnection(GAME_ID, p.playerId, p.socketId);
};

describe("a player disconnects", () => {
  test("is marked disconnected and remembered for reconnection", () => {
    const harness = table();
    disconnect(harness, 3);

    const game = liveGame(harness);
    expect(game.players[3].isDisconnected).toBe(true);
    expect(game.disconnectedPlayers.Dee).toBeDefined();
    expect(game.disconnectedPlayers.Dee.playerId).toBe("Dee");
  });

  test("pauses the game and tells the room who left", () => {
    const harness = table();
    disconnect(harness, 3);

    expect(liveGame(harness).gamePaused).toBe(true);
    const actions = actionsOf(harness.emitted);
    expect(actions).toContain("PLAYER_DISCONNECTED");
    expect(actions).toContain("GAME_PAUSED");
  });

  test("keeps the seat, the hand and everything on the table", () => {
    const harness = table();
    const before = snapshot(liveGame(harness));
    disconnect(harness, 3);

    const after = snapshot(liveGame(harness));
    expect(after.players.map((p: IPlayer) => p.playerId)).toEqual(before.players.map((p: IPlayer) => p.playerId));
    expect(after["tok-3"]).toEqual(before["tok-3"]);
    expect(after.currentTurn).toBe(before.currentTurn);
    expect(after.droppedCards).toEqual(before.droppedCards);
  });

  test("schedules a removal that has not fired just before 15 minutes", () => {
    const harness = table();
    disconnect(harness, 3);

    expect(disconnectTimerPending(harness.core, GAME_ID, "Dee")).toBe(true);
    jest.advanceTimersByTime(FIFTEEN_MINUTES - 1);
    expect(emitsOf(harness.emitted, "GAME_ABORTED")).toHaveLength(0);
  });

  test("triggers the removal handling once 15 minutes have passed", () => {
    const harness = table();
    disconnect(harness, 3);
    jest.advanceTimersByTime(FIFTEEN_MINUTES);
    expect(emitsOf(harness.emitted, "GAME_ABORTED").length).toBeGreaterThan(0);
  });

  test("a disconnect from an unknown game is ignored", () => {
    const harness = table();
    expect(() => harness.core.handlePlayerDisconnection("nope", "Dee", "sock-3")).not.toThrow();
  });

  test("a disconnect from a socket that is not the player's current socket changes nothing", () => {
    const harness = table();
    const before = snapshot(liveGame(harness));
    harness.core.handlePlayerDisconnection(GAME_ID, "Dee", "an-old-socket");
    expect(snapshot(liveGame(harness))).toEqual(before);
    expect(harness.emitted).toHaveLength(0);
  });

  test("when every human has left the game is aborted and removed at once", () => {
    const players = sixPlayers({
      3: { isBotAgent: true, socketId: "bot-socket-3" },
      4: { isBotAgent: true, socketId: "bot-socket-4" },
      5: { isBotAgent: true, socketId: "bot-socket-5" },
    });
    const harness = table(players);
    disconnect(harness, 0);
    disconnect(harness, 1);
    expect(liveGame(harness)).toBeDefined();

    disconnect(harness, 2);
    expect(liveGame(harness)).toBeUndefined();
    expect(emitsOf(harness.emitted, "GAME_ABORTED")).toHaveLength(1);
  });
});

describe("a player asks to come back", () => {
  function disconnected(): Harness {
    const harness = table();
    disconnect(harness, 3);
    return harness;
  }

  test("an unknown game is an error", async () => {
    const harness = disconnected();
    const reply = call((cb) => {
      harness.core.reconnectPlayerToGame(fakeSocket("new") as any, "Dee", cb, "tok-3", "nope");
    });
    await flushPromises();
    expect(reply.called).toBe(1);
    expect(reply.err).toBeTruthy();
  });

  test("a player who never disconnected cannot reconnect", async () => {
    const harness = disconnected();
    const reply = call((cb) => {
      harness.core.reconnectPlayerToGame(fakeSocket("new") as any, "Ben", cb, "tok-1", GAME_ID);
    });
    await flushPromises();
    expect(reply.err).toBeTruthy();
    expect(liveGame(harness).pendingReconnections).toBeUndefined();
  });

  test("with others connected the request waits for approval and the others are asked", async () => {
    const harness = disconnected();
    const reply = call((cb) => {
      harness.core.reconnectPlayerToGame(fakeSocket("new") as any, "Dee", cb, "tok-3", GAME_ID);
    });
    await flushPromises();

    expect(reply.called).toBe(1);
    expect(reply.err).toBeNull();
    expect(liveGame(harness).pendingReconnections.Dee).toBeDefined();
    expect(liveGame(harness).players[3].isDisconnected).toBe(true);

    const delivered = (id: string) =>
      harness.emitted.filter(
        (e) => e.room === id && e.payload && e.payload.payload && e.payload.payload.action === "reconnection_request",
      );
    expect(delivered("sock-0")).toHaveLength(1);
    expect(delivered("sock-3")).toHaveLength(0);
  });

  test("an approval brings the player back, resumes the game and clears the removal timer", async () => {
    const harness = disconnected();
    const returning = fakeSocket("new-socket");
    call((cb) => {
      harness.core.reconnectPlayerToGame(returning as any, "Dee", cb, "tok-3", GAME_ID);
    });
    await flushPromises();

    const reply = call((cb) => {
      harness.core.approveReconnection(fakeSocket("sock-0") as any, GAME_ID, "Dee", "Ann", cb);
    });
    await flushPromises();

    expect(reply.called).toBe(1);
    const game = liveGame(harness);
    expect(game.players[3].isDisconnected).toBe(false);
    expect(game.players[3].socketId).toBe("new-socket");
    expect(game.disconnectedPlayers.Dee).toBeUndefined();
    expect(game.gamePaused).toBe(false);
    expect(returning.rooms).toContain(GAME_ID);

    jest.advanceTimersByTime(FIFTEEN_MINUTES);
    expect(emitsOf(harness.emitted, "GAME_ABORTED")).toHaveLength(0);
  });

  test("an approval with nothing pending is an error", async () => {
    const harness = disconnected();
    const reply = call((cb) => {
      harness.core.approveReconnection(fakeSocket("sock-0") as any, GAME_ID, "Dee", "Ann", cb);
    });
    await flushPromises();
    expect(reply.res.code).toBe("ERROR");
  });
});
