/**
 * Bot Training Mode configuration.
 *
 * Resolved exactly once, in startServer, and passed down to the components that
 * need it. Nothing else should read BOT_TRAINING_MODE from the environment, and
 * nothing a client sends can change it.
 */
import * as path from "path";

export interface TrainingConfig {
  /** True only when the server process was started in training mode. */
  readonly botTrainingEnabled: boolean;
  /** Directory the training JSONL files are written to. */
  readonly outputDir: string;
  /** Application version stamped on training records ("unknown" if not set). */
  readonly appVersion: string;
  /** Git commit stamped on training records, from GIT_COMMIT ("unknown" if not set). */
  readonly gitCommit: string;
}

export const DEFAULT_TRAINING_OUTPUT_DIR = "training-data";

/** Shared "off" value used when no training config is supplied. */
export const TRAINING_DISABLED: TrainingConfig = Object.freeze({
  botTrainingEnabled: false,
  outputDir: path.resolve(DEFAULT_TRAINING_OUTPUT_DIR),
  appVersion: "unknown",
  gitCommit: "unknown",
});

/**
 * Resolves the training configuration from the process environment.
 * Training is enabled only when BOT_TRAINING_MODE is "true" or "1", and is
 * always forced off when NODE_ENV is "production".
 * @param env The environment to read (injectable for tests).
 * @param onWarning Called with a message when a requested flag is overridden.
 */
export function resolveTrainingConfig(
  env: { [key: string]: string | undefined } = process.env,
  onWarning: (message: string) => void = () => {},
): TrainingConfig {
  const requested = ["true", "1"].indexOf(
    (env.BOT_TRAINING_MODE || "").trim().toLowerCase(),
  ) >= 0;

  let enabled = requested;
  if (requested && env.NODE_ENV === "production") {
    enabled = false;
    onWarning(
      "BOT_TRAINING_MODE is set but ignored because NODE_ENV=production.",
    );
  }

  return Object.freeze({
    botTrainingEnabled: enabled,
    outputDir: path.resolve(DEFAULT_TRAINING_OUTPUT_DIR),
    appVersion: env.npm_package_version || "unknown",
    gitCommit: env.GIT_COMMIT || "unknown",
  });
}
