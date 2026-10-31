/**
 * Bot Training Mode configuration tests.
 *
 * Covers: default-off behavior, enabling only via server-side environment,
 * production override, immutability, startup scripts, and that nothing a
 * client sends can change the flag.
 */

import * as fs from "fs";
import * as path from "path";
import { MESSAGES } from "@rcg/common";
import {
  resolveTrainingConfig,
  TRAINING_DISABLED,
} from "../core/trainingConfig";
import { GameCore } from "../core/GameCore";
import { SocketServer } from "../core/SocketServer";

const GAME_SERVER_DIR = path.resolve(__dirname, "../..");
const ROOT_DIR = path.resolve(GAME_SERVER_DIR, "../..");

function readJson(file: string): any {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function fakeIoServer(): any {
  return { to: () => ({ emit: () => {} }), sockets: { connected: {} } };
}

describe("resolveTrainingConfig", () => {
  test("is disabled when the environment has no flag (normal startup)", () => {
    expect(resolveTrainingConfig({}).botTrainingEnabled).toBe(false);
  });

  test("is enabled by BOT_TRAINING_MODE=true", () => {
    const config = resolveTrainingConfig({ BOT_TRAINING_MODE: "true" });
    expect(config.botTrainingEnabled).toBe(true);
  });

  test("is enabled by BOT_TRAINING_MODE=1 and ignores case and whitespace", () => {
    expect(
      resolveTrainingConfig({ BOT_TRAINING_MODE: "1" }).botTrainingEnabled,
    ).toBe(true);
    expect(
      resolveTrainingConfig({ BOT_TRAINING_MODE: " TRUE " }).botTrainingEnabled,
    ).toBe(true);
  });

  test.each(["", "false", "0", "yes", "on", "enabled"])(
    "stays disabled for BOT_TRAINING_MODE=%j",
    (value) => {
      expect(
        resolveTrainingConfig({ BOT_TRAINING_MODE: value }).botTrainingEnabled,
      ).toBe(false);
    },
  );

  test("is forced off in production and reports a warning", () => {
    const warnings: string[] = [];
    const config = resolveTrainingConfig(
      { BOT_TRAINING_MODE: "true", NODE_ENV: "production" },
      (message) => warnings.push(message),
    );
    expect(config.botTrainingEnabled).toBe(false);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/production/);
  });

  test("does not warn in production when training was not requested", () => {
    const warnings: string[] = [];
    resolveTrainingConfig({ NODE_ENV: "production" }, (m) => warnings.push(m));
    expect(warnings).toHaveLength(0);
  });

  test("uses an absolute training-data output directory", () => {
    const { outputDir } = resolveTrainingConfig({});
    expect(path.isAbsolute(outputDir)).toBe(true);
    expect(path.basename(outputDir)).toBe("training-data");
  });

  test("returns a frozen object that cannot be flipped at runtime", () => {
    const config: any = resolveTrainingConfig({ BOT_TRAINING_MODE: "true" });
    expect(Object.isFrozen(config)).toBe(true);
    expect(() => {
      config.botTrainingEnabled = false;
    }).toThrow();
    expect(config.botTrainingEnabled).toBe(true);
  });

  test("TRAINING_DISABLED is disabled and frozen", () => {
    expect(TRAINING_DISABLED.botTrainingEnabled).toBe(false);
    expect(Object.isFrozen(TRAINING_DISABLED)).toBe(true);
  });

  test("version metadata comes from the environment, defaulting to unknown", () => {
    const defaults = resolveTrainingConfig({});
    expect(defaults.appVersion).toBe("unknown");
    expect(defaults.gitCommit).toBe("unknown");

    const stamped = resolveTrainingConfig({
      npm_package_version: "1.2.3",
      GIT_COMMIT: "deadbeef",
    });
    expect(stamped.appVersion).toBe("1.2.3");
    expect(stamped.gitCommit).toBe("deadbeef");
  });
});

describe("startup scripts", () => {
  const nodemon = readJson(path.join(GAME_SERVER_DIR, "nodemon.json"));
  const nodemonTraining = readJson(
    path.join(GAME_SERVER_DIR, "nodemon.training.json"),
  );
  const serverPkg = readJson(path.join(GAME_SERVER_DIR, "package.json"));
  const rootPkg = readJson(path.join(ROOT_DIR, "package.json"));

  test("normal nodemon config does not enable training", () => {
    expect(nodemon.env.BOT_TRAINING_MODE).toBeUndefined();
  });

  test("training nodemon config enables training", () => {
    expect(nodemonTraining.env.BOT_TRAINING_MODE).toBe("true");
  });

  test("training nodemon config differs from the normal one only by the flag", () => {
    const { BOT_TRAINING_MODE, ...envWithoutFlag } = nodemonTraining.env;
    expect({ ...nodemonTraining, env: envWithoutFlag }).toEqual(nodemon);
  });

  test("npm start scripts are unchanged and training scripts exist", () => {
    expect(serverPkg.scripts.start).toBe("nodemon");
    expect(serverPkg.scripts["start:training"]).toBe(
      "nodemon --config nodemon.training.json",
    );
    expect(rootPkg.scripts["run:server"]).toBe(
      "cd ./packages/game-server && npm start",
    );
    expect(rootPkg.scripts.start).toBe(
      'concurrently "npm run run:server" "npm run run:client"',
    );
    expect(rootPkg.scripts["start:training"]).toContain("run:server:training");
    expect(rootPkg.scripts["run:server:training"]).toContain(
      "npm run start:training",
    );
  });

  test("training output is git-ignored", () => {
    const gitignore = fs.readFileSync(path.join(ROOT_DIR, ".gitignore"), "utf8");
    expect(gitignore.split("\n").map((l) => l.trim())).toContain(
      "training-data/",
    );
  });
});

describe("client cannot enable training", () => {
  test("GameCore defaults to disabled when no config is supplied", () => {
    expect(new GameCore(fakeIoServer()).training.botTrainingEnabled).toBe(
      false,
    );
  });

  test("GameCore keeps exactly the config it was given", () => {
    const training = resolveTrainingConfig({ BOT_TRAINING_MODE: "true" });
    expect(new GameCore(fakeIoServer(), { training }).training).toBe(training);
  });

  test("socket payloads carrying training fields do not change the flag", () => {
    const server: any = new SocketServer(fakeIoServer());
    const config = server.gameCore.training;
    const socket: any = { id: "sock-training-test", join: () => {} };

    const hostile = {
      botTrainingEnabled: true,
      botTrainingMode: true,
      BOT_TRAINING_MODE: "true",
      training: { botTrainingEnabled: true, enabled: true },
    };

    let loginResponse: any;
    server.onDataHandler(
      socket,
      {
        operation: MESSAGES.login,
        payload: { userId: "trainer", ...hostile },
      },
      (_err: any, response: any) => {
        loginResponse = response;
      },
    );
    server.onDataHandler(
      socket,
      { operation: MESSAGES.ping, payload: hostile },
      () => {},
    );

    expect(loginResponse).toBeDefined();
    expect(server.gameCore.training).toBe(config);
    expect(server.gameCore.training.botTrainingEnabled).toBe(false);
  });
});
