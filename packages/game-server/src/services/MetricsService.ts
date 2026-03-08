/**
 * In-memory metrics service.
 * Tracks logins, active connections and game activity since last server restart.
 * Exposed via the /api/stats endpoint.
 */
export class MetricsService {
  private static _totalLogins = 0;
  private static _totalGamesStarted = 0;
  private static _activeConnections = 0;
  private static _serverStartTime = new Date();

  public static incrementLogin() {
    this._totalLogins++;
  }

  public static incrementGameStarted() {
    this._totalGamesStarted++;
  }

  public static incrementConnection() {
    this._activeConnections++;
  }

  public static decrementConnection() {
    if (this._activeConnections > 0) {
      this._activeConnections--;
    }
  }

  public static getSnapshot(activeGames: number) {
    const uptimeMs = Date.now() - this._serverStartTime.getTime();
    const uptimeHours = Math.floor(uptimeMs / 3_600_000);
    const uptimeMins = Math.floor((uptimeMs % 3_600_000) / 60_000);
    return {
      serverStartTime: this._serverStartTime.toISOString(),
      uptime: `${uptimeHours}h ${uptimeMins}m`,
      totalLoginsSinceRestart: this._totalLogins,
      totalGamesStartedSinceRestart: this._totalGamesStarted,
      activeSocketConnections: this._activeConnections,
      activeGamesInMemory: activeGames,
    };
  }
}
