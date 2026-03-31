import * as React from "react";
import { inject, observer } from "mobx-react";
import { IStore } from "../../stores/IStore";
import "../../styles/theme.css";

interface IProps {
  store?: IStore;
  onBack: () => void;
  playerName: string;
}

interface IState {
  selectedBotCount: number;
  isCreating: boolean;
  isWaiting: boolean;
  gameCreated: boolean;
  copiedGameId: boolean;
  copiedLink: boolean;
}

@inject("store")
@observer
class HostGame extends React.Component<IProps, IState> {
  constructor(props: IProps) {
    super(props);
    this.state = {
      selectedBotCount: 5, // Default to 5 bots for immediate play
      isCreating: false,
      isWaiting: false,
      gameCreated: false,
      copiedGameId: false,
      copiedLink: false,
    };
  }

  private get store(): IStore {
    return this.props.store as IStore;
  }

  private get gameInfo() {
    return this.store.game;
  }

  componentDidMount() {
    // Set game mode to create when component mounts
    this.store.setGameModeCreate();
    // Auto-sign in with the player name
    this.store.signIn(this.props.playerName);
  }

  private handleBotCountSelect = (count: number) => {
    this.setState({ selectedBotCount: count });
  };

  private handleCreateGame = async () => {
    const { selectedBotCount } = this.state;

    this.setState({ isCreating: true });

    // Add bots based on selection
    const startImmediately = selectedBotCount === 5;

    try {
      await this.store.addBots(selectedBotCount, startImmediately);
      this.setState({
        isCreating: false,
        gameCreated: true,
        isWaiting: !startImmediately,
      });
    } catch (error) {
      this.setState({ isCreating: false });
    }
  };

  private copyGameId = () => {
    const gameId = this.gameInfo.sharedGameId;
    if (gameId) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(gameId).then(() => {
          this.setState({ copiedGameId: true });
          setTimeout(() => this.setState({ copiedGameId: false }), 2000);
        });
      }
    }
  };

  private copyShareableLink = () => {
    const gameId = this.gameInfo.sharedGameId;
    if (gameId) {
      const shareableUrl = this.store.getShareableGameUrl(gameId);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(shareableUrl).then(() => {
          this.setState({ copiedLink: true });
          setTimeout(() => this.setState({ copiedLink: false }), 2000);
        });
      }
    }
  };

  public render() {
    const {
      selectedBotCount,
      isCreating,
      isWaiting,
      gameCreated,
      copiedGameId,
      copiedLink,
    } = this.state;
    const { sharedGameId, canStartGame, error } = this.gameInfo;

    // Show game grid if game has started
    if (canStartGame) {
      return null;
    }

    return (
      <div style={styles.container}>
        <div style={styles.glowEffect} />

        <div style={styles.content}>
          {/* Header */}
          <div style={styles.header}>
            <button onClick={this.props.onBack} style={styles.backButton}>
              <span style={styles.backIcon}>←</span>
              Back
            </button>
            <h1 style={styles.title}>Host a Table</h1>
            <p style={styles.subtitle}>
              Create your game and choose your opponents
            </p>
          </div>

          {/* Main Card */}
          <div style={styles.card}>
            {!gameCreated ? (
              /* Bot Selection Phase */
              <>
                <div style={styles.section}>
                  <h3 style={styles.sectionTitle}>Choose Bot Count</h3>
                  <p style={styles.sectionDescription}>
                    Select how many AI opponents to add. The game needs exactly
                    6 players total.
                  </p>

                  <div style={styles.botGrid}>
                    {[0, 1, 2, 3, 4, 5].map((count) => (
                      <button
                        key={count}
                        onClick={() => this.handleBotCountSelect(count)}
                        style={{
                          ...styles.botButton,
                          ...(selectedBotCount === count
                            ? styles.botButtonSelected
                            : {}),
                        }}
                      >
                        <span
                          style={{
                            ...styles.botCount,
                            color:
                              selectedBotCount === count
                                ? "#6366f1"
                                : "#a1a1aa",
                          }}
                        >
                          {count}
                        </span>
                        <span style={styles.botLabel}>
                          {count === 0
                            ? "No Bots"
                            : count === 1
                              ? "Bot"
                              : "Bots"}
                        </span>
                        {count === 5 && (
                          <span style={styles.botBadge}>Start Now</span>
                        )}
                        {count === 0 && (
                          <span style={styles.botBadgeSecondary}>
                            Full Table
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Summary */}
                <div style={styles.summary}>
                  <div style={styles.summaryRow}>
                    <span style={styles.summaryLabel}>Configuration</span>
                  </div>
                  <div style={styles.summaryValue}>
                    <span style={styles.summaryHighlight}>1</span> You
                    <span style={styles.summarySeparator}>+</span>
                    <span style={styles.summaryHighlight}>
                      {selectedBotCount}
                    </span>{" "}
                    {selectedBotCount === 1 ? "Bot" : "Bots"}
                    <span style={styles.summarySeparator}>=</span>
                    <span style={styles.summaryHighlightTotal}>
                      {1 + selectedBotCount}
                    </span>{" "}
                    Players
                  </div>
                  {selectedBotCount < 5 && (
                    <p style={styles.summaryNote}>
                      Waiting for {5 - selectedBotCount} more human{" "}
                      {5 - selectedBotCount === 1 ? "player" : "players"} to
                      join
                    </p>
                  )}
                </div>

                {error && (
                  <div style={styles.error}>
                    <span style={styles.errorIcon}>⚠️</span>
                    {error}
                  </div>
                )}

                <button
                  onClick={this.handleCreateGame}
                  disabled={isCreating}
                  style={{
                    ...styles.createButton,
                    opacity: isCreating ? 0.7 : 1,
                  }}
                >
                  {isCreating ? (
                    <>
                      <span style={styles.spinner} />
                      Creating Game...
                    </>
                  ) : (
                    <>
                      {selectedBotCount === 5
                        ? "Start Game Now"
                        : "Create & Wait for Players"}
                      <span style={styles.buttonIcon}>→</span>
                    </>
                  )}
                </button>
              </>
            ) : (
              /* Game Created - Share Phase */
              <>
                <div style={styles.successIcon}>🎉</div>
                <h3 style={styles.successTitle}>Game Created!</h3>

                {sharedGameId && (
                  <div style={styles.shareSection}>
                    <label style={styles.shareLabel}>Share Game ID</label>
                    <div style={styles.shareInputGroup}>
                      <div style={styles.shareInput}>{sharedGameId}</div>
                      <button
                        onClick={this.copyGameId}
                        style={{
                          ...styles.shareButton,
                          background: copiedGameId
                            ? "linear-gradient(135deg, #10b981 0%, #059669 100%)"
                            : "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                        }}
                      >
                        {copiedGameId ? "Copied!" : "Copy"}
                      </button>
                    </div>

                    <label style={{ ...styles.shareLabel, marginTop: "20px" }}>
                      Or Share Link
                    </label>
                    <div style={styles.shareInputGroup}>
                      <div style={{ ...styles.shareInput, fontSize: "13px" }}>
                        {this.store.getShareableGameUrl(sharedGameId)}
                      </div>
                      <button
                        onClick={this.copyShareableLink}
                        style={{
                          ...styles.shareButton,
                          background: copiedLink
                            ? "linear-gradient(135deg, #10b981 0%, #059669 100%)"
                            : "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
                        }}
                      >
                        {copiedLink ? "Copied!" : "Copy Link"}
                      </button>
                    </div>
                  </div>
                )}

                {isWaiting ? (
                  <div style={styles.waitingSection}>
                    <div style={styles.waitingSpinner} />
                    <p style={styles.waitingText}>
                      Waiting for players to join...
                    </p>
                    <p style={styles.waitingSubtext}>
                      Share the Game ID with friends to start playing
                    </p>
                  </div>
                ) : (
                  <div style={styles.readySection}>
                    <p style={styles.readyText}>Starting game immediately...</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    flex: 1,
    width: "100%",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
    background: "transparent",
    position: "relative",
    overflow: "hidden",
  },
  glowEffect: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: "600px",
    height: "600px",
    background:
      "radial-gradient(ellipse at center, rgba(99, 102, 241, 0.15) 0%, transparent 70%)",
    pointerEvents: "none",
  },
  content: {
    width: "100%",
    maxWidth: "520px",
    position: "relative",
    zIndex: 1,
    animation: "fadeIn 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
    background: "linear-gradient(145deg, #0f0f18 0%, #12121a 100%)",
    borderRadius: "24px",
    padding: "40px",
    border: "1px solid rgba(255, 255, 255, 0.05)",
    boxShadow: "0 20px 40px rgba(0, 0, 0, 0.4)",
  },
  header: {
    marginBottom: "32px",
    position: "relative",
  },
  backButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    padding: "10px 16px",
    background: "transparent",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "10px",
    color: "#a1a1aa",
    fontSize: "14px",
    fontWeight: 500,
    cursor: "pointer",
    marginBottom: "20px",
    transition: "all 250ms ease",
  },
  backIcon: {
    fontSize: "16px",
  },
  title: {
    fontSize: "32px",
    fontWeight: 800,
    color: "#ffffff",
    margin: "0 0 8px 0",
    letterSpacing: "-0.02em",
  },
  subtitle: {
    fontSize: "16px",
    color: "#71717a",
    margin: 0,
  },
  card: {
    background: "rgba(255, 255, 255, 0.03)",
    borderRadius: "16px",
    border: "1px solid rgba(255, 255, 255, 0.06)",
    padding: "32px",
  },
  section: {
    marginBottom: "28px",
  },
  sectionTitle: {
    fontSize: "18px",
    fontWeight: 700,
    color: "#ffffff",
    margin: "0 0 8px 0",
  },
  sectionDescription: {
    fontSize: "14px",
    color: "#a1a1aa",
    margin: "0 0 20px 0",
    lineHeight: 1.5,
  },
  botGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "12px",
  },
  botButton: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "6px",
    padding: "16px 12px",
    background: "#1e1e2d",
    border: "2px solid transparent",
    borderRadius: "12px",
    cursor: "pointer",
    position: "relative",
    transition: "all 250ms ease",
  },
  botButtonSelected: {
    borderColor: "#6366f1",
    background: "rgba(99, 102, 241, 0.1)",
  },
  botCount: {
    fontSize: "28px",
    fontWeight: 700,
    transition: "color 250ms ease",
  },
  botLabel: {
    fontSize: "12px",
    color: "#71717a",
    fontWeight: 500,
  },
  botBadge: {
    position: "absolute",
    top: "-8px",
    right: "-8px",
    padding: "4px 8px",
    background: "linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)",
    color: "#000000",
    fontSize: "10px",
    fontWeight: 700,
    borderRadius: "6px",
  },
  botBadgeSecondary: {
    position: "absolute",
    top: "-8px",
    right: "-8px",
    padding: "4px 8px",
    background: "linear-gradient(135deg, #10b981 0%, #34d399 100%)",
    color: "#000000",
    fontSize: "10px",
    fontWeight: 700,
    borderRadius: "6px",
  },
  summary: {
    background: "rgba(99, 102, 241, 0.05)",
    border: "1px solid rgba(99, 102, 241, 0.1)",
    borderRadius: "16px",
    padding: "20px",
    marginBottom: "24px",
  },
  summaryRow: {
    marginBottom: "8px",
  },
  summaryLabel: {
    fontSize: "12px",
    fontWeight: 600,
    color: "#6366f1",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  summaryValue: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "18px",
    color: "#ffffff",
    fontWeight: 500,
  },
  summaryHighlight: {
    fontWeight: 700,
    color: "#6366f1",
  },
  summaryHighlightTotal: {
    fontWeight: 700,
    color: "#f59e0b",
  },
  summarySeparator: {
    color: "#71717a",
  },
  summaryNote: {
    margin: "12px 0 0 0",
    fontSize: "13px",
    color: "#a1a1aa",
  },
  error: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "12px 16px",
    background: "rgba(239, 68, 68, 0.1)",
    border: "1px solid rgba(239, 68, 68, 0.2)",
    borderRadius: "10px",
    color: "#ef4444",
    fontSize: "14px",
    marginBottom: "20px",
  },
  errorIcon: {
    fontSize: "14px",
  },
  createButton: {
    width: "100%",
    padding: "18px 24px",
    fontSize: "16px",
    fontWeight: 600,
    fontFamily: "inherit",
    color: "#ffffff",
    background:
      "linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)",
    border: "none",
    borderRadius: "14px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
    transition: "all 250ms ease",
    boxShadow: "0 4px 20px rgba(99, 102, 241, 0.3)",
  },
  buttonIcon: {
    fontSize: "18px",
    transition: "transform 250ms ease",
  },
  spinner: {
    width: "20px",
    height: "20px",
    border: "2px solid rgba(255, 255, 255, 0.3)",
    borderTopColor: "#ffffff",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  successIcon: {
    fontSize: "48px",
    textAlign: "center",
    marginBottom: "16px",
  },
  successTitle: {
    fontSize: "24px",
    fontWeight: 700,
    color: "#ffffff",
    textAlign: "center",
    margin: "0 0 28px 0",
  },
  shareSection: {
    marginBottom: "24px",
  },
  shareLabel: {
    display: "block",
    fontSize: "13px",
    fontWeight: 600,
    color: "#a1a1aa",
    marginBottom: "8px",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  shareInputGroup: {
    display: "flex",
    gap: "10px",
  },
  shareInput: {
    flex: 1,
    padding: "14px 16px",
    background: "#1e1e2d",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "10px",
    color: "#ffffff",
    fontSize: "14px",
    fontFamily: "var(--font-mono, monospace)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  shareButton: {
    padding: "12px 20px",
    fontSize: "14px",
    fontWeight: 600,
    fontFamily: "inherit",
    color: "#ffffff",
    border: "none",
    borderRadius: "10px",
    cursor: "pointer",
    transition: "all 250ms ease",
    whiteSpace: "nowrap",
  },
  waitingSection: {
    textAlign: "center",
    padding: "24px",
    background: "rgba(99, 102, 241, 0.05)",
    border: "1px solid rgba(99, 102, 241, 0.1)",
    borderRadius: "16px",
  },
  waitingSpinner: {
    width: "40px",
    height: "40px",
    margin: "0 auto 16px",
    border: "3px solid rgba(99, 102, 241, 0.2)",
    borderTopColor: "#6366f1",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  },
  waitingText: {
    fontSize: "16px",
    fontWeight: 600,
    color: "#ffffff",
    margin: "0 0 8px 0",
  },
  waitingSubtext: {
    fontSize: "14px",
    color: "#71717a",
    margin: 0,
  },
  readySection: {
    textAlign: "center",
    padding: "16px",
  },
  readyText: {
    fontSize: "14px",
    color: "#a1a1aa",
    margin: 0,
  },
};

// Add keyframe animations
if (typeof document !== "undefined") {
  const styleSheet = document.createElement("style");
  styleSheet.textContent = `
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(styleSheet);
}

export default HostGame;
