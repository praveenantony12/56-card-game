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
      "radial-gradient(ellipse at center, rgba(34, 197, 94, 0.06) 0%, transparent 65%)",
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
    background: "rgba(15, 19, 25, 0.75)",
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
    borderRadius: "24px",
    border: "1px solid rgba(255, 255, 255, 0.04)",
    padding: "36px",
    boxShadow:
      "0 24px 48px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.03)",
  },
  inputSection: {
    marginBottom: "22px",
  },
  label: {
    display: "block",
    fontSize: "12px",
    fontWeight: 600,
    color: "#8b95a5",
    marginBottom: "8px",
    textTransform: "uppercase",
    letterSpacing: "0.8px",
  },
  inputWrapper: {
    display: "flex",
    gap: "8px",
  },
  input: {
    flex: 1,
    padding: "14px 18px",
    fontSize: "17px",
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 600,
    color: "#f0f4f8",
    background: "rgba(26, 32, 48, 0.8)",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    borderRadius: "12px",
    outline: "none",
    textTransform: "uppercase",
    letterSpacing: "1.5px",
    transition: "all 250ms ease",
  },
  pasteButton: {
    padding: "10px 18px",
    fontSize: "13px",
    fontWeight: 600,
    fontFamily: "'Inter', sans-serif",
    color: "#8b95a5",
    background: "rgba(26, 32, 48, 0.8)",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    borderRadius: "12px",
    cursor: "pointer",
    transition: "all 250ms ease",
  },
  error: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginTop: "10px",
    padding: "10px 14px",
    background: "rgba(239, 68, 68, 0.08)",
    border: "1px solid rgba(239, 68, 68, 0.12)",
    borderRadius: "10px",
    color: "#ef4444",
    fontSize: "13px",
  },
  errorIcon: {
    fontSize: "13px",
  },
  hint: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginTop: "14px",
    fontSize: "12px",
    color: "#5a6577",
    lineHeight: 1.5,
  },
  hintIcon: {
    fontSize: "13px",
  },
  joinButton: {
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
  buttonIcon: {
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
  },
  waitingSection: {
    textAlign: "center",
    padding: "20px",
  },
  successIcon: {
    fontSize: "44px",
    marginBottom: "14px",
  },
  waitingTitle: {
    fontSize: "20px",
    fontWeight: 700,
    color: "#f0f4f8",
    margin: "0 0 10px 0",
  },
  waitingText: {
    fontSize: "14px",
    color: "#8b95a5",
    margin: "0 0 20px 0",
  },
  waitingSpinner: {
    width: "36px",
    height: "36px",
    margin: "0 auto",
    border: "3px solid rgba(34, 197, 94, 0.15)",
    borderTopColor: "#22c55e",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  },
};

export default JoinGame;
