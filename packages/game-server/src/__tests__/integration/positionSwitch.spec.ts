/**
 * Team position switch ("shuffle seats").
 *
 * A team may reshuffle its own three seats once, only after a hand has finished
 * and before the next one is dealt, so nobody can swap seats after seeing new
 * cards. The other team's seats are never touched.
 */

import { IPlayer } from "../../core/models/IPlayer";
import { GAME_ID, cardPlayGame, sixPlayers } from "../helpers/builders";
import {
  Harness,
  call,
  emitsOf,
  expectRejectedWithoutMutation,
  liveGame,
  makeCore,
  seedGame,
  useQuietConsole,
} from "../helpers/harness";
import { seedMathRandom, useGameTimers } from "../helpers/timers";

useQuietConsole();
useGameTimers();

let restoreRandom: () => void;
beforeEach(() => {
  restoreRandom = seedMathRandom(99);
});
afterEach(() => {
  restoreRandom();
});

function finishedTable(options: { players?: IPlayer[]; overrides?: { [field: string]: any } } = {}): Harness {
  const players = options.players || sixPlayers();
  const harness = makeCore();
  players.forEach((p) => harness.io.addSocket(p.socketId));
  seedGame(
    harness,
    cardPlayGame({
      players,
      hands: [[], [], [], [], [], []],
      overrides: { isGameComplete: true, isGameCompleted: true, ...(options.overrides || {}) },
    }),
  );
  return harness;
}

const requestSwitch = (harness: Harness, playerId: string, team: string) =>
  call((cb) => harness.core.onSwitchTeamPositions({ gameId: GAME_ID, playerId, team }, cb));

const answer = (harness: Harness, approved: boolean, approvingPlayerId: string = "Cee") =>
  call((cb) => harness.core.onApprovePositionSwitch({ gameId: GAME_ID, playerId: "x", approvingPlayerId, approved }, cb));

const seatingOf = (harness: Harness): string[] => liveGame(harness).players.map((p: IPlayer) => p.playerId);

describe("when a switch may be requested", () => {
  test("not while a hand is in progress, so seats cannot change after cards are dealt", () => {
    const harness = finishedTable({ overrides: { isGameComplete: false, isGameCompleted: false } });
    expectRejectedWithoutMutation(harness, () => requestSwitch(harness, "Ann", "A"), {
      message: "only allowed after a game ends",
    });
  });

  test("not for a game that does not exist", () => {
    const harness = finishedTable();
    const reply = call((cb) => harness.core.onSwitchTeamPositions({ gameId: "nope", playerId: "Ann", team: "A" }, cb));
    expect(reply.code).toBe("FAILED");
    expect(reply.message).toBe("Game not found");
  });

  test("not for a player who is not in the game", () => {
    const harness = finishedTable();
    expectRejectedWithoutMutation(harness, () => requestSwitch(harness, "Zed", "A"), {
      message: "Player not found in game",
    });
  });

  test("not for the other team's seats", () => {
    const harness = finishedTable();
    expectRejectedWithoutMutation(harness, () => requestSwitch(harness, "Ann", "B"), {
      message: "own team",
    });
  });

  test.each([["A", "Ann"], ["B", "Ben"]])("not by Team %s once it has used its switch", (team: string, requester: string) => {
    const harness = finishedTable({ overrides: team === "A" ? { teamAPositionSwitchUsed: true } : { teamBPositionSwitchUsed: true } });
    expectRejectedWithoutMutation(harness, () => requestSwitch(harness, requester, team), {
      message: `Team ${team} has already used their position switch`,
    });
  });

  test("not twice at once for the same team", () => {
    const harness = finishedTable();
    expect(requestSwitch(harness, "Ann", "A").code).toBe("SUCCESS");
    expectRejectedWithoutMutation(harness, () => requestSwitch(harness, "Cal", "A"), {
      message: "already pending",
    });
  });
});

describe("asking teammates", () => {
  test("a request is held as pending and only the requester's human teammates are asked", () => {
    const harness = finishedTable();
    const before = seatingOf(harness);
    const reply = requestSwitch(harness, "Ann", "A");

    expect(reply.code).toBe("SUCCESS");
    expect(liveGame(harness).pendingPositionSwitch).toEqual({ requestedBy: "Ann", team: "A", approvals: [] });
    expect(seatingOf(harness)).toEqual(before);

    const asked = (socketId: string) =>
      emitsOf(harness.emitted.filter((e) => e.room === socketId), "POSITION_SWITCH_REQUEST").length;
    expect(asked("sock-2")).toBe(1);
    expect(asked("sock-4")).toBe(1);
    expect(asked("sock-0")).toBe(0);
    ["sock-1", "sock-3", "sock-5"].forEach((id) => expect(asked(id)).toBe(0));
  });

  test("a denial clears the request, keeps the seats and tells the requester", () => {
    const harness = finishedTable();
    const before = seatingOf(harness);
    requestSwitch(harness, "Ann", "A");
    const reply = answer(harness, false, "Cal");

    expect(reply.code).toBe("SUCCESS");
    expect(liveGame(harness).pendingPositionSwitch).toBeUndefined();
    expect(liveGame(harness).teamAPositionSwitchUsed).toBeFalsy();
    expect(seatingOf(harness)).toEqual(before);
    expect(emitsOf(harness.emitted.filter((e) => e.room === "sock-0"), "POSITION_SWITCH_DENIED")).toHaveLength(1);
  });

  test("after a denial the team may ask again", () => {
    const harness = finishedTable();
    requestSwitch(harness, "Ann", "A");
    answer(harness, false, "Cal");
    expect(requestSwitch(harness, "Ann", "A").code).toBe("SUCCESS");
  });

  test("an answer with nothing pending is refused", () => {
    const harness = finishedTable();
    expectRejectedWithoutMutation(harness, () => answer(harness, true), {
      message: "No pending position switch request found",
    });
  });

  test("an approval after the next hand has started is refused and the stale request is dropped", () => {
    const harness = finishedTable();
    requestSwitch(harness, "Ann", "A");
    const before = seatingOf(harness);
    liveGame(harness).isGameComplete = false;

    const reply = answer(harness, true, "Cal");
    expect(reply.code).toBe("FAILED");
    expect(reply.message).toContain("only allowed after a game ends");
    expect(seatingOf(harness)).toEqual(before);
    expect(liveGame(harness).pendingPositionSwitch).toBeUndefined();
    expect(liveGame(harness).teamAPositionSwitchUsed).toBeFalsy();
  });
});

describe("executing a switch", () => {
  test.each([
    ["A", "Ann", [0, 2, 4], [1, 3, 5]],
    ["B", "Ben", [1, 3, 5], [0, 2, 4]],
  ] as Array<[string, string, number[], number[]]>)(
    "Team %s's players are permuted among Team %s's own seats and the other team does not move",
    (team: string, requester: string, ownSeats: number[], otherSeats: number[]) => {
      const harness = finishedTable();
      const before = seatingOf(harness);
      requestSwitch(harness, requester, team);
      expect(answer(harness, true, "Cal").code).toBe("SUCCESS");

      const after = seatingOf(harness);
      expect(after.slice().sort()).toEqual(before.slice().sort());
      expect(ownSeats.map((s) => after[s]).sort()).toEqual(ownSeats.map((s) => before[s]).sort());
      otherSeats.forEach((s) => expect(after[s]).toBe(before[s]));
    },
  );

  test("the switch is marked as used for that team only and the request is cleared", () => {
    const harness = finishedTable();
    requestSwitch(harness, "Ann", "A");
    answer(harness, true);

    const game = liveGame(harness);
    expect(game.teamAPositionSwitchUsed).toBe(true);
    expect(game.teamBPositionSwitchUsed).toBeFalsy();
    expect(game.pendingPositionSwitch).toBeUndefined();
  });

  test("a team cannot switch twice but the other team still can", () => {
    const harness = finishedTable();
    requestSwitch(harness, "Ann", "A");
    answer(harness, true);

    const requesterNow = liveGame(harness).players[0].playerId;
    expectRejectedWithoutMutation(harness, () => requestSwitch(harness, requesterNow, "A"), {
      message: "Team A has already used their position switch",
    });
    expect(requestSwitch(harness, "Ben", "B").code).toBe("SUCCESS");
  });

  test("every player keeps their own token and socket", () => {
    const harness = finishedTable();
    const before = liveGame(harness).players.map((p: IPlayer) => `${p.playerId}|${p.token}|${p.socketId}`).sort();
    requestSwitch(harness, "Ann", "A");
    answer(harness, true);
    const after = liveGame(harness).players.map((p: IPlayer) => `${p.playerId}|${p.token}|${p.socketId}`).sort();
    expect(after).toEqual(before);
  });

  test("the starter is whoever now sits in the starter's seat", () => {
    const harness = finishedTable();
    requestSwitch(harness, "Ann", "A");
    answer(harness, true);

    const game = liveGame(harness);
    expect(game.startingPlayerId).toBe(game.players[0].playerId);
  });

  test("the new seating is broadcast and the completion is announced with the used flags", () => {
    const harness = finishedTable();
    requestSwitch(harness, "Ann", "A");
    answer(harness, true);

    const completed = emitsOf(harness.emitted, "POSITION_SWITCH_COMPLETED");
    expect(completed).toHaveLength(1);
    expect(completed[0].payload.payload.data).toMatchObject({ team: "A", teamAPositionSwitchUsed: true });
    expect(emitsOf(harness.emitted, "PLAYER_INFO")).toHaveLength(1);
  });

  test("a requester with no other human teammate is switched at once", () => {
    const players = sixPlayers({
      2: { isBotAgent: true, socketId: "bot-socket-2" },
      4: { isBotAgent: true, socketId: "bot-socket-4" },
    });
    const harness = finishedTable({ players });
    const reply = requestSwitch(harness, "Ann", "A");

    expect(reply.code).toBe("SUCCESS");
    expect(liveGame(harness).teamAPositionSwitchUsed).toBe(true);
    expect(liveGame(harness).pendingPositionSwitch).toBeUndefined();
  });
});

describe("the switch and the next hand", () => {
  test("a restart after the switch keeps the new seating and rotates the starter from the starter's seat", () => {
    const harness = finishedTable();
    requestSwitch(harness, "Ann", "A");
    answer(harness, true);
    const seated = seatingOf(harness);

    call((cb) => harness.core.onRestartGame({ gameId: GAME_ID } as any, cb));

    const game = liveGame(harness);
    expect(seatingOf(harness)).toEqual(seated);
    expect(game.startingPlayerId).toBe(seated[1]);
    expect(game.currentTurn).toBe(1);
    expect(game.teamAPositionSwitchUsed).toBe(true);
  });

  test("once the next hand is dealt a switch can no longer be requested", () => {
    const harness = finishedTable();
    call((cb) => harness.core.onRestartGame({ gameId: GAME_ID } as any, cb));
    expectRejectedWithoutMutation(harness, () => requestSwitch(harness, "Ann", "A"), {
      message: "only allowed after a game ends",
    });
  });
});
