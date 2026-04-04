// Log level hierarchy: info < warn < error
// Production default: "info"  — logEvent + logError emit output.
// Local default:      "info"  — everything emits (easy to flip back).
// Override via env:   LOG_LEVEL=info|warn|error
const LEVELS = { info: 0, warn: 1, error: 2 } as const;
type Level = keyof typeof LEVELS;

// Lazily resolve Sentry only in production so the package is never required locally.
function getSentry(): any {
  if (process.env.NODE_ENV === "production" && process.env.SENTRY_DSN) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      return require("@sentry/node");
    } catch {
      // @sentry/node not installed - silently skip
    }
  }
  return null;
}

function activeLevel(): Level {
  const env = (process.env.LOG_LEVEL || "").toLowerCase();
  if (env === "info" || env === "warn" || env === "error") return env;
  // Default: info in all environments
  return "info";
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

  /** Key game/user events (info level) */
  public static logEvent(event: string, data: Record<string, any> = {}) {
    if (process.env.NODE_ENV === "test" || !shouldLog("info")) return;

    console.log(
      JSON.stringify({
        level: "info",
        event,
        ...data,
        ts: new Date().toISOString(),
      }),
    );

    // Attach as a breadcrumb in Sentry so errors show what led up to them
    const sentry = getSentry();
    if (sentry) {
      sentry.addBreadcrumb({
        category: "game.event",
        message: event,
        data,
        level: "info",
      });
    }
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
    const sentry = getSentry();
    if (sentry) {
      sentry.captureException(err, { extra: { title } });
    }
  }
}
