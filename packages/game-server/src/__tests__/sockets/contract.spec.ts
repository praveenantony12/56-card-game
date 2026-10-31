/**
 * Socket contract: which wire operation reaches which GameCore handler, and what
 * a client gets back.
 *
 * The server is driven through the same `connection` and `data` listeners a real
 * socket.io server would use, with an in-memory stand-in for the transport, so
 * these tests are fast and need no port. The operation strings are the wire
 * contract and are written out literally on purpose.
 */

import { InMemoryStore } from "../../persistence/InMemoryStore";
import { SocketServer } from "../../core/SocketServer";
import { GAME_ID, biddingGame, cardPlayGame } from "../helpers/builders";
import { FakeIo, FakeSocket, recordingIo, useQuietConsole } from "../helpers/harness";
import { gameCoreOf } from "../helpers/privateAccess";
import { useGameTimers } from "../helpers/timers";

useQuietConsole();
useGameTimers();

interface Wire {
  io: FakeIo;
  server: SocketServer;
  store: InMemoryStore;
  socket: FakeSocket;
  send(operation: string, payload?: any): { calls: any[][]; done: Promise<void> };
}

function connect(): Wire {
  const store = new InMemoryStore();
  const io = recordingIo();
  const server = new SocketServer(io as any);
  server.watchConnection();
  const socket = io.addSocket("client-1");
  io.connectionHandlers.forEach((handler) => handler(socket));

  return {
    io,
    server,
    store,
    socket,
    send(operation: string, payload?: any) {
      const calls: any[][] = [];
      const request: any = payload === undefined ? { operation } : { operation, payload };
      const done = Promise.resolve(socket.handlers.data(request, (...args: any[]) => calls.push(args))) as Promise<void>;
      return { calls, done };
    },
  };
}

describe("connecting", () => {
  test("a connection registers exactly the data, error and disconnect listeners", () => {
    const wire = connect();
    expect(wire.io.connectionHandlers).toHaveLength(1);
    expect(Object.keys(wire.socket.handlers).sort()).toEqual(["data", "disconnect", "error"]);
  });
});

describe("routing of operations to GameCore", () => {
  // [wire operation, GameCore method]
  const routes: Array<[string, string]> = [
    ["LOGIN", "addPlayerToGamePool"],
    ["ADD_BOTS", "onAddBots"],
    ["RECONNECT", "reconnectPlayerToGame"],
    ["RECONNECT_APPROVE", "approveReconnection"],
    ["RECONNECT_DENY", "denyReconnection"],
    ["SELECT_PLAYER", "onSelectPlayer"],
    ["DROP_CARD", "onDropCard"],
    ["INCREMENT_BET_BY_PLAYER", "onIncrementBetByPlayer"],
    ["UPDATE_GAME_SCORE", "onUpdateGameScore"],
    ["DECK_WON_BY_TEAM_A", "onDeckWonByTeamA"],
    ["DECK_WON_BY_TEAM_B", "onDeckWonByTeamB"],
    ["RESTART_GAME", "onRestartGame"],
    ["FORFEIT_GAME", "onForfeitGame"],
    ["SELECT_TRUMP_SUIT", "onSelectTrumpSuit"],
    ["BIDDING_ACTION", "onBiddingAction"],
    ["SWITCH_TEAM_POSITIONS", "onSwitchTeamPositions"],
    ["SWITCH_TEAM_POSITIONS_APPROVE", "onApprovePositionSwitch"],
    ["JOIN_LOBBY", "joinLobby"],
    ["LEAVE_LOBBY", "leaveLobby"],
    ["LOBBY_BOT_VOTE", "voteBotSubstitution"],
    ["FORCE_RECONNECT", "forcePlayerReconnect"],
  ];

  test.each(routes)("%s is handled by GameCore.%s", async (operation: string, method: string) => {
    const wire = connect();
    const core: any = gameCoreOf(wire.server);
    const spy = jest.spyOn(core, method).mockImplementation(() => undefined);

    const marker = `marker:${operation}`;
    const { done } = wire.send(operation, { gameId: marker, playerId: marker, userId: marker });
    await done;

    expect(spy).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(spy.mock.calls[0])).toContain(marker);
  });

  test("each route hands the client's callback to the handler", async () => {
    const wire = connect();
    const spy = jest.spyOn(gameCoreOf(wire.server) as any, "onRestartGame").mockImplementation((_req: any, cb: Function) => cb(null, "done"));

    const { calls, done } = wire.send("RESTART_GAME", { gameId: GAME_ID });
    await done;
    expect(spy).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([[null, "done"]]);
  });

  test("a ping is answered with a pong", async () => {
    const wire = connect();
    const { calls, done } = wire.send("PING");
    await done;
    expect(calls).toEqual([[null, "PONG"]]);
  });
});

describe("what a client receives", () => {
  test("a legal card play answers SUCCESS and the card lands on the table", async () => {
    const wire = connect();
    wire.store.saveGame(GAME_ID, cardPlayGame());

    const { calls, done } = wire.send("DROP_CARD", { gameId: GAME_ID, card: "1HA", token: "tok-0", playerId: "Ann" });
    await done;

    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBeNull();
    expect(calls[0][1].code).toBe("SUCCESS");
    expect((wire.store.fetchGame(GAME_ID) as any).droppedCards).toEqual(["1HA"]);
  });

  test("a refused card play answers FAILED with a message, as a result and not as an error", async () => {
    const wire = connect();
    wire.store.saveGame(GAME_ID, cardPlayGame());

    const { calls, done } = wire.send("DROP_CARD", { gameId: GAME_ID, card: "1H9", token: "tok-2", playerId: "Cal" });
    await done;

    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBeNull();
    expect(calls[0][1]).toMatchObject({ code: "FAILED", message: "Its not your turn!!" });
  });

  test("a bid answers once and is broadcast to the game room", async () => {
    const wire = connect();
    wire.store.saveGame(GAME_ID, biddingGame());

    const { calls, done } = wire.send("BIDDING_ACTION", {
      gameId: GAME_ID,
      token: "tok-0",
      action: "bid",
      bidValue: 30,
      suit: "H",
    });
    await done;

    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBeNull();
    expect(calls[0][1].code).not.toBe("FAILED");
    const broadcast = wire.io.emitted.filter((e) => e.room === GAME_ID && e.event === "data");
    expect(broadcast.length).toBeGreaterThan(0);
  });

  test("a restart of an unknown game answers FAILED", async () => {
    const wire = connect();
    const { calls, done } = wire.send("RESTART_GAME", { gameId: "nope" });
    await done;
    expect(calls[0][1]).toMatchObject({ code: "FAILED", message: "Game not found" });
  });

  test("every broadcast is a data event whose body carries a code, an action and its data", async () => {
    const wire = connect();
    wire.store.saveGame(GAME_ID, biddingGame());
    const { done } = wire.send("BIDDING_ACTION", { gameId: GAME_ID, token: "tok-0", action: "pass" });
    await done;

    wire.io.emitted.forEach((e) => {
      expect(e.event).toBe("data");
      expect(typeof e.payload.code).toBe("string");
      expect(typeof e.payload.payload.action).toBe("string");
    });
  });
});

describe("disconnecting", () => {
  test("a socket that belongs to a game reports the player as disconnected", () => {
    const wire = connect();
    const core: any = gameCoreOf(wire.server);
    const spy = jest.spyOn(core, "handlePlayerDisconnection").mockImplementation(() => undefined);
    (wire.socket as any).gameInfo = { gameId: GAME_ID, playerId: "Ann" };

    wire.socket.handlers.disconnect();

    expect(spy).toHaveBeenCalledWith(GAME_ID, "Ann", "client-1");
  });

  test("a socket that belongs to the lobby is removed from the lobby", () => {
    const wire = connect();
    const core: any = gameCoreOf(wire.server);
    const lobby = jest.spyOn(core, "removeLobbyPlayerBySocket").mockImplementation(() => undefined);
    const game = jest.spyOn(core, "handlePlayerDisconnection").mockImplementation(() => undefined);
    (wire.socket as any).lobbyInfo = { playerId: "Ann" };

    wire.socket.handlers.disconnect();

    expect(lobby).toHaveBeenCalledWith("client-1");
    expect(game).not.toHaveBeenCalled();
  });

  test("a socket that was nowhere changes nothing", () => {
    const wire = connect();
    const core: any = gameCoreOf(wire.server);
    const lobby = jest.spyOn(core, "removeLobbyPlayerBySocket");
    const game = jest.spyOn(core, "handlePlayerDisconnection");

    expect(() => wire.socket.handlers.disconnect()).not.toThrow();
    expect(lobby).not.toHaveBeenCalled();
    expect(game).not.toHaveBeenCalled();
  });

  test("a transport error is logged without throwing", () => {
    const wire = connect();
    expect(() => wire.socket.handlers.error(new Error("boom"))).not.toThrow();
  });
});
