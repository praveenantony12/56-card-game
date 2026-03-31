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
                                ? "#0ea5e9"
                                : "#8b95a5",
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
                            ? "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)"
                            : "linear-gradient(135deg, #0ea5e9 0%, #38bdf8 100%)",
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
                            ? "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)"
                            : "linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)",
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
    minHeight: "100vh",
  },
  glowEffect: {
    position: "absolute",
    top: "40%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: "500px",
    height: "500px",
    background:
      "radial-gradient(ellipse at center, rgba(212, 168, 67, 0.07) 0%, transparent 65%)",
    pointerEvents: "none",
  },
  content: {
    width: "100%",
    maxWidth: "520px",
    position: "relative",
    zIndex: 1,
    animation: "fadeIn 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
    background: "rgba(15, 19, 25, 0.75)",
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
    borderRadius: "28px",
    padding: "40px",
    border: "1px solid rgba(255, 255, 255, 0.04)",
    boxShadow:
      "0 24px 48px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.03)",
  },
  header: {
    marginBottom: "28px",
    position: "relative",
  },
  backButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 14px",
    background: "rgba(255, 255, 255, 0.04)",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    borderRadius: "10px",
    color: "#8b95a5",
    fontSize: "13px",
    fontWeight: 500,
    cursor: "pointer",
    marginBottom: "20px",
    transition: "all 250ms ease",
    fontFamily: "'Inter', sans-serif",
  },
  backIcon: {
    fontSize: "14px",
  },
  title: {
    fontSize: "30px",
    fontWeight: 800,
    color: "#f0f4f8",
    margin: "0 0 6px 0",
    letterSpacing: "-0.02em",
  },
  subtitle: {
    fontSize: "15px",
    color: "#5a6577",
    margin: 0,
  },
  card: {
    background: "rgba(21, 26, 35, 0.6)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    borderRadius: "20px",
    border: "1px solid rgba(255, 255, 255, 0.04)",
    padding: "28px",
  },
  section: {
    marginBottom: "24px",
  },
  sectionTitle: {
    fontSize: "16px",
    fontWeight: 700,
    color: "#f0f4f8",
    margin: "0 0 6px 0",
  },
  sectionDescription: {
    fontSize: "13px",
    color: "#5a6577",
    margin: "0 0 18px 0",
    lineHeight: 1.5,
  },
  botGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "10px",
  },
  botButton: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "4px",
    padding: "14px 10px",
    background: "rgba(26, 32, 48, 0.6)",
    border: "2px solid transparent",
    borderRadius: "14px",
    cursor: "pointer",
    position: "relative",
    transition: "all 250ms ease",
    fontFamily: "'Inter', sans-serif",
  },
  botButtonSelected: {
    borderColor: "#0ea5e9",
    background: "rgba(14, 165, 233, 0.08)",
    boxShadow: "0 0 20px rgba(14, 165, 233, 0.1)",
  },
  botCount: {
    fontSize: "26px",
    fontWeight: 700,
    transition: "color 250ms ease",
  },
  botLabel: {
    fontSize: "11px",
    color: "#5a6577",
    fontWeight: 500,
  },
  botBadge: {
    position: "absolute",
    top: "-8px",
    right: "-8px",
    padding: "3px 7px",
    background: "linear-gradient(135deg, #b8952a 0%, #d4a843 100%)",
    color: "#0b0e14",
    fontSize: "9px",
    fontWeight: 700,
    borderRadius: "6px",
    letterSpacing: "0.3px",
  },
  botBadgeSecondary: {
    position: "absolute",
    top: "-8px",
    right: "-8px",
    padding: "3px 7px",
    background: "linear-gradient(135deg, #22c55e 0%, #4ade80 100%)",
    color: "#0b0e14",
    fontSize: "9px",
    fontWeight: 700,
    borderRadius: "6px",
  },
  summary: {
    background: "rgba(14, 165, 233, 0.04)",
    border: "1px solid rgba(14, 165, 233, 0.1)",
    borderRadius: "14px",
    padding: "18px",
    marginBottom: "20px",
  },
  summaryRow: {
    marginBottom: "6px",
  },
  summaryLabel: {
    fontSize: "11px",
    fontWeight: 600,
    color: "#0ea5e9",
    textTransform: "uppercase",
    letterSpacing: "0.8px",
  },
  summaryValue: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "16px",
    color: "#f0f4f8",
    fontWeight: 500,
  },
  summaryHighlight: {
    fontWeight: 700,
    color: "#0ea5e9",
  },
  summaryHighlightTotal: {
    fontWeight: 700,
    color: "#d4a843",
  },
  summarySeparator: {
    color: "#5a6577",
  },
  summaryNote: {
    margin: "10px 0 0 0",
    fontSize: "12px",
    color: "#8b95a5",
  },
  error: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "12px 16px",
    background: "rgba(239, 68, 68, 0.08)",
    border: "1px solid rgba(239, 68, 68, 0.15)",
    borderRadius: "10px",
    color: "#ef4444",
    fontSize: "13px",
    marginBottom: "18px",
  },
  errorIcon: {
    fontSize: "13px",
  },
  createButton: {
    width: "100%",
    padding: "16px 24px",
    fontSize: "15px",
    fontWeight: 600,
    fontFamily: "'Inter', sans-serif",
    color: "#0b0e14",
    background:
      "linear-gradient(135deg, #b8952a 0%, #d4a843 40%, #e8c468 100%)",
    border: "none",
    borderRadius: "14px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
    transition: "all 250ms ease",
    boxShadow:
      "0 4px 20px rgba(212, 168, 67, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.2)",
  },
  buttonIcon: {
    fontSize: "16px",
    transition: "transform 250ms ease",
    fontWeight: 700,
  },
  spinner: {
    width: "18px",
    height: "18px",
    border: "2px solid rgba(11, 14, 20, 0.3)",
    borderTopColor: "#0b0e14",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  successIcon: {
    fontSize: "44px",
    textAlign: "center",
    marginBottom: "14px",
  },
  successTitle: {
    fontSize: "22px",
    fontWeight: 700,
    color: "#f0f4f8",
    textAlign: "center",
    margin: "0 0 24px 0",
  },
  shareSection: {
    marginBottom: "20px",
  },
  shareLabel: {
    display: "block",
    fontSize: "11px",
    fontWeight: 600,
    color: "#8b95a5",
    marginBottom: "6px",
    textTransform: "uppercase",
    letterSpacing: "0.8px",
  },
  shareInputGroup: {
    display: "flex",
    gap: "8px",
  },
  shareInput: {
    flex: 1,
    padding: "12px 14px",
    background: "rgba(26, 32, 48, 0.8)",
    border: "1px solid rgba(255, 255, 255, 0.06)",
    borderRadius: "10px",
    color: "#f0f4f8",
    fontSize: "13px",
    fontFamily: "'JetBrains Mono', monospace",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  shareButton: {
    padding: "10px 18px",
    fontSize: "13px",
    fontWeight: 600,
    fontFamily: "'Inter', sans-serif",
    color: "#ffffff",
    border: "none",
    borderRadius: "10px",
    cursor: "pointer",
    transition: "all 250ms ease",
    whiteSpace: "nowrap",
  },
  waitingSection: {
    textAlign: "center",
    padding: "20px",
    background: "rgba(14, 165, 233, 0.04)",
    border: "1px solid rgba(14, 165, 233, 0.08)",
    borderRadius: "14px",
  },
  waitingSpinner: {
    width: "36px",
    height: "36px",
    margin: "0 auto 14px",
    border: "3px solid rgba(14, 165, 233, 0.15)",
    borderTopColor: "#0ea5e9",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  },
  waitingText: {
    fontSize: "15px",
    fontWeight: 600,
    color: "#f0f4f8",
    margin: "0 0 6px 0",
  },
  waitingSubtext: {
    fontSize: "13px",
    color: "#5a6577",
    margin: 0,
  },
  readySection: {
    textAlign: "center",
    padding: "14px",
  },
  readyText: {
    fontSize: "13px",
    color: "#8b95a5",
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
