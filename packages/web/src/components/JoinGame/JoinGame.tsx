import * as React from "react";
import { inject, observer } from "mobx-react";
import { IStore } from "../../stores/IStore";
import "../../styles/theme.css";

interface IProps {
  store?: IStore;
  onBack: () => void;
  playerName: string;
  autoJoin?: boolean;
}

interface IState {
  gameId: string;
  error: string;
  isJoining: boolean;
  isJoined: boolean;
}

@inject("store")
@observer
class JoinGame extends React.Component<IProps, IState> {
  constructor(props: IProps) {
    super(props);
    this.state = {
      gameId: "",
      error: "",
      isJoining: false,
      isJoined: false,
    };
  }

  private get store(): IStore {
    return this.props.store as IStore;
  }

  componentDidMount() {
    // Check if gameId was set from URL parameters
    const { gameIdToJoin, gameMode } = this.store.game;
    if (gameIdToJoin && gameMode === "join") {
      this.setState({ gameId: gameIdToJoin }, () => {
        // Auto-join when the player arrived via a shared URL (gameId in URL)
        if (this.props.autoJoin && this.props.playerName) {
          this.performJoin(gameIdToJoin);
        }
      });
    }
  }

  private handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.trim();
    this.setState({ gameId: value, error: "" });
  };

  private performJoin = async (gameId: string) => {
    this.setState({ isJoining: true, error: "" });
    this.store.setGameModeJoin(gameId);
    try {
      await this.store.signIn(this.props.playerName);
      this.setState({ isJoining: false, isJoined: true });
    } catch (err) {
      this.setState({
        isJoining: false,
        error: "Failed to join game. Please check the Game ID and try again.",
      });
    }
  };

  private handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { gameId } = this.state;

    if (!gameId.trim()) {
      this.setState({ error: "Please enter a Game ID" });
      return;
    }

    if (gameId.trim().length < 3) {
      this.setState({ error: "Game ID must be at least 3 characters" });
      return;
    }

    await this.performJoin(gameId.trim());
  };

  private handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        this.setState({ gameId: text.trim(), error: "" });
      }
    } catch (err) {
      // Clipboard read failed, ignore
    }
  };

  public render() {
    const { gameId, error, isJoining, isJoined } = this.state;
    const { canStartGame, error: storeError } = this.store.game;

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
            <h1 style={styles.title}>Enter Game ID</h1>
            <p style={styles.subtitle}>
              Join an existing game using the Game ID
            </p>
          </div>

          {/* Main Card */}
          <div style={styles.card}>
            {!isJoined ? (
              /* Join Form */
              <form onSubmit={this.handleSubmit}>
                <div style={styles.inputSection}>
                  <label htmlFor="gameId" style={styles.label}>
                    Game ID
                  </label>
                  <div style={styles.inputWrapper}>
                    <input
                      id="gameId"
                      type="text"
                      value={gameId}
                      onChange={this.handleInputChange}
                      placeholder="Enter Game ID (e.g., ABC123)"
                      style={{
                        ...styles.input,
                        borderColor: error
                          ? "#ef4444"
                          : "rgba(255, 255, 255, 0.1)",
                      }}
                      autoFocus
                      disabled={isJoining}
                    />
                    <button
                      type="button"
                      onClick={this.handlePaste}
                      style={styles.pasteButton}
                      disabled={isJoining}
                    >
                      Paste
                    </button>
                  </div>

                  {error && (
                    <div style={styles.error}>
                      <span style={styles.errorIcon}>⚠️</span>
                      {error}
                    </div>
                  )}

                  {storeError && (
                    <div style={styles.error}>
                      <span style={styles.errorIcon}>⚠️</span>
                      {storeError}
                    </div>
                  )}

                  <p style={styles.hint}>
                    <span style={styles.hintIcon}>💡</span>
                    Ask the game host to share their Game ID or the game link.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isJoining || !gameId.trim()}
                  style={{
                    ...styles.joinButton,
                    opacity: isJoining || !gameId.trim() ? 0.7 : 1,
                    cursor:
                      isJoining || !gameId.trim() ? "not-allowed" : "pointer",
                  }}
                >
                  {isJoining ? (
                    <>
                      <span style={styles.spinner} />
                      Joining...
                    </>
                  ) : (
                    <>
                      Join Game
                      <span style={styles.buttonIcon}>→</span>
                    </>
                  )}
                </button>
              </form>
            ) : (
              /* Joined - Waiting State */
              <div style={styles.waitingSection}>
                <div style={styles.successIcon}>✅</div>
                <h3 style={styles.waitingTitle}>Successfully Joined!</h3>
                <p style={styles.waitingText}>
                  Waiting for the host to start the game...
                </p>
                <div style={styles.waitingSpinner} />
              </div>
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
      "radial-gradient(ellipse at center, rgba(16, 185, 129, 0.15) 0%, transparent 70%)",
    pointerEvents: "none",
  },
  content: {
    width: "100%",
    maxWidth: "480px",
    position: "relative",
    zIndex: 1,
    animation: "fadeIn 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
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
    background: "linear-gradient(145deg, #1a1a25 0%, #16161f 100%)",
    borderRadius: "24px",
    border: "1px solid rgba(255, 255, 255, 0.05)",
    padding: "40px",
    boxShadow: "0 20px 40px rgba(0, 0, 0, 0.4)",
  },
  inputSection: {
    marginBottom: "24px",
  },
  label: {
    display: "block",
    fontSize: "14px",
    fontWeight: 600,
    color: "#e4e4e7",
    marginBottom: "10px",
  },
  inputWrapper: {
    display: "flex",
    gap: "10px",
  },
  input: {
    flex: 1,
    padding: "16px 20px",
    fontSize: "18px",
    fontFamily: "var(--font-mono, monospace)",
    fontWeight: 600,
    color: "#ffffff",
    background: "#1e1e2d",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "12px",
    outline: "none",
    textTransform: "uppercase",
    letterSpacing: "1px",
    transition: "all 250ms ease",
  },
  pasteButton: {
    padding: "12px 20px",
    fontSize: "14px",
    fontWeight: 600,
    fontFamily: "inherit",
    color: "#a1a1aa",
    background: "#1e1e2d",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "12px",
    cursor: "pointer",
    transition: "all 250ms ease",
  },
  error: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginTop: "12px",
    padding: "12px 16px",
    background: "rgba(239, 68, 68, 0.1)",
    border: "1px solid rgba(239, 68, 68, 0.2)",
    borderRadius: "10px",
    color: "#ef4444",
    fontSize: "14px",
  },
  errorIcon: {
    fontSize: "14px",
  },
  hint: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginTop: "16px",
    fontSize: "13px",
    color: "#71717a",
    lineHeight: 1.5,
  },
  hintIcon: {
    fontSize: "14px",
  },
  joinButton: {
    width: "100%",
    padding: "18px 24px",
    fontSize: "16px",
    fontWeight: 600,
    fontFamily: "inherit",
    color: "#ffffff",
    background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
    border: "none",
    borderRadius: "14px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
    transition: "all 250ms ease",
    boxShadow: "0 4px 20px rgba(16, 185, 129, 0.3)",
  },
  buttonIcon: {
    fontSize: "18px",
  },
  spinner: {
    width: "20px",
    height: "20px",
    border: "2px solid rgba(255, 255, 255, 0.3)",
    borderTopColor: "#ffffff",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  waitingSection: {
    textAlign: "center",
    padding: "20px",
  },
  successIcon: {
    fontSize: "48px",
    marginBottom: "16px",
  },
  waitingTitle: {
    fontSize: "22px",
    fontWeight: 700,
    color: "#ffffff",
    margin: "0 0 12px 0",
  },
  waitingText: {
    fontSize: "15px",
    color: "#a1a1aa",
    margin: "0 0 24px 0",
  },
  waitingSpinner: {
    width: "40px",
    height: "40px",
    margin: "0 auto",
    border: "3px solid rgba(16, 185, 129, 0.2)",
    borderTopColor: "#10b981",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
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

export default JoinGame;
