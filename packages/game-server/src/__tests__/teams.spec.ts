/**
 * Pins the shared team helper to every place the live game decides teams, so
 * training can never disagree with real gameplay.
 */

import { RESPONSE_CODES } from "@rcg/common";
import { GameCore } from "../core/GameCore";
import { TeamBotAgent } from "../agents/TeamBotAgent";
import { resolvePlayerTeam, resolveSeatTeam } from "../core/teams";
import { GAME_ID, fakeIoServer, makePlayers, makeTrainingGame } from "./helpers/training-fixtures";

describe("resolveSeatTeam / resolvePlayerTeam", () => {
  test("even seats are Team A and odd seats are Team B", () => {
    expect([0, 1, 2, 3, 4, 5].map(resolveSeatTeam)).toEqual([
      "A", "B", "A", "B", "A", "B",
    ]);
  });

  test("resolves a player's team from their seat", () => {
    const players = makePlayers();
    expect(resolvePlayerTeam(players, players[2].playerId)).toBe("A");
    expect(resolvePlayerTeam(players, players[5].playerId)).toBe("B");
  });

  test("returns null for a player who is not seated", () => {
    expect(resolvePlayerTeam(makePlayers(), "nobody")).toBeNull();
  });
});

describe("matches the live game's team rules", () => {
  const players = makePlayers();
  const game = makeTrainingGame({}, players);

  test("GameCore.getPlayerTeam", () => {
    const core: any = new GameCore(fakeIoServer());
    players.forEach((p) => {
      expect(core.getPlayerTeam(game, p.playerId)).toBe(
        resolvePlayerTeam(players, p.playerId),
      );
    });
  });

  test("TeamBotAgent.getTeamId (0 = Team A, 1 = Team B)", () => {
    const bot: any = new TeamBotAgent();
    players.forEach((p) => {
      const expected = resolvePlayerTeam(players, p.playerId) === "A" ? 0 : 1;
      expect(bot.getTeamId(p.playerId, game)).toBe(expected);
    });
  });

  test("onSwitchTeamPositions accepts only a player's own team", () => {
    const core = new GameCore(fakeIoServer());
    const ask = (playerId: string, team: "A" | "B") => {
      core.inMemoryStore.saveGame(
        GAME_ID,
        makeTrainingGame({ isGameComplete: true }, makePlayers()),
      );
      let code: string | undefined;
      core.onSwitchTeamPositions({ gameId: GAME_ID, playerId, team }, (_e: any, r: any) => {
        code = r.code;
      });
      return code;
    };

    players.forEach((p) => {
      const own = resolvePlayerTeam(players, p.playerId) as "A" | "B";
      const other = own === "A" ? "B" : "A";
      expect(ask(p.playerId, own)).toBe(RESPONSE_CODES.success);
      expect(ask(p.playerId, other)).toBe(RESPONSE_CODES.failed);
    });
  });
});
