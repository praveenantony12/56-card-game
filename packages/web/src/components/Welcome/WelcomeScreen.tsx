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
        <div style={styles.glowEffect} />

        <div
          style={{
            ...styles.card,
            opacity: isAnimating ? 0 : 1,
            transform: isAnimating ? "scale(0.95)" : "scale(1)",
            transition: "all 350ms cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          {/* Logo / Icon */}
          <div style={styles.logoContainer}>
            <div style={styles.logo}>
              <span style={styles.logoIcon}>🃏</span>
            </div>
          </div>

          {/* Title */}
          <h1 style={styles.title}>
            <span style={styles.titleAccent}>56</span> Card Game
          </h1>

          <p style={styles.subtitle}>
            Welcome to the ultimate card game experience
          </p>

          {/* Form */}
          <form onSubmit={this.handleSubmit} style={styles.form}>
            <div style={styles.inputContainer}>
              <label htmlFor="playerName" style={styles.label}>
                Enter Your Name
              </label>
              <input
                id="playerName"
                type="text"
                value={playerName}
                onChange={this.handleInputChange}
                placeholder="Your name"
                style={{
                  ...styles.input,
                  borderColor: error ? "#ef4444" : "rgba(255, 255, 255, 0.1)",
                }}
                autoFocus
              />
              {error && (
                <div style={styles.error}>
                  <span style={styles.errorIcon}>⚠️</span>
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
                  !playerName.trim() || playerName.trim().length < 2 ? 0.5 : 1,
                cursor:
                  !playerName.trim() || playerName.trim().length < 2
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              Continue
              <span style={styles.buttonIcon}>→</span>
            </button>
          </form>

          {/* Footer */}
          <p style={{ ...styles.footer, marginTop: "16px" }}>
            Play with friends or challenge AI opponents
          </p>
        </div>
        <p
          style={{
            position: "absolute",
            bottom: "20px",
            fontSize: "12px",
            color: "#9CA3AF",
            opacity: 0.75,
            margin: 0,
          }}
        >
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
  card: {
    width: "100%",
    maxWidth: "420px",
    background: "linear-gradient(145deg, #1a1a25 0%, #16161f 100%)",
    borderRadius: "24px",
    border: "1px solid rgba(255, 255, 255, 0.05)",
    padding: "48px 32px",
    boxShadow:
      "0 20px 40px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.02)",
    textAlign: "center",
    position: "relative",
    zIndex: 10,
    animation: "fadeInScale 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
  },
  logoContainer: {
    marginBottom: "24px",
  },
  logo: {
    width: "80px",
    height: "80px",
    margin: "0 auto",
    background:
      "linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)",
    borderRadius: "20px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 10px 30px rgba(99, 102, 241, 0.3)",
  },
  logoIcon: {
    fontSize: "40px",
    filter: "drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3))",
  },
  title: {
    fontSize: "32px",
    fontWeight: 800,
    color: "#ffffff",
    margin: "0 0 8px 0",
    letterSpacing: "-0.02em",
  },
  titleAccent: {
    background:
      "linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
  },
  subtitle: {
    fontSize: "16px",
    color: "#a1a1aa",
    margin: "0 0 32px 0",
    lineHeight: 1.5,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "20px",
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
    fontSize: "14px",
    fontWeight: 600,
    color: "#e4e4e7",
    marginBottom: "8px",
  },
  input: {
    width: "100%",
    padding: "16px 20px",
    fontSize: "16px",
    fontFamily: "inherit",
    color: "#ffffff",
    background: "rgba(30, 30, 45, 0.9)",
    border: "2px solid rgba(255, 255, 255, 0.2)",
    borderRadius: "12px",
    outline: "none",
    opacity: 1,
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
  },
  errorIcon: {
    fontSize: "12px",
  },
  button: {
    width: "100%",
    padding: "16px 24px",
    fontSize: "16px",
    fontWeight: 600,
    fontFamily: "inherit",
    color: "#ffffff",
    background:
      "linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)",
    border: "none",
    borderRadius: "12px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    transition: "all 250ms cubic-bezier(0.4, 0, 0.2, 1)",
    boxShadow: "0 4px 15px rgba(99, 102, 241, 0.3)",
    marginTop: "8px",
    position: "relative",
    zIndex: 15,
  },
  buttonIcon: {
    fontSize: "18px",
    transition: "transform 250ms ease",
  },
  decorativeCards: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: "none",
    overflow: "hidden",
    borderRadius: "24px",
    zIndex: 0,
  },
  cardIcon: {
    position: "absolute",
    fontSize: "24px",
    opacity: 0.15,
    animation: "float 3s ease-in-out infinite",
  },
  cardIcon1: {
    top: "20px",
    left: "20px",
    animationDelay: "0s",
  },
  cardIcon2: {
    top: "30px",
    right: "25px",
    animationDelay: "0.5s",
  },
  cardIcon3: {
    bottom: "25px",
    left: "30px",
    animationDelay: "1s",
  },
  cardIcon4: {
    bottom: "20px",
    right: "20px",
    animationDelay: "1.5s",
  },
  footer: {
    fontSize: "14px",
    color: "#71717a",
    margin: 0,
  },
};

// Add keyframe animation
if (typeof document !== "undefined") {
  const styleSheet = document.createElement("style");
  styleSheet.textContent = `
    @keyframes fadeInScale {
      from {
        opacity: 0;
        transform: scale(0.95);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }
  `;
  document.head.appendChild(styleSheet);
}

export default WelcomeScreen;
