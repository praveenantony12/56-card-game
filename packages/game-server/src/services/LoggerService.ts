import * as Sentry from "@sentry/node";

// Log level hierarchy: info < warn < error
// Production default: "warn"  — only logEvent + logError emit output.
// Local default:      "info"  — everything emits (easy to flip back).
// Override via env:   LOG_LEVEL=info|warn|error
const LEVELS = { info: 0, warn: 1, error: 2 } as const;
type Level = keyof typeof LEVELS;

function activeLevel(): Level {
  const env = (process.env.LOG_LEVEL || "").toLowerCase();
  if (env === "info" || env === "warn" || env === "error") return env;
  // Default: warn in production, info everywhere else
  return process.env.NODE_ENV === "production" ? "warn" : "info";
}

function shouldLog(msgLevel: Level): boolean {
  return LEVELS[msgLevel] >= LEVELS[activeLevel()];
}

export class LoggerService {
  /** General diagnostic messages (info level — suppressed in production by default) */
  public static log(title: string, message: any) {
    if (process.env.NODE_ENV === "test" || !shouldLog("info")) return;

    console.log(
      JSON.stringify({
        level: "info",
        title,
        message,
        ts: new Date().toISOString(),
      }),
    );
  }

  /** Key game/user events (warn level — visible in production by default) */
  public static logEvent(event: string, data: Record<string, any> = {}) {
    if (process.env.NODE_ENV === "test" || !shouldLog("warn")) return;

    console.log(
      JSON.stringify({
        level: "warn",
        event,
        ...data,
        ts: new Date().toISOString(),
      }),
    );

    // Attach as a breadcrumb in Sentry so errors show what led up to them
    Sentry.addBreadcrumb({
      category: "game.event",
      message: event,
      data,
      level: "info",
    });
  }

  /** Errors — always logged and forwarded to Sentry */
  public static logError(title: string, message: any) {
    if (process.env.NODE_ENV === "test") return;

    console.error(
      JSON.stringify({
        level: "error",
        title,
        message: String(message),
        ts: new Date().toISOString(),
      }),
    );

    const err =
      message instanceof Error ? message : new Error(`${title}: ${message}`);
    Sentry.captureException(err, { extra: { title } });
  }
}
