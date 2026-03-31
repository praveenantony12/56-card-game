import { inject, observer } from "mobx-react";
import * as React from "react";
import { IStore } from "../../stores/IStore";

interface IProps {
  store?: IStore;
  onBack?: () => void;
}

interface IState {
  elapsedSeconds: number;
  showGameStartingOverlay: boolean;
  countdownSeconds: number;
  botVoteTimeLeft: number;
}

const MAX_LOBBY_SECONDS = 5 * 60; // 5 minutes
const WARNING_THRESHOLD_SECONDS = 4 * 60; // warning style in last 60 seconds

@inject("store")
@observer
class Lobby extends React.Component<IProps, IState> {
  private timerHandle: any = null;
  private countdownHandle: any = null;
  private botVoteTimerHandle: any = null;
  private audioCtx: AudioContext | null = null;

  private get store(): IStore {
    return this.props.store as IStore;
  }

  constructor(props: IProps) {
    super(props);
    this.state = {
      elapsedSeconds: 0,
      showGameStartingOverlay: false,
      countdownSeconds: 3,
      botVoteTimeLeft: 60,
    };
  }

  componentDidMount() {
    this.timerHandle = setInterval(() => {
      this.setState((s) => ({ elapsedSeconds: s.elapsedSeconds + 1 }));
    }, 1000);

    // Pre-create AudioContext while a user gesture is still active on the call stack.
    // This lets us call resume() later without running into autoplay policy blocks.
    try {
      const AudioCtxClass =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        this.audioCtx = new AudioCtxClass();
        // Resume on the very next user interaction in case the browser still
        // starts the context in 'suspended' state.
        const unlock = () => {
          if (this.audioCtx && this.audioCtx.state === "suspended") {
            this.audioCtx.resume().catch(() => {});
          }
          document.removeEventListener("click", unlock);
          document.removeEventListener("touchstart", unlock);
        };
        document.addEventListener("click", unlock);
        document.addEventListener("touchstart", unlock);
      }
    } catch (_) {
      /* audio not supported */
    }
  }

  componentWillUnmount() {
    if (this.timerHandle) clearInterval(this.timerHandle);
    if (this.countdownHandle) clearInterval(this.countdownHandle);
    if (this.botVoteTimerHandle) clearInterval(this.botVoteTimerHandle);
    try {
      if (this.audioCtx) this.audioCtx.close();
    } catch (_) {}
  }

  componentDidUpdate(prevProps: IProps) {
    const prev = prevProps.store!.game;
    const curr = this.store.game;

    // Detect when game is starting: isInLobby switches from true to false
    if (prev.isInLobby && !curr.isInLobby && !curr.canStartGame) {
      this.playMatchFoundSound();
      this.setState({ showGameStartingOverlay: true, countdownSeconds: 3 });
      this.countdownHandle = setInterval(() => {
        this.setState((s) => {
          if (s.countdownSeconds <= 1) {
            clearInterval(this.countdownHandle);
            return { countdownSeconds: 0, showGameStartingOverlay: false };
          }
          return { countdownSeconds: s.countdownSeconds - 1 };
        });
      }, 1000);
    }

    // Start bot-vote countdown when vote becomes active
    const prevVoteActive = prev.lobbyBotVoteActive;
    const currVoteActive = curr.lobbyBotVoteActive;
    if (!prevVoteActive && currVoteActive) {
      const deadline = curr.lobbyBotVoteDeadlineTs || 0;
      const calcTimeLeft = () =>
        Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      this.setState({ botVoteTimeLeft: calcTimeLeft() });
      this.botVoteTimerHandle = setInterval(() => {
        const tl = calcTimeLeft();
        this.setState({ botVoteTimeLeft: tl });
        if (tl <= 0) clearInterval(this.botVoteTimerHandle);
      }, 1000);
    }
    if (prevVoteActive && !currVoteActive) {
      clearInterval(this.botVoteTimerHandle);
    }
  }

  /** Play a short ascending chime using the Web Audio API and trigger haptic feedback. */
  private playMatchFoundSound(): void {
    try {
      const ctx = this.audioCtx;
      if (!ctx) return;

      const doPlay = () => {
        const playTone = (freq: number, startAt: number, duration: number) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = "sine";
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0, ctx.currentTime + startAt);
          gain.gain.linearRampToValueAtTime(
            0.4,
            ctx.currentTime + startAt + 0.02,
          );
          gain.gain.linearRampToValueAtTime(
            0,
            ctx.currentTime + startAt + duration,
          );
          osc.start(ctx.currentTime + startAt);
          osc.stop(ctx.currentTime + startAt + duration);
        };
        playTone(523, 0, 0.25); // C5
        playTone(659, 0.28, 0.25); // E5
        playTone(784, 0.56, 0.45); // G5
      };

      if (ctx.state === "suspended") {
        ctx
          .resume()
          .then(doPlay)
          .catch(() => {});
      } else {
        doPlay();
      }
    } catch (_) {
      /* audio unavailable */
    }
    try {
      if (navigator.vibrate) navigator.vibrate([200, 80, 200, 80, 400]);
    } catch (_) {
      /* vibration unavailable */
    }
  }

  private formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  private handleLeave = async () => {
    await this.store.leaveLobby();
    if (this.props.onBack) {
      this.props.onBack();
    }
  };

  public render() {
    if (!this.store.game.isInLobby) {
      // Render the overlay even when already transitioned (brief window)
      if (this.state.showGameStartingOverlay) {
        return this.renderGameStartingOverlay();
      }
      return null;
    }

    const {
      lobbyPlayers = [],
      lobbyCount = 0,
      lobbyBotVoteActive,
      lobbyBotVoteOptions,
    } = this.store.game;
    const totalSlots = 6;
    const filledSlots = lobbyCount;
    const emptySlots = Math.max(0, totalSlots - filledSlots);
    const progressPercent = (filledSlots / totalSlots) * 100;
    const timeLeft = Math.max(0, MAX_LOBBY_SECONDS - this.state.elapsedSeconds);
    const isWarning = timeLeft <= MAX_LOBBY_SECONDS - WARNING_THRESHOLD_SECONDS;

    return (
      <div style={styles.overlay}>
        {this.state.showGameStartingOverlay && this.renderGameStartingOverlay()}
        {lobbyBotVoteActive && this.renderBotVoteOverlay(lobbyBotVoteOptions)}

        <div style={styles.card}>
          {/* ── Back button ── */}
          {this.props.onBack && (
            <button style={styles.backButton} onClick={this.props.onBack}>
              <span style={styles.backIcon}>←</span> Back to Menu
            </button>
          )}

          {/* ── Header ── */}
          <div style={styles.header}>
            <div style={styles.spinner} />
            <h2 style={styles.title}>Finding Match…</h2>
            <p style={styles.subtitle}>
              Waiting for players. The game starts automatically once 6 players
              are ready.{" "}
              <span style={styles.subtitleNote}>
                This lobby closes in 15 minutes if a full table isn't found.
              </span>
            </p>
          </div>

          {/* ── Progress bar ── */}
          <div style={styles.progressTrack}>
            <div
              style={{ ...styles.progressFill, width: `${progressPercent}%` }}
            />
          </div>

          {/* ── Player count ── */}
          <div style={styles.countRow}>
            <span style={styles.countLabel}>Players in lobby</span>
            <span style={styles.countBadge}>
              {filledSlots}
              <span style={styles.countTotal}> / 6</span>
            </span>
          </div>

          {/* ── Seat grid ── */}
          <div style={styles.seatGrid}>
            {lobbyPlayers.map((p) => (
              <div key={p.playerId} style={styles.seatFilled}>
                <div style={styles.avatar}>
                  {p.playerId.charAt(0).toUpperCase()}
                </div>
                <span style={styles.seatName}>{p.playerId}</span>
                {p.playerId === this.store.user.playerId && (
                  <span style={styles.youBadge}>You</span>
                )}
              </div>
            ))}
            {Array.from({ length: emptySlots }).map((_, i) => (
              <div key={`empty-${i}`} style={styles.seatEmpty}>
                <div style={styles.avatarEmpty}>?</div>
                <span style={styles.seatNameEmpty}>Waiting…</span>
              </div>
            ))}
          </div>

          {/* ── Timer row ── */}
          <div style={isWarning ? styles.timerRowWarning : styles.timerRow}>
            <span style={styles.timerIcon}>{isWarning ? "⚠️" : "⏱"}</span>
            <span style={styles.timerLabel}>
              {isWarning
                ? `Lobby closes in ${this.formatTime(timeLeft)}`
                : `Lobby closes in ${this.formatTime(timeLeft)}`}
            </span>
          </div>

          {/* ── Leave button ── */}
          <button style={styles.leaveBtn} onClick={this.handleLeave}>
            Leave Queue
          </button>
        </div>
      </div>
    );
  }

  private renderGameStartingOverlay() {
    return (
      <div style={styles.startingOverlay}>
        <div style={styles.startingCard}>
          <div style={styles.startingIcon}>🎮</div>
          <h2 style={styles.startingTitle}>Match Found!</h2>
          <p style={styles.startingSubtitle}>
            All 6 players are ready. Your game is starting…
          </p>
          {this.state.countdownSeconds > 0 && (
            <div style={styles.countdown}>{this.state.countdownSeconds}</div>
          )}
        </div>
      </div>
    );
  }

  private renderBotVoteOverlay(lobbyBotVoteOptions?: {
    voteYes: number;
    voteTotal: number;
  }) {
    const { botVoteTimeLeft } = this.state;
    const voteYes = lobbyBotVoteOptions?.voteYes ?? 0;
    const voteTotal = lobbyBotVoteOptions?.voteTotal ?? 1;
    const emptySlots = 6 - voteTotal;
    return (
      <div style={styles.startingOverlay}>
        <div style={styles.voteCard}>
          <div style={styles.startingIcon}>🤖</div>
          <h2 style={styles.voteTitle}>Fill empty seats with bots?</h2>
          <p style={styles.voteSubtitle}>
            The lobby timed out with {emptySlots} seat
            {emptySlots !== 1 ? "s" : ""} empty. All {voteTotal} player
            {voteTotal !== 1 ? "s" : ""} must agree to continue with AI
            opponents.
          </p>
          <div style={styles.voteStatus}>
            <span style={styles.voteCount}>
              {voteYes} / {voteTotal}
            </span>
            <span style={styles.voteCountLabel}>voted yes</span>
          </div>
          <div style={styles.voteTimer}>
            <span
              style={
                botVoteTimeLeft <= 10
                  ? styles.voteTimerUrgent
                  : styles.voteTimerLabel
              }
            >
              {this.formatTime(botVoteTimeLeft)} remaining
            </span>
          </div>
          <div style={styles.voteActions}>
            <button
              style={styles.voteBtnYes}
              onClick={() => this.store.voteBotSubstitution(true)}
            >
              ✓ Yes, fill with bots
            </button>
            <button
              style={styles.voteBtnNo}
              onClick={() => this.store.voteBotSubstitution(false)}
            >
              ✗ No, cancel
            </button>
          </div>
        </div>
      </div>
    );
  }
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles: { [key: string]: React.CSSProperties } = {
  overlay: {
    position: "fixed" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: "24px",
    zIndex: 50,
    overflowY: "auto" as const,
  },
  backButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 16px",
    background: "rgba(255, 255, 255, 0.04)",
    border: "1px solid rgba(255, 255, 255, 0.06)",
    borderRadius: "10px",
    color: "#8b95a5",
    fontSize: "13px",
    fontWeight: 500,
    fontFamily: "'Inter', sans-serif",
    cursor: "pointer",
    transition: "all 0.25s ease",
    marginBottom: "20px",
  },
  backIcon: {
    fontSize: "16px",
    color: "#0ea5e9",
  },
  card: {
    background: "rgba(15, 19, 25, 0.8)",
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
    borderRadius: "20px",
    padding: "32px",
    width: "100%",
    maxWidth: "520px",
    boxShadow:
      "0 24px 48px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.03)",
    border: "1px solid rgba(255, 255, 255, 0.04)",
    color: "#c8d1dc",
    fontFamily: "'Inter', sans-serif",
  },
  header: {
    textAlign: "center",
    marginBottom: "24px",
  },
  spinner: {
    width: "44px",
    height: "44px",
    border: "3px solid rgba(255, 255, 255, 0.06)",
    borderTop: "3px solid #0ea5e9",
    borderRadius: "50%",
    margin: "0 auto 16px",
    animation: "spin 1s linear infinite",
  },
  title: {
    margin: "0 0 8px",
    fontSize: "22px",
    color: "#f0f4f8",
    fontWeight: 700,
    letterSpacing: "-0.01em",
  },
  subtitle: {
    margin: 0,
    fontSize: "13px",
    color: "#8b95a5",
    lineHeight: 1.5,
  },
  subtitleNote: {
    color: "#5a6577",
    fontStyle: "italic",
  },
  progressTrack: {
    background: "rgba(255, 255, 255, 0.06)",
    borderRadius: "8px",
    height: "6px",
    margin: "0 0 16px",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    background: "linear-gradient(90deg, #0284c7, #0ea5e9, #38bdf8)",
    borderRadius: "8px",
    transition: "width 0.6s ease",
  },
  countRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "20px",
  },
  countLabel: {
    fontSize: "11px",
    color: "#8b95a5",
    textTransform: "uppercase",
    letterSpacing: "1px",
    fontWeight: 600,
  },
  countBadge: {
    fontSize: "22px",
    fontWeight: 700,
    color: "#0ea5e9",
  },
  countTotal: {
    fontSize: "16px",
    color: "#5a6577",
  },
  seatGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "10px",
    marginBottom: "24px",
  },
  seatFilled: {
    background: "rgba(14, 165, 233, 0.08)",
    border: "1px solid rgba(14, 165, 233, 0.2)",
    borderRadius: "12px",
    padding: "12px 8px",
    textAlign: "center",
    position: "relative",
  },
  seatEmpty: {
    background: "rgba(255, 255, 255, 0.02)",
    border: "1px dashed rgba(255, 255, 255, 0.08)",
    borderRadius: "12px",
    padding: "12px 8px",
    textAlign: "center",
  },
  avatar: {
    width: "34px",
    height: "34px",
    borderRadius: "50%",
    background: "linear-gradient(135deg, #0284c7, #0ea5e9)",
    color: "#fff",
    fontSize: "14px",
    fontWeight: 700,
    lineHeight: "34px",
    margin: "0 auto 6px",
  },
  avatarEmpty: {
    width: "34px",
    height: "34px",
    borderRadius: "50%",
    background: "rgba(255, 255, 255, 0.04)",
    color: "rgba(255, 255, 255, 0.2)",
    fontSize: "16px",
    lineHeight: "34px",
    margin: "0 auto 6px",
  },
  seatName: {
    display: "block",
    fontSize: "11px",
    color: "#c8d1dc",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  seatNameEmpty: {
    display: "block",
    fontSize: "11px",
    color: "rgba(255, 255, 255, 0.2)",
    fontStyle: "italic",
  },
  youBadge: {
    position: "absolute",
    top: "4px",
    right: "4px",
    background: "#0ea5e9",
    color: "#fff",
    fontSize: "9px",
    fontWeight: 700,
    padding: "2px 5px",
    borderRadius: "4px",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  timerRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    background: "rgba(255, 255, 255, 0.03)",
    borderRadius: "10px",
    padding: "10px 14px",
    marginBottom: "20px",
  },
  timerRowWarning: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    background: "rgba(245, 158, 11, 0.08)",
    border: "1px solid rgba(245, 158, 11, 0.2)",
    borderRadius: "10px",
    padding: "10px 14px",
    marginBottom: "20px",
  },
  timerIcon: {
    fontSize: "16px",
  },
  timerLabel: {
    fontSize: "13px",
    color: "#8b95a5",
    fontVariantNumeric: "tabular-nums",
  },
  leaveBtn: {
    width: "100%",
    padding: "12px",
    background: "transparent",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    borderRadius: "10px",
    color: "#5a6577",
    fontSize: "13px",
    fontWeight: 500,
    fontFamily: "'Inter', sans-serif",
    cursor: "pointer",
    transition: "all 0.25s ease",
  },
  startingOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0, 0, 0, 0.75)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    backdropFilter: "blur(8px)",
  },
  startingCard: {
    background: "rgba(15, 19, 25, 0.9)",
    backdropFilter: "blur(24px)",
    borderRadius: "24px",
    padding: "48px 40px",
    textAlign: "center",
    boxShadow:
      "0 24px 64px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.03)",
    maxWidth: "380px",
    width: "90vw",
    border: "1px solid rgba(14, 165, 233, 0.15)",
  },
  startingIcon: {
    fontSize: "52px",
    marginBottom: "16px",
  },
  startingTitle: {
    color: "#0ea5e9",
    fontSize: "26px",
    fontWeight: 700,
    margin: "0 0 10px",
    letterSpacing: "-0.01em",
  },
  startingSubtitle: {
    color: "#8b95a5",
    fontSize: "14px",
    lineHeight: 1.5,
    margin: "0 0 24px",
  },
  countdown: {
    width: "68px",
    height: "68px",
    borderRadius: "50%",
    background: "rgba(14, 165, 233, 0.1)",
    border: "2px solid #0ea5e9",
    color: "#0ea5e9",
    fontSize: "30px",
    fontWeight: 700,
    lineHeight: "64px",
    margin: "0 auto",
    animation: "pulse 1s ease-in-out infinite",
  },
  voteCard: {
    background: "rgba(15, 19, 25, 0.9)",
    backdropFilter: "blur(24px)",
    borderRadius: "24px",
    padding: "40px 36px",
    textAlign: "center",
    boxShadow:
      "0 24px 64px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.03)",
    maxWidth: "400px",
    width: "90vw",
    border: "1px solid rgba(212, 168, 67, 0.15)",
  },
  voteTitle: {
    color: "#d4a843",
    fontSize: "20px",
    fontWeight: 700,
    margin: "0 0 10px",
  },
  voteSubtitle: {
    color: "#8b95a5",
    fontSize: "13px",
    lineHeight: 1.5,
    margin: "0 0 20px",
  },
  voteStatus: {
    display: "flex",
    justifyContent: "center",
    alignItems: "baseline",
    gap: "8px",
    marginBottom: "12px",
  },
  voteCount: {
    fontSize: "26px",
    fontWeight: 700,
    color: "#d4a843",
    fontVariantNumeric: "tabular-nums",
  },
  voteCountLabel: {
    fontSize: "13px",
    color: "#5a6577",
  },
  voteTimer: {
    marginBottom: "24px",
  },
  voteTimerLabel: {
    fontSize: "13px",
    color: "#5a6577",
    fontVariantNumeric: "tabular-nums",
  },
  voteTimerUrgent: {
    fontSize: "13px",
    color: "#ef4444",
    fontWeight: 700,
    fontVariantNumeric: "tabular-nums",
  },
  voteActions: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "10px",
  },
  voteBtnYes: {
    padding: "12px",
    background: "linear-gradient(135deg, #16a34a, #22c55e)",
    border: "none",
    borderRadius: "10px",
    color: "#fff",
    fontSize: "14px",
    fontWeight: 600,
    fontFamily: "'Inter', sans-serif",
    cursor: "pointer",
    boxShadow: "0 4px 16px rgba(34, 197, 94, 0.2)",
  },
  voteBtnNo: {
    padding: "12px",
    background: "transparent",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    borderRadius: "10px",
    color: "#5a6577",
    fontSize: "14px",
    fontFamily: "'Inter', sans-serif",
    cursor: "pointer",
  },
};

export default Lobby;
