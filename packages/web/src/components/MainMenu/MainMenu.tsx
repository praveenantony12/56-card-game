import * as React from "react";
import { inject, observer } from "mobx-react";
import { IStore } from "../../stores/IStore";
import "../../styles/theme.css";

export type GameAction = "host" | "join" | "find" | "watch";

interface IProps {
  store?: IStore;
  onActionSelect: (action: GameAction) => void;
  playerName: string;
}

interface IState {
  hoveredCard: GameAction | null;
}

@inject("store")
@observer
class MainMenu extends React.Component<IProps, IState> {
  constructor(props: IProps) {
    super(props);
    this.state = {
      hoveredCard: null,
    };
  }

  private get store(): IStore {
    return this.props.store as IStore;
  }

  private handleCardHover = (action: GameAction | null) => {
    this.setState({ hoveredCard: action });
  };

  private handleActionClick = (action: GameAction) => {
    this.props.onActionSelect(action);
  };

  public render() {
    const { playerName } = this.props;
    const { hoveredCard } = this.state;

    const menuItems: {
      action: GameAction;
      icon: string;
      title: string;
      description: string;
      color: string;
    }[] = [
      {
        action: "host",
        icon: "👑",
        title: "Host a Table",
        description: "Create a new game and invite friends or play with bots",
        color: "#6366f1",
      },
      {
        action: "join",
        icon: "🎮",
        title: "Enter Game ID",
        description: "Join an existing game using a Game ID",
        color: "#10b981",
      },
      {
        action: "find",
        icon: "🔍",
        title: "Find a Table",
        description: "Join the lobby and match with other players",
        color: "#f59e0b",
      },
      {
        action: "watch",
        icon: "👁️",
        title: "Watch a Table",
        description: "Spectate an ongoing game as a viewer",
        color: "#8b5cf6",
      },
    ];

    return (
      <div style={styles.container}>
        <div style={styles.glowEffect} />

        <div style={styles.content}>
          {/* Header */}
          <div style={styles.header}>
            <div style={styles.welcomeBadge}>
              <span style={styles.welcomeIcon}>👋</span>
              Welcome, <span style={styles.playerName}>{playerName}</span>
            </div>
            <h1 style={styles.title}>Choose Your Path</h1>
            <p style={styles.subtitle}>Select how you'd like to play</p>
          </div>

          {/* Menu Grid */}
          <div style={styles.grid}>
            {menuItems.map((item, index) => (
              <div
                key={item.action}
                onClick={() => this.handleActionClick(item.action)}
                onMouseEnter={() => this.handleCardHover(item.action)}
                onMouseLeave={() => this.handleCardHover(null)}
                style={{
                  ...styles.card,
                  borderColor:
                    hoveredCard === item.action
                      ? `${item.color}40`
                      : "rgba(255, 255, 255, 0.05)",
                  boxShadow:
                    hoveredCard === item.action
                      ? `0 20px 40px rgba(0, 0, 0, 0.4), 0 0 30px ${item.color}30`
                      : "0 10px 30px rgba(0, 0, 0, 0.3)",
                  transform:
                    hoveredCard === item.action
                      ? "translateY(-4px)"
                      : "translateY(0)",
                  animationDelay: `${index * 0.1}s`,
                }}
              >
                {/* Card Icon */}
                <div
                  style={{
                    ...styles.iconContainer,
                    background: `linear-gradient(135deg, ${item.color}20 0%, ${item.color}10 100%)`,
                  }}
                >
                  <span style={styles.icon}>{item.icon}</span>
                </div>

                {/* Card Content */}
                <div style={styles.cardContent}>
                  <h3 style={styles.cardTitle}>{item.title}</h3>
                  <p style={styles.cardDescription}>{item.description}</p>
                </div>

                {/* Arrow indicator */}
                <div
                  style={{
                    ...styles.arrow,
                    color: item.color,
                    opacity: hoveredCard === item.action ? 1 : 0.5,
                    transform:
                      hoveredCard === item.action
                        ? "translateX(4px)"
                        : "translateX(0)",
                  }}
                >
                  →
                </div>

                {/* Hover glow effect */}
                {hoveredCard === item.action && (
                  <div
                    style={{
                      ...styles.cardGlow,
                      background: `radial-gradient(ellipse at center, ${item.color}20 0%, transparent 70%)`,
                    }}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Footer info */}
          <div style={styles.footer}>
            <p style={styles.footerText}>
              You can always return to this menu by leaving your current game
            </p>
          </div>
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
    overflow: "hidden",
  },
  glowEffect: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: "800px",
    height: "800px",
    background:
      "radial-gradient(ellipse at center, rgba(99, 102, 241, 0.1) 0%, transparent 70%)",
    pointerEvents: "none",
  },
  content: {
    width: "100%",
    maxWidth: "720px",
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
    textAlign: "center",
    marginBottom: "40px",
  },
  welcomeBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    padding: "10px 18px",
    background: "rgba(99, 102, 241, 0.1)",
    border: "1px solid rgba(99, 102, 241, 0.2)",
    borderRadius: "9999px",
    fontSize: "14px",
    color: "#a1a1aa",
    marginBottom: "20px",
  },
  welcomeIcon: {
    fontSize: "16px",
  },
  playerName: {
    color: "#ffffff",
    fontWeight: 600,
  },
  title: {
    fontSize: "40px",
    fontWeight: 800,
    color: "#ffffff",
    margin: "0 0 8px 0",
    letterSpacing: "-0.02em",
  },
  subtitle: {
    fontSize: "18px",
    color: "#71717a",
    margin: 0,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: "20px",
    marginBottom: "40px",
  },
  card: {
    position: "relative",
    background: "linear-gradient(145deg, #1a1a25 0%, #16161f 100%)",
    borderRadius: "20px",
    border: "1px solid rgba(255, 255, 255, 0.05)",
    padding: "28px",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "16px",
    transition: "all 250ms cubic-bezier(0.4, 0, 0.2, 1)",
    overflow: "hidden",
    animation: "fadeInScale 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards",
    opacity: 0,
  },
  iconContainer: {
    width: "56px",
    height: "56px",
    borderRadius: "16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  icon: {
    fontSize: "28px",
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: "20px",
    fontWeight: 700,
    color: "#ffffff",
    margin: "0 0 8px 0",
  },
  cardDescription: {
    fontSize: "14px",
    color: "#a1a1aa",
    margin: 0,
    lineHeight: 1.5,
  },
  arrow: {
    position: "absolute",
    bottom: "24px",
    right: "24px",
    fontSize: "20px",
    fontWeight: 700,
    transition: "all 250ms cubic-bezier(0.4, 0, 0.2, 1)",
  },
  cardGlow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: "none",
    opacity: 0.5,
  },
  footer: {
    textAlign: "center",
  },
  footerText: {
    fontSize: "14px",
    color: "#71717a",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
  },
  footerIcon: {
    fontSize: "14px",
  },
};

// Add keyframe animations
if (typeof document !== "undefined") {
  const styleSheet = document.createElement("style");
  styleSheet.textContent = `
    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
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

export default MainMenu;
