/**
 * Teams and seating.
 *
 * Seats 0, 2, 4 are Team A and seats 1, 3, 5 are Team B. The team of a seat is
 * computed in three places (GameCore, TeamBotAgent, and the oracle); they must
 * agree. startGame also reorders players so humans end up together, and must
 * never lose, duplicate or invent a player while doing so.
 */

import { IPlayer } from "../../core/models/IPlayer";
import { InMemoryStore } from "../../persistence/InMemoryStore";
import { ALL_CARDS, GAME_ID, sixPlayers } from "../helpers/builders";
import { assertCardsConserved, assertSixUniquePlayers } from "../helpers/assertions";
import { liveGame, makeCore, useQuietConsole } from "../helpers/harness";
import { botTeamIdOf, gameCoreTeamOf } from "../helpers/privateAccess";
import { teamOfSeat } from "../helpers/referenceRules";
import { useGameTimers } from "../helpers/timers";

useQuietConsole();
useGameTimers();

describe("team of a seat", () => {
  const players = sixPlayers();
  const game: any = { players };

  test.each([0, 1, 2, 3, 4, 5].map((seat) => [seat, seat % 2 === 0 ? "A" : "B"]))(
    "seat %i is on team %s according to the server and the oracle",
    (seat: number, team: string) => {
      const { core } = makeCore();
      expect(teamOfSeat(seat)).toBe(team);
      expect(gameCoreTeamOf(core, game, players[seat].playerId)).toBe(team);
    },
  );

  test.each([0, 1, 2, 3, 4, 5].map((seat) => [seat]))(
    "the bot's team numbering for seat %i matches the server's team",
    (seat: number) => {
      const { core } = makeCore();
      const botTeam = botTeamIdOf(game, players[seat].playerId);
      const serverTeam = gameCoreTeamOf(core, game, players[seat].playerId);
      expect(botTeam === 0 ? "A" : "B").toBe(serverTeam);
    },
  );

  test("teammates sit two seats apart and opponents alternate around the table", () => {
    for (let seat = 0; seat < 6; seat++) {
      expect(teamOfSeat(seat)).toBe(teamOfSeat((seat + 2) % 6));
      expect(teamOfSeat(seat)).not.toBe(teamOfSeat((seat + 1) % 6));
    }
  });
});

// ---------------------------------------------------------------------------
// startGame: seating, dealing and the opening state
// ---------------------------------------------------------------------------

function mixedPlayers(humanCount: number): IPlayer[] {
  const players: IPlayer[] = [];
  for (let i = 0; i < humanCount; i++) {
    players.push({
      playerId: `Human${i}`,
      token: `human-token-${i}`,
      socketId: `human-socket-${i}`,
      gameId: GAME_ID,
    });
  }
  for (let i = 0; i < 6 - humanCount; i++) {
    players.push({
      playerId: `Bot${i}`,
      token: `bot-token-${i}`,
      socketId: `bot-socket-${i}`,
      gameId: GAME_ID,
      isBotAgent: true,
    });
  }
  return players;
}

function startWith(players: IPlayer[], preserveOrder: boolean = false) {
  const harness = makeCore();
  players.forEach((p) => {
    if (!p.isBotAgent) harness.io.addSocket(p.socketId);
  });
  harness.core.startGame(GAME_ID, players, preserveOrder);
  return harness;
}

const humansOn = (game: any, parity: number): number =>
  game.players.filter((p: IPlayer, seat: number) => seat % 2 === parity && !p.isBotAgent).length;

describe("startGame seating", () => {
  // Humans on Team A / Team B for each human count, per the documented layouts
  // in GameCore.optimizeTeamAssignment.
  test.each([
    [6, 3, 3],
    [5, 3, 2],
    [4, 3, 1],
    [3, 3, 0],
    [2, 2, 0],
    [1, 1, 0],
  ] as Array<[number, number, number]>)(
    "with %i humans and the rest bots: %i humans on Team A, %i on Team B",
    (humanCount: number, onA: number, onB: number) => {
      const harness = startWith(mixedPlayers(humanCount));
      const game = liveGame(harness);
      expect(humansOn(game, 0)).toBe(onA);
      expect(humansOn(game, 1)).toBe(onB);
    },
  );

  test.each([6, 5, 4, 3, 2, 1].map((n) => [n]))(
    "with %i humans, six unique players are seated and nobody is lost or duplicated",
    (humanCount: number) => {
      const input = mixedPlayers(humanCount);
      const harness = startWith(input);
      const game = liveGame(harness);

      assertSixUniquePlayers(game);
      expect(game.players.map((p: IPlayer) => p.playerId).sort()).toEqual(input.map((p) => p.playerId).sort());
      expect(game.players.filter((p: IPlayer) => p.isBotAgent)).toHaveLength(6 - humanCount);
    },
  );

  test("preserving order keeps the given seating even with a mixed table", () => {
    const input = mixedPlayers(3);
    const harness = startWith(input, true);
    expect(liveGame(harness).players.map((p: IPlayer) => p.playerId)).toEqual(input.map((p) => p.playerId));
  });

  test("six humans keep the order in which they joined", () => {
    const input = mixedPlayers(6);
    const harness = startWith(input);
    expect(liveGame(harness).players.map((p: IPlayer) => p.playerId)).toEqual(input.map((p) => p.playerId));
  });
});

describe("startGame opening state", () => {
  test("every player is dealt eight cards and all 48 cards are held exactly once", () => {
    const game = liveGame(startWith(mixedPlayers(6)));
    game.players.forEach((p: IPlayer) => expect(game[p.token]).toHaveLength(8));
    assertCardsConserved(game, ALL_CARDS);
  });

  test("the hand opens in bidding with seat 0 to bid, scores at 10 to 10 and no cards captured", () => {
    const players = mixedPlayers(6);
    const game = liveGame(startWith(players));

    expect(game.isBiddingPhase).toBe(true);
    expect(game.currentTurn).toBe(0);
    expect(game.currentBiddingPlayerId).toBe(players[0].playerId);
    expect(game.startingPlayerId).toBe(players[0].playerId);
    expect(game.teamAScore).toBe(10);
    expect(game.teamBScore).toBe(10);
    expect(game.teamACards).toEqual([]);
    expect(game.teamBCards).toEqual([]);
    expect(game.droppedCards).toEqual([]);
    expect(game.isGameComplete).toBe(false);
    expect(game.bidHistory).toEqual([]);
    expect(game.finalBid).toBeUndefined();
  });

  test("each human receives their own hand and only their own hand", () => {
    const players = mixedPlayers(6);
    const harness = startWith(players);
    const game = liveGame(harness);

    players.forEach((p) => {
      const received = harness.io.sockets.connected[p.socketId].received
        .map((m: any) => m.payload && m.payload.payload && m.payload.payload.data && m.payload.payload.data.cards)
        .filter((cards: any) => Array.isArray(cards));
      expect(received).toEqual([game[p.token]]);
    });
  });

  test("bots are never sent cards over a socket", () => {
    const harness = startWith(mixedPlayers(3));
    expect(Object.keys(harness.io.sockets.connected).every((id) => id.indexOf("bot-socket-") !== 0)).toBe(true);
  });

  test("the bidding start is announced to the room with the starting bidder", () => {
    const players = mixedPlayers(6);
    const harness = startWith(players);
    const starts = harness.emitted.filter(
      (e) => e.payload && e.payload.payload && e.payload.payload.action === "biddingPhaseStart",
    );
    expect(starts).toHaveLength(1);
    expect(starts[0].payload.payload.data.currentBiddingPlayerId).toBe(players[0].playerId);
  });
});

// ---------------------------------------------------------------------------
// The in-memory store
// ---------------------------------------------------------------------------

describe("InMemoryStore", () => {
  test("a saved game can be fetched and an unknown game is undefined", () => {
    const store = new InMemoryStore();
    const game: any = { marker: 1 };
    store.saveGame("g1", game);
    expect(store.fetchGame("g1")).toBe(game);
    expect(store.fetchGame("missing")).toBeUndefined();
  });

  test("count and game ids reflect saves and deletes", () => {
    const store = new InMemoryStore();
    store.saveGame("g1", {} as any);
    store.saveGame("g2", {} as any);
    expect(store.count).toBe(2);
    expect(store.getAllGameIds().sort()).toEqual(["g1", "g2"]);

    store.deleteGame("g1");
    expect(store.count).toBe(1);
    expect(store.fetchGame("g1")).toBeUndefined();
    expect(store.getAllGameIds()).toEqual(["g2"]);
  });

  test("saving under an existing id replaces the game", () => {
    const store = new InMemoryStore();
    store.saveGame("g1", { v: 1 } as any);
    store.saveGame("g1", { v: 2 } as any);
    expect(store.count).toBe(1);
    expect((store.fetchGame("g1") as any).v).toBe(2);
  });

  test("two stores hold independent games", () => {
    const first = new InMemoryStore();
    first.saveGame("g1", { owner: "first" } as any);
    const second = new InMemoryStore();
    expect(second.fetchGame("g1")).toBeUndefined();
    expect(first.fetchGame("g1")).toBeDefined();
  });

  test("the singleton accessor points at the most recently created store", () => {
    const first = new InMemoryStore();
    expect(InMemoryStore.instance).toBe(first);
    const second = new InMemoryStore();
    expect(InMemoryStore.instance).toBe(second);
  });
});
