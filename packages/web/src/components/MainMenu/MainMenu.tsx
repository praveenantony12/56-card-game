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
      accentColor: string;
      glowColor: string;
    }[] = [
      {
        action: "host",
        icon: "♠",
        title: "Host a Table",
        description: "Create a new game and invite friends or play with bots",
        accentColor: "#d4a843",
        glowColor: "rgba(212, 168, 67, 0.12)",
      },
      {
        action: "join",
        icon: "♦",
        title: "Enter Game ID",
        description: "Join an existing game using a Game ID",
        accentColor: "#22c55e",
        glowColor: "rgba(34, 197, 94, 0.12)",
      },
      {
        action: "find",
        icon: "♣",
        title: "Find a Table",
        description: "Join the lobby and match with other players",
        accentColor: "#0ea5e9",
        glowColor: "rgba(14, 165, 233, 0.12)",
      },
      {
        action: "watch",
        icon: "♥",
        title: "Watch a Table",
        description: "Spectate an ongoing game as a viewer",
        accentColor: "#8b95a5",
        glowColor: "rgba(139, 149, 165, 0.08)",
      },
    ];

    return (
      <div style={styles.container}>
        <div style={styles.glowOrb} />

        <div style={styles.content}>
          {/* Header */}
          <div style={styles.header}>
            <div style={styles.welcomeBadge}>
              <span style={styles.welcomeDot} />
              Welcome back, <span style={styles.playerName}>{playerName}</span>
            </div>
            <h1 style={styles.title}>Choose Your Path</h1>
            <p style={styles.subtitle}>Select how you'd like to play tonight</p>
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
                  ...styles.menuCard,
                  borderColor:
                    hoveredCard === item.action
                      ? `${item.accentColor}30`
                      : "rgba(255, 255, 255, 0.04)",
                  boxShadow:
                    hoveredCard === item.action
                      ? `0 20px 40px rgba(0, 0, 0, 0.4), 0 0 40px ${item.accentColor}15`
                      : "0 8px 24px rgba(0, 0, 0, 0.3)",
                  transform:
                    hoveredCard === item.action
                      ? "translateY(-4px)"
                      : "translateY(0)",
                  animationDelay: `${index * 0.08}s`,
                }}
              >
                {/* Icon */}
                <div
                  style={{
                    ...styles.iconContainer,
                    background: item.glowColor,
                    color: item.accentColor,
                  }}
                >
                  <span
                    style={{
                      ...styles.icon,
                      animation: `suitFloat 3s ease-in-out ${index * 0.4}s infinite`,
                    }}
                  >
                    {item.icon}
                  </span>
                </div>

                {/* Card Content */}
                <div style={styles.cardContent}>
                  <h3 style={styles.cardTitle}>{item.title}</h3>
                  <p style={styles.cardDescription}>{item.description}</p>
                </div>

                {/* Arrow */}
                <div
                  style={{
                    ...styles.arrow,
                    color: item.accentColor,
                    opacity: hoveredCard === item.action ? 1 : 0.3,
                    transform:
                      hoveredCard === item.action
                        ? "translateX(4px)"
                        : "translateX(0)",
                  }}
                >
                  →
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={styles.footer}>
            <p style={styles.footerText}>
              You can always return to this menu by leaving your current game
            </p>
          </div>
        </div>

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
    overflow: "hidden",
    minHeight: "100vh",
  },
  glowOrb: {
    position: "absolute",
    top: "40%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: "700px",
    height: "700px",
    background:
      "radial-gradient(ellipse at center, rgba(14, 165, 233, 0.06) 0%, transparent 65%)",
    pointerEvents: "none",
  },
  content: {
    width: "100%",
    maxWidth: "720px",
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
      "0 24px 48px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.03)",
  },
  header: {
    textAlign: "center",
    marginBottom: "36px",
  },
  welcomeBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 16px",
    background: "rgba(14, 165, 233, 0.08)",
    border: "1px solid rgba(14, 165, 233, 0.15)",
    borderRadius: "9999px",
    fontSize: "13px",
    color: "#8b95a5",
    marginBottom: "20px",
  },
  welcomeDot: {
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    background: "#22c55e",
    boxShadow: "0 0 8px rgba(34, 197, 94, 0.5)",
  },
  playerName: {
    color: "#f0f4f8",
    fontWeight: 600,
  },
  title: {
    fontSize: "38px",
    fontWeight: 800,
    color: "#f0f4f8",
    margin: "0 0 8px 0",
    letterSpacing: "-0.02em",
  },
  subtitle: {
    fontSize: "16px",
    color: "#5a6577",
    margin: 0,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: "16px",
    marginBottom: "32px",
  },
  menuCard: {
    position: "relative",
    background: "rgba(21, 26, 35, 0.8)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    borderRadius: "20px",
    border: "1px solid rgba(255, 255, 255, 0.04)",
    padding: "24px",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "14px",
    transition: "all 250ms cubic-bezier(0.4, 0, 0.2, 1)",
    overflow: "hidden",
    animation: "fadeInScale 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards",
    opacity: 0,
  },
  iconContainer: {
    width: "52px",
    height: "52px",
    borderRadius: "14px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  icon: {
    fontSize: "24px",
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: "18px",
    fontWeight: 700,
    color: "#f0f4f8",
    margin: "0 0 6px 0",
  },
  cardDescription: {
    fontSize: "13px",
    color: "#5a6577",
    margin: 0,
    lineHeight: 1.5,
  },
  arrow: {
    position: "absolute",
    bottom: "20px",
    right: "20px",
    fontSize: "18px",
    fontWeight: 700,
    transition: "all 250ms cubic-bezier(0.4, 0, 0.2, 1)",
  },
  footer: {
    textAlign: "center",
  },
  footerText: {
    fontSize: "13px",
    color: "#5a6577",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
  },
  copyright: {
    position: "absolute",
    bottom: "20px",
    fontSize: "11px",
    color: "#5a6577",
    opacity: 0.6,
    margin: 0,
  },
};

export default MainMenu;
