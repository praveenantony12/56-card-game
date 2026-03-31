import { inject, observer } from "mobx-react";
import * as React from "react";
import { IStore } from "../../stores/IStore";
import "../../styles/theme.css";

interface IProps {
  store?: IStore;
  onComplete: () => void;
  onNameSet: (name: string) => void;
}

interface IState {
  playerName: string;
  error: string;
  isAnimating: boolean;
}

@inject("store")
@observer
class WelcomeScreen extends React.Component<IProps, IState> {
  constructor(props: IProps) {
    super(props);
    this.state = {
      playerName: "",
      error: "",
      isAnimating: false,
    };
  }

  private get store(): IStore {
    return this.props.store as IStore;
  }

  private handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Only allow letters, numbers, and spaces, max 20 chars
    if (value.length <= 20 && /^[a-zA-Z0-9\s]*$/.test(value)) {
      this.setState({ playerName: value, error: "" });
    }
  };

  private handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { playerName } = this.state;

    if (!playerName.trim()) {
      this.setState({ error: "Please enter your name to continue" });
      return;
    }

    if (playerName.trim().length < 2) {
      this.setState({ error: "Name must be at least 2 characters" });
      return;
    }

    this.setState({ isAnimating: true });

    // Pass name to parent before completing
    this.props.onNameSet(playerName.trim());

    // Small delay for animation effect
    setTimeout(() => {
      this.props.onComplete();
    }, 400);
  };

  public render() {
    const { playerName, error, isAnimating } = this.state;

    return (
      <div style={styles.container}>
        {/* Ambient glow effects */}
        <div style={styles.glowOrb1} />
        <div style={styles.glowOrb2} />

        <div
          style={{
            ...styles.card,
            opacity: isAnimating ? 0 : 1,
            transform: isAnimating
              ? "scale(0.95) translateY(8px)"
              : "scale(1) translateY(0)",
            transition: "all 400ms cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          {/* Logo */}
          <div style={styles.logoContainer}>
            <img
              src="/icons/icon-192x192.png"
              alt="56 Card Game"
              style={styles.logo}
            />
            <div style={styles.logoGlow} />
          </div>

          {/* Title */}
          <h1 style={styles.title}>
            <span style={styles.titleGold}>56</span> Card Game
          </h1>

          <p style={styles.subtitle}>
            The premium trick-taking card game experience
          </p>

          {/* Decorative divider */}
          <div style={styles.divider}>
            <div style={styles.dividerLine} />
            <div style={styles.suitRow}>
              <span
                style={{
                  ...styles.suitIcon,
                  color: "#5a6577",
                  animation:
                    "suitFloat 3s ease-in-out infinite, suitGlow 3s ease-in-out infinite",
                }}
              >
                ♠
              </span>
              <span
                style={{
                  ...styles.suitIcon,
                  color: "#ef4444",
                  animation:
                    "suitFloat 3s ease-in-out 0.5s infinite, suitGlow 3s ease-in-out 0.5s infinite",
                }}
              >
                ♥
              </span>
              <span
                style={{
                  ...styles.suitIcon,
                  color: "#d4a843",
                  animation:
                    "suitFloat 3s ease-in-out 1s infinite, suitGlow 3s ease-in-out 1s infinite",
                }}
              >
                ♦
              </span>
              <span
                style={{
                  ...styles.suitIcon,
                  color: "#5a6577",
                  animation:
                    "suitFloat 3s ease-in-out 1.5s infinite, suitGlow 3s ease-in-out 1.5s infinite",
                }}
              >
                ♣
              </span>
            </div>
            <div style={styles.dividerLine} />
          </div>

          {/* Form */}
          <form onSubmit={this.handleSubmit} style={styles.form}>
            <div style={styles.inputContainer}>
              <label htmlFor="playerName" style={styles.label}>
                Your Name
              </label>
              <input
                id="playerName"
                type="text"
                value={playerName}
                onChange={this.handleInputChange}
                placeholder="Enter your name"
                style={{
                  ...styles.input,
                  borderColor: error ? "#ef4444" : "rgba(255, 255, 255, 0.08)",
                  boxShadow: error
                    ? "0 0 0 3px rgba(239, 68, 68, 0.1)"
                    : "none",
                }}
                autoFocus
              />
              {error && (
                <div style={styles.error}>
                  <span style={styles.errorIcon}>⚠</span>
                  {error}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={!playerName.trim() || playerName.trim().length < 2}
              style={{
                ...styles.button,
                opacity:
                  !playerName.trim() || playerName.trim().length < 2 ? 0.4 : 1,
                cursor:
                  !playerName.trim() || playerName.trim().length < 2
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              Enter the Lounge
              <span style={styles.buttonArrow}>→</span>
            </button>
          </form>

          {/* Tagline */}
          <p style={styles.tagline}>
            Play with friends or challenge AI opponents
          </p>
        </div>

        {/* Copyright */}
        <p style={styles.copyright}>
          &copy; {new Date().getFullYear()} Praveen Antony
        </p>
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
    minHeight: "100vh",
  },
  glowOrb1: {
    position: "absolute",
    top: "30%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: "500px",
    height: "500px",
    background:
      "radial-gradient(ellipse at center, rgba(14, 165, 233, 0.08) 0%, transparent 70%)",
    pointerEvents: "none",
  },
  glowOrb2: {
    position: "absolute",
    bottom: "10%",
    right: "20%",
    width: "300px",
    height: "300px",
    background:
      "radial-gradient(ellipse at center, rgba(212, 168, 67, 0.06) 0%, transparent 70%)",
    pointerEvents: "none",
  },
  card: {
    width: "100%",
    maxWidth: "440px",
    background: "rgba(15, 19, 25, 0.8)",
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
    borderRadius: "28px",
    border: "1px solid rgba(255, 255, 255, 0.06)",
    padding: "48px 36px",
    boxShadow:
      "0 24px 48px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.02), inset 0 1px 0 rgba(255, 255, 255, 0.04)",
    textAlign: "center",
    position: "relative",
    zIndex: 10,
    animation: "fadeInScale 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
  },
  logoContainer: {
    marginBottom: "28px",
    position: "relative",
    display: "inline-block",
  },
  logo: {
    width: "96px",
    height: "96px",
    margin: "0 auto",
    borderRadius: "22px",
    display: "block",
    objectFit: "contain",
    filter: "drop-shadow(0 12px 32px rgba(212, 168, 67, 0.3))",
    position: "relative",
    zIndex: 2,
  },
  logoGlow: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: "120px",
    height: "120px",
    background:
      "radial-gradient(circle, rgba(212, 168, 67, 0.15) 0%, transparent 70%)",
    borderRadius: "50%",
    zIndex: 1,
    animation: "pulse 3s ease-in-out infinite",
  },
  title: {
    fontSize: "36px",
    fontWeight: 800,
    color: "#f0f4f8",
    margin: "0 0 8px 0",
    letterSpacing: "-0.02em",
  },
  titleGold: {
    background: "linear-gradient(135deg, #d4a843 0%, #e8c468 100%)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
  },
  subtitle: {
    fontSize: "15px",
    color: "#8b95a5",
    margin: "0 0 24px 0",
    lineHeight: 1.6,
    letterSpacing: "0.3px",
  },
  divider: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    marginBottom: "28px",
  },
  dividerLine: {
    flex: 1,
    height: "1px",
    background:
      "linear-gradient(90deg, transparent 0%, rgba(212, 168, 67, 0.2) 50%, transparent 100%)",
  },
  suitRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  suitIcon: {
    fontSize: "14px",
    display: "inline-block",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "18px",
    position: "relative",
    zIndex: 10,
  },
  inputContainer: {
    textAlign: "left",
    position: "relative",
    zIndex: 20,
  },
  label: {
    display: "block",
    fontSize: "13px",
    fontWeight: 600,
    color: "#8b95a5",
    marginBottom: "8px",
    textTransform: "uppercase",
    letterSpacing: "0.8px",
  },
  input: {
    width: "100%",
    padding: "16px 20px",
    fontSize: "16px",
    fontFamily: "'Inter', sans-serif",
    fontWeight: 500,
    color: "#f0f4f8",
    background: "rgba(26, 32, 48, 0.8)",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    borderRadius: "14px",
    outline: "none",
    transition: "all 250ms cubic-bezier(0.4, 0, 0.2, 1)",
    boxSizing: "border-box",
    display: "block",
    position: "relative",
    zIndex: 5,
  },
  error: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    marginTop: "8px",
    fontSize: "13px",
    color: "#ef4444",
    fontWeight: 500,
  },
  errorIcon: {
    fontSize: "13px",
  },
  button: {
    width: "100%",
    padding: "16px 24px",
    fontSize: "16px",
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
    transition: "all 250ms cubic-bezier(0.4, 0, 0.2, 1)",
    boxShadow:
      "0 4px 20px rgba(212, 168, 67, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.2)",
    marginTop: "4px",
    position: "relative",
    zIndex: 15,
    letterSpacing: "0.3px",
  },
  buttonArrow: {
    fontSize: "18px",
    fontWeight: 700,
    transition: "transform 250ms ease",
  },
  tagline: {
    fontSize: "13px",
    color: "#5a6577",
    margin: "20px 0 0 0",
  },
  copyright: {
    position: "absolute",
    bottom: "20px",
    fontSize: "11px",
    color: "#5a6577",
    opacity: 0.6,
    margin: 0,
    letterSpacing: "0.3px",
  },
};

export default WelcomeScreen;
