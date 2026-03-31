import { inject, observer } from "mobx-react";
import * as React from "react";
import { IStore } from "../../stores/IStore";
import { IGame } from "../../stores/models/IGameInfo";
import { IUser } from "../../stores/models/IUserInfo";
import "../../styles/theme.css";

interface IProps {
  store?: IStore;
  onBack?: () => void;
}

interface IState {
  selectedBotCount: number;
  isStartingGame: boolean;
  gameSetupComplete: boolean;
}

@inject("store")
@observer
class BotSelection extends React.Component<IProps, IState> {
  private get store(): IStore {
    return this.props.store as IStore;
  }

  private get gameInfo(): IGame {
    return this.store.game;
  }

  private get userInfo(): IUser {
    return this.store.user;
  }

  constructor(props: IProps) {
    super(props);
    this.state = {
      selectedBotCount: 0, // Default to 0 bots for 6 human game
      isStartingGame: false,
      gameSetupComplete: false,
    };
  }

  public render() {
    if (!this.canShowBotSelection) {
      return null;
    }

    const { selectedBotCount, isStartingGame, gameSetupComplete } = this.state;

    return (
      <div style={bs.overlay}>
        <div style={bs.glowEffect} />
        <div style={bs.content}>
          {/* Header */}
          <div style={bs.header}>
            {this.props.onBack && (
              <button onClick={this.props.onBack} style={bs.backButton}>
                <span style={bs.backIcon}>←</span>
                Back
              </button>
            )}
            <h1 style={bs.title}>Choose Your Game Setup</h1>
            <p style={bs.subtitle}>
              Select how many AI opponents to add. The game needs exactly 6
              players.
            </p>
          </div>

          {/* Share Section - shown after game setup is complete */}
          {this.gameInfo.sharedGameId && gameSetupComplete && (
            <div style={bs.shareCard}>
              <div style={bs.shareHeader}>
                <span style={bs.shareIcon}>🎉</span>
                <h3 style={bs.shareTitle}>Share Game with Friends</h3>
              </div>
              <div style={bs.shareGroup}>
                <label style={bs.shareLabel}>Game ID</label>
                <div style={bs.shareInputRow}>
                  <div style={bs.shareInput}>{this.gameInfo.sharedGameId}</div>
                  <button
                    onClick={() => this.copyGameId()}
                    style={bs.shareCopyBtn}
                  >
                    Copy
                  </button>
                </div>
              </div>
              <div style={bs.shareGroup}>
                <label style={bs.shareLabel}>Or Share Link</label>
                <div style={bs.shareInputRow}>
                  <div style={{ ...bs.shareInput, fontSize: "12px" }}>
                    {this.store.getShareableGameUrl(this.gameInfo.sharedGameId)}
                  </div>
                  <button
                    onClick={() => this.copyShareableUrl()}
                    style={bs.shareLinkBtn}
                  >
                    Copy Link
                  </button>
                </div>
                <p style={bs.shareHint}>
                  Friends can click this link to join directly!
                </p>
              </div>
            </div>
          )}

          {/* Bot Info Cards */}
          <div style={bs.card}>
            <div style={bs.infoGrid}>
              <div style={bs.infoItem}>
                <span style={bs.infoLabel}>0 Bots:</span>
                <span style={bs.infoText}>
                  Wait for 5 human players (6 humans total)
                </span>
              </div>
              <div style={bs.infoItem}>
                <span style={bs.infoLabel}>5 Bots:</span>
                <span style={bs.infoText}>
                  Start game immediately (1 human + 5 bots)
                </span>
              </div>
              <div style={bs.infoItem}>
                <span style={bs.infoLabel}>1-4 Bots:</span>
                <span style={bs.infoText}>
                  Wait for more human players to join
                </span>
              </div>
            </div>

            {/* Bot Count Grid */}
            <div style={bs.botGrid}>
              {[0, 1, 2, 3, 4, 5].map((count) => (
                <button
                  key={count}
                  onClick={() => this.onBotCountSelect(count)}
                  style={{
                    ...bs.botButton,
                    ...(selectedBotCount === count ? bs.botButtonSelected : {}),
                  }}
                >
                  <span
                    style={{
                      ...bs.botCount,
                      color: selectedBotCount === count ? "#0ea5e9" : "#8b95a5",
                    }}
                  >
                    {count}
                  </span>
                  <span style={bs.botLabel}>
                    {count === 0 ? "No Bots" : count === 1 ? "Bot" : "Bots"}
                  </span>
                  {count === 5 && <span style={bs.badge}>Start Now</span>}
                  {count === 0 && <span style={bs.badgeGreen}>Full Table</span>}
                </button>
              ))}
            </div>

            {/* Summary */}
            <div style={bs.summary}>
              <span style={bs.summaryLabel}>Configuration</span>
              <div style={bs.summaryValue}>
                <span style={bs.highlight}>1</span> You
                <span style={bs.sep}>+</span>
                <span style={bs.highlight}>{selectedBotCount}</span>{" "}
                {selectedBotCount === 1 ? "Bot" : "Bots"}
                <span style={bs.sep}>=</span>
                <span style={bs.highlightGold}>
                  {1 + selectedBotCount}
                </span>{" "}
                Players
              </div>
              {selectedBotCount < 5 && (
                <p style={bs.summaryNote}>
                  Waiting for {5 - selectedBotCount} more human{" "}
                  {5 - selectedBotCount === 1 ? "player" : "players"} to join
                </p>
              )}
            </div>

            {this.gameInfo.error && (
              <div style={bs.error}>
                <span>⚠️</span>
                {this.gameInfo.error}
              </div>
            )}

            {/* Action Buttons */}
            <div style={bs.actions}>
              {selectedBotCount === 5 ? (
                <button
                  onClick={this.onStartWithBots}
                  disabled={isStartingGame}
                  style={{
                    ...bs.primaryBtn,
                    opacity: isStartingGame ? 0.7 : 1,
                  }}
                >
                  {isStartingGame ? (
                    <>
                      <span style={bs.spinner} />
                      Starting...
                    </>
                  ) : (
                    <>
                      Start Game with {selectedBotCount} Bots
                      <span style={bs.btnArrow}>→</span>
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={this.onWaitForPlayers}
                  disabled={isStartingGame}
                  style={{
                    ...bs.secondaryBtn,
                    opacity: isStartingGame ? 0.7 : 1,
                  }}
                >
                  {isStartingGame ? (
                    <>
                      <span style={bs.spinner} />
                      Setting up...
                    </>
                  ) : (
                    <>
                      {selectedBotCount === 0
                        ? "Wait for 5 Human Players"
                        : `Wait for ${6 - 1 - selectedBotCount} More Human Player${6 - 1 - selectedBotCount !== 1 ? "s" : ""}`}
                      <span style={bs.btnArrow}>→</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  private get canShowBotSelection() {
    return (
      this.userInfo.isSignedIn &&
      this.gameInfo.showBotSelection &&
      this.gameInfo.isGameCreator &&
      !this.gameInfo.canStartGame
    );
  }

  private onBotCountSelect = (count: number) => {
    this.setState({ selectedBotCount: count });
  };

  private copyGameId = () => {
    if (this.gameInfo.sharedGameId) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard
          .writeText(this.gameInfo.sharedGameId)
          .catch(() => this.useFallbackCopy());
      } else {
        this.useFallbackCopy();
      }
    }
  };

  private useFallbackCopy = () => {
    const textArea = document.createElement("textarea");
    textArea.value = this.gameInfo.sharedGameId || "";
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand("copy");
    document.body.removeChild(textArea);
  };

  private copyShareableUrl = () => {
    if (this.gameInfo.sharedGameId) {
      const shareableUrl = this.store.getShareableGameUrl(
        this.gameInfo.sharedGameId,
      );
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard
          .writeText(shareableUrl)
          .catch(() => this.useFallbackCopyUrl(shareableUrl));
      } else {
        this.useFallbackCopyUrl(shareableUrl);
      }
    }
  };

  private useFallbackCopyUrl = (url: string) => {
    const textArea = document.createElement("textarea");
    textArea.value = url;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand("copy");
    document.body.removeChild(textArea);
  };

  private onStartWithBots = async () => {
    this.setState({ isStartingGame: true });
    this.store.clearNotifications();

    try {
      // Only pass startImmediately=true when we have 5 bots (immediate start)
      // For fewer bots, startImmediately will be false by default
      const startImmediately = this.state.selectedBotCount === 5;
      await this.store.addBots(this.state.selectedBotCount, startImmediately);
      this.setState({ gameSetupComplete: true });
    } catch (error) {
      console.error("Error adding bots:", error);
    } finally {
      this.setState({ isStartingGame: false });
    }
  };

  private onWaitForPlayers = async () => {
    // Add bots but don't start the game - wait for human players
    this.setState({ isStartingGame: true });
    this.store.clearNotifications();

    try {
      await this.store.addBots(this.state.selectedBotCount, false); // startImmediately = false
      this.setState({ gameSetupComplete: true });
      this.store.hideBotSelection();
    } catch (error) {
      console.error("Error adding bots:", error);
    } finally {
      this.setState({ isStartingGame: false });
    }
  };
}

const bs: { [key: string]: React.CSSProperties } = {
  overlay: {
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
    padding: "24px",
    minHeight: "100vh",
    position: "relative",
  },
  glowEffect: {
    position: "absolute",
    top: "30%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: "500px",
    height: "500px",
    background:
      "radial-gradient(ellipse at center, rgba(212, 168, 67, 0.06) 0%, transparent 65%)",
    pointerEvents: "none",
  },
  content: {
    width: "100%",
    maxWidth: "520px",
    position: "relative",
    zIndex: 1,
    animation: "fadeIn 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
  },
  header: {
    marginBottom: "24px",
    textAlign: "center",
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
    fontSize: "28px",
    fontWeight: 800,
    color: "#f0f4f8",
    margin: "0 0 8px 0",
    letterSpacing: "-0.02em",
  },
  subtitle: {
    fontSize: "14px",
    color: "#5a6577",
    margin: 0,
    lineHeight: 1.5,
  },
  shareCard: {
    background: "rgba(34, 197, 94, 0.06)",
    border: "1px solid rgba(34, 197, 94, 0.15)",
    borderRadius: "18px",
    padding: "24px",
    marginBottom: "20px",
  },
  shareHeader: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    marginBottom: "16px",
  },
  shareIcon: {
    fontSize: "24px",
  },
  shareTitle: {
    fontSize: "16px",
    fontWeight: 700,
    color: "#f0f4f8",
    margin: 0,
  },
  shareGroup: {
    marginBottom: "14px",
  },
  shareLabel: {
    display: "block",
    fontSize: "11px",
    fontWeight: 600,
    color: "#8b95a5",
    marginBottom: "6px",
    textTransform: "uppercase" as const,
    letterSpacing: "0.8px",
  },
  shareInputRow: {
    display: "flex",
    gap: "8px",
  },
  shareInput: {
    flex: 1,
    padding: "10px 14px",
    background: "rgba(26, 32, 48, 0.8)",
    border: "1px solid rgba(255, 255, 255, 0.06)",
    borderRadius: "10px",
    color: "#f0f4f8",
    fontSize: "14px",
    fontFamily: "'JetBrains Mono', monospace",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  shareCopyBtn: {
    padding: "10px 16px",
    fontSize: "12px",
    fontWeight: 600,
    fontFamily: "'Inter', sans-serif",
    color: "#ffffff",
    background: "linear-gradient(135deg, #0ea5e9 0%, #38bdf8 100%)",
    border: "none",
    borderRadius: "10px",
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
  },
  shareLinkBtn: {
    padding: "10px 16px",
    fontSize: "12px",
    fontWeight: 600,
    fontFamily: "'Inter', sans-serif",
    color: "#ffffff",
    background: "linear-gradient(135deg, #0284c7 0%, #0ea5e9 100%)",
    border: "none",
    borderRadius: "10px",
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
  },
  shareHint: {
    fontSize: "12px",
    color: "#5a6577",
    margin: "8px 0 0 0",
  },
  card: {
    background: "rgba(15, 19, 25, 0.8)",
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
    borderRadius: "24px",
    border: "1px solid rgba(255, 255, 255, 0.04)",
    padding: "32px",
    boxShadow:
      "0 24px 48px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.03)",
  },
  infoGrid: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "8px",
    marginBottom: "22px",
    padding: "16px",
    background: "rgba(14, 165, 233, 0.04)",
    border: "1px solid rgba(14, 165, 233, 0.08)",
    borderRadius: "14px",
  },
  infoItem: {
    display: "flex",
    gap: "8px",
    fontSize: "13px",
    lineHeight: 1.4,
  },
  infoLabel: {
    fontWeight: 700,
    color: "#0ea5e9",
    whiteSpace: "nowrap" as const,
  },
  infoText: {
    color: "#8b95a5",
  },
  botGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "10px",
    marginBottom: "20px",
  },
  botButton: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: "4px",
    padding: "14px 10px",
    background: "rgba(26, 32, 48, 0.6)",
    border: "2px solid transparent",
    borderRadius: "14px",
    cursor: "pointer",
    position: "relative" as const,
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
  badge: {
    position: "absolute" as const,
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
  badgeGreen: {
    position: "absolute" as const,
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
  summaryLabel: {
    fontSize: "11px",
    fontWeight: 600,
    color: "#0ea5e9",
    textTransform: "uppercase" as const,
    letterSpacing: "0.8px",
  },
  summaryValue: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "16px",
    color: "#f0f4f8",
    fontWeight: 500,
    marginTop: "6px",
  },
  highlight: {
    fontWeight: 700,
    color: "#0ea5e9",
  },
  highlightGold: {
    fontWeight: 700,
    color: "#d4a843",
  },
  sep: {
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
  actions: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "10px",
  },
  primaryBtn: {
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
  secondaryBtn: {
    width: "100%",
    padding: "16px 24px",
    fontSize: "15px",
    fontWeight: 600,
    fontFamily: "'Inter', sans-serif",
    color: "#0b0e14",
    background:
      "linear-gradient(135deg, #16a34a 0%, #22c55e 50%, #4ade80 100%)",
    border: "none",
    borderRadius: "14px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
    transition: "all 250ms ease",
    boxShadow:
      "0 4px 20px rgba(34, 197, 94, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.2)",
  },
  btnArrow: {
    fontSize: "16px",
    fontWeight: 700,
  },
  spinner: {
    width: "18px",
    height: "18px",
    border: "2px solid rgba(11, 14, 20, 0.3)",
    borderTopColor: "#0b0e14",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
    display: "inline-block",
  },
};

export default BotSelection;
