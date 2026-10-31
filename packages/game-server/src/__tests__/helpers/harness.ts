import { GameCore } from "../../core/GameCore";
import { ICardGame } from "../../core/models/ICardGame";
import { InMemoryStore } from "../../persistence/InMemoryStore";
import { GAME_ID } from "./builders";

// ---------------------------------------------------------------------------
// A socket.io server stand-in that records every room emit (as a JSON copy, so
// later mutation of the game cannot change what was recorded).
// ---------------------------------------------------------------------------

export interface Emit {
  room: string;
  event: string;
  payload: any;
}

export interface FakeSocket {
  id: string;
  /** Everything emitted directly to this socket. */
  received: any[];
  rooms: string[];
  handlers: { [event: string]: Function };
  emit(event: string, payload: any): void;
  join(room: string): void;
  on(event: string, handler: Function): void;
}

export interface FakeIo {
  emitted: Emit[];
  sockets: { connected: { [id: string]: FakeSocket } };
  connectionHandlers: Function[];
  to(room: string): { emit(event: string, payload?: any): void };
  on(event: string, handler: Function): void;
  addSocket(id: string): FakeSocket;
}

const clone = (value: any) => (value === undefined ? null : JSON.parse(JSON.stringify(value)));

export function fakeSocket(id: string): FakeSocket {
  const socket: FakeSocket = {
    id,
    received: [],
    rooms: [],
    handlers: {},
    emit(event: string, payload: any) {
      socket.received.push({ event, payload: clone(payload) });
    },
    join(room: string) {
      socket.rooms.push(room);
    },
    on(event: string, handler: Function) {
      socket.handlers[event] = handler;
    },
  };
  return socket;
}

export function recordingIo(): FakeIo {
  const io: FakeIo = {
    emitted: [],
    sockets: { connected: {} },
    connectionHandlers: [],
    to(room: string) {
      return {
        emit(event: string, payload?: any) {
          io.emitted.push({ room, event, payload: clone(payload) });
        },
      };
    },
    on(event: string, handler: Function) {
      if (event === "connection") io.connectionHandlers.push(handler);
    },
    addSocket(id: string) {
      const socket = fakeSocket(id);
      io.sockets.connected[id] = socket;
      return socket;
    },
  };
  return io;
}

/** Action names (payload.action) of the room emits, in order. */
export function actionsOf(emitted: Emit[]): string[] {
  return emitted
    .map((e) => e.payload && e.payload.payload && e.payload.payload.action)
    .filter((action) => !!action);
}

/** The emits whose payload action equals `action`. */
export function emitsOf(emitted: Emit[], action: string): Emit[] {
  return emitted.filter(
    (e) => e.payload && e.payload.payload && e.payload.payload.action === action,
  );
}

// ---------------------------------------------------------------------------
// A GameCore wired to a fresh store and a recording socket server
// ---------------------------------------------------------------------------

export interface Harness {
  core: GameCore;
  store: InMemoryStore;
  io: FakeIo;
  emitted: Emit[];
}

/**
 * A fresh store, socket server and GameCore. `new InMemoryStore()` re-points the
 * store singleton, so every test builds its own harness and shares no state.
 */
export function makeCore(): Harness {
  const store = new InMemoryStore();
  const io = recordingIo();
  const core = new GameCore(io as any);
  return { core, store, io, emitted: io.emitted };
}

export function seedGame(harness: Harness, game: ICardGame, gameId: string = GAME_ID): ICardGame {
  harness.store.saveGame(gameId, game);
  return game;
}

export function liveGame(harness: Harness, gameId: string = GAME_ID): any {
  return harness.store.fetchGame(gameId);
}

// ---------------------------------------------------------------------------
// Calling handlers and reading their callbacks
// ---------------------------------------------------------------------------

export interface Reply {
  /** How many times the callback was invoked. */
  called: number;
  err: any;
  res: any;
  code?: string;
  message?: string;
}

export function call(invoke: (cb: Function) => void): Reply {
  const reply: Reply = { called: 0, err: undefined, res: undefined };
  invoke((err: any, res: any) => {
    reply.called++;
    reply.err = err;
    reply.res = res;
    reply.code = res && res.code;
    reply.message = res && res.message;
  });
  return reply;
}

/** A human (or bot) plays a card from the seat's own token. */
export function drop(
  harness: Harness,
  seat: number,
  card: string,
  options: { gameId?: string; claimedPlayerId?: string; token?: string } = {},
): Reply {
  const gameId = options.gameId || GAME_ID;
  const seated = liveGame(harness, gameId).players[seat];
  return call((cb) =>
    harness.core.onDropCard(
      {
        gameId,
        card,
        token: options.token === undefined ? seated.token : options.token,
        playerId: options.claimedPlayerId || seated.playerId,
      } as any,
      cb,
    ),
  );
}

export interface BidFields {
  bidValue?: any;
  suit?: any;
  [field: string]: any;
}

export function bid(
  harness: Harness,
  seat: number,
  action: string,
  fields: BidFields = {},
  gameId: string = GAME_ID,
): Reply {
  const seated = liveGame(harness, gameId).players[seat];
  return call((cb) =>
    harness.core.onBiddingAction({ gameId, token: seated.token, action, ...fields }, cb),
  );
}

// ---------------------------------------------------------------------------
// Snapshots and non-mutation
// ---------------------------------------------------------------------------

/** A plain-data copy of a game (Dates become strings) for before/after comparison. */
export function snapshot(game: any): any {
  return clone(game);
}

export function expectRejected(reply: Reply, messagePart?: string): void {
  expect(reply.called).toBe(1);
  expect(reply.err).toBeNull();
  expect(reply.code).toBe("FAILED");
  if (messagePart) {
    expect(reply.message).toContain(messagePart);
  }
}

/**
 * Runs an action that must be rejected and proves it changed nothing: the reply
 * is FAILED, the stored game is deep-equal to its pre-action snapshot, and no
 * event was emitted to any room.
 */
export function expectRejectedWithoutMutation(
  harness: Harness,
  act: () => Reply,
  options: { gameId?: string; message?: string } = {},
): Reply {
  const gameId = options.gameId || GAME_ID;
  const before = snapshot(liveGame(harness, gameId));
  const emittedBefore = harness.emitted.length;

  const reply = act();

  expectRejected(reply, options.message);
  expect(snapshot(liveGame(harness, gameId))).toEqual(before);
  expect(harness.emitted.length).toBe(emittedBefore);
  return reply;
}

// ---------------------------------------------------------------------------
// Console noise: GameCore logs heavily
// ---------------------------------------------------------------------------

/** Silences console.log/warn/error for each test in the calling file. */
export function useQuietConsole(): void {
  let spies: jest.SpyInstance[] = [];
  beforeEach(() => {
    spies = [
      jest.spyOn(console, "log").mockImplementation(() => {}),
      jest.spyOn(console, "warn").mockImplementation(() => {}),
      jest.spyOn(console, "error").mockImplementation(() => {}),
    ];
  });
  afterEach(() => {
    spies.forEach((spy) => spy.mockRestore());
    spies = [];
  });
}
