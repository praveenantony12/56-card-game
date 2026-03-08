import * as Sentry from "@sentry/node";

export class LoggerService {
  public static log(title: string, message: any) {
    const isTest = process.env.NODE_ENV === "test";

    if (isTest === true) {
      return;
    }

    // Structured JSON log — easy to search in Render's log viewer
    console.log(
      JSON.stringify({ level: "info", title, message, ts: new Date().toISOString() })
    );
  }

  public static logEvent(event: string, data: Record<string, any> = {}) {
    const isTest = process.env.NODE_ENV === "test";
    if (isTest) return;

    console.log(
      JSON.stringify({ level: "event", event, ...data, ts: new Date().toISOString() })
    );
  }

  public static logError(title: string, message: any) {
    const isTest = process.env.NODE_ENV === "test";

    if (isTest === true) {
      return;
    }

    console.error(
      JSON.stringify({ level: "error", title, message: String(message), ts: new Date().toISOString() })
    );

    // Forward to Sentry for notifications
    const err = message instanceof Error ? message : new Error(`${title}: ${message}`);
    Sentry.captureException(err, { extra: { title } });
  }
}
