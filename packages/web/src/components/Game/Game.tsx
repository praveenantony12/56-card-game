import { inject, observer } from "mobx-react";
import * as React from "react";
import { IStore } from "../../stores/IStore";

// New Flow Components
import HostGame from "../HostGame/HostGame";
import JoinGame from "../JoinGame/JoinGame";
import MainMenu, { GameAction } from "../MainMenu/MainMenu";
import WatchGame from "../WatchGame/WatchGame";
import WelcomeScreen from "../Welcome/WelcomeScreen";

// Existing Game Components
import BotReasoningPanel from "../BotReasoningPanel/BotReasoningPanel";
import BotSelection from "../BotSelection/BotSelection";
import GameGrid from "../GameGrid/GameGrid";
import Lobby from "../Lobby/Lobby";
import Notification from "../Notification/Notification";
import PlayersList from "../PlayersList/PlayersList";
import WaitMesssage from "../WaitMessage/WaitMesssage";

import "../../styles/theme.css";

type FlowState =
  | "welcome" // Enter name
  | "menu" // Main menu with 4 options
  | "host" // Host a table flow
  | "join" // Join with game ID
  | "find" // Find a table (lobby)
  | "watch" // Watch a table
  | "playing"; // Game is active

interface IProps {
  store?: IStore;
}

interface IState {
  flowState: FlowState;
  playerName: string;
  joinFromUrl: boolean;
}

@inject("store")
@observer
class Game extends React.Component<IProps, IState> {
  constructor(props: IProps) {
    super(props);
    this.state = {
      flowState: "welcome",
      playerName: "",
      joinFromUrl: false,
    };
  }

  private get store(): IStore {
    return this.props.store as IStore;
  }

  private get gameInfo() {
    return this.store.game;
  }

  componentDidMount() {
    // Check if user is already signed in (reconnection)
    if (this.store.user.isSignedIn) {
      this.setState({ flowState: "playing" });
    }
  }

  // Welcome Screen Handlers
  private handleWelcomeComplete = () => {
    // If a game ID was pre-set from a shared URL, skip the menu and go directly
    // to the join flow so the user just enters their name and joins immediately
    if (this.store.game.gameMode === "join" && this.store.game.gameIdToJoin) {
      this.setState({ flowState: "join", joinFromUrl: true });
    } else {
      this.setState({ flowState: "menu" });
    }
  };

  private handleNameSet = (name: string) => {
    this.setState({ playerName: name });
  };

  // Main Menu Handlers
  private handleMenuAction = (action: GameAction) => {
    switch (action) {
      case "host":
        this.setState({ flowState: "host" });
        break;
      case "join":
        this.setState({ flowState: "join" });
        break;
      case "find":
        this.setState({ flowState: "find" });
        // Trigger lobby join immediately
        this.store.setGameModeLobby();
        this.store.signIn(this.state.playerName);
        break;
      case "watch":
        this.setState({ flowState: "watch" });
        break;
    }
  };

  // Back to Menu Handler
  private handleBackToMenu = () => {
    // Reset game state when going back
    this.store.leaveGame();
    this.setState({ flowState: "menu" });
  };

  public render() {
    const { flowState, playerName } = this.state;
    const { canStartGame, isInLobby } = this.gameInfo;

    // If game is active (canStartGame), show the game grid and related components
    const isPlaying = canStartGame || this.store.user.isSignedIn;

    return (
      <div style={styles.gameContainer}>
        {/* Flow State Components - Only show when not playing */}
        {!isPlaying && flowState === "welcome" && (
          <WelcomeScreen
            onComplete={this.handleWelcomeComplete}
            onNameSet={this.handleNameSet}
          />
        )}

        {!isPlaying && flowState === "menu" && (
          <MainMenu
            onActionSelect={this.handleMenuAction}
            playerName={playerName}
          />
        )}

        {!isPlaying && flowState === "host" && (
          <HostGame onBack={this.handleBackToMenu} playerName={playerName} />
        )}

        {!isPlaying && flowState === "join" && (
          <JoinGame
            onBack={this.handleBackToMenu}
            playerName={playerName}
            autoJoin={this.state.joinFromUrl}
          />
        )}

        {!isPlaying && flowState === "find" && isInLobby && (
          <div style={styles.lobbyOverlay}>
            <button
              onClick={this.handleBackToMenu}
              style={styles.lobbyBackButton}
            >
              ← Back to Menu
            </button>
          </div>
        )}

        {!isPlaying && flowState === "watch" && (
          <WatchGame onBack={this.handleBackToMenu} playerName={playerName} />
        )}

        {/* Always render existing game components - they show/hide based on internal logic */}
        <BotSelection />
        <Lobby />
        <WaitMesssage />
        <Notification />
        <PlayersList />
        <GameGrid />
        {process.env.REACT_APP_ENABLE_BOT_REASONING_IN_UI === "true" && (
          <BotReasoningPanel />
        )}
      </div>
    );
  }
}

const styles: { [key: string]: React.CSSProperties } = {
  gameContainer: {
    flex: 1,
    width: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    minHeight: 0,
    background: "transparent",
  },
  lobbyOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    padding: "20px",
  },
  lobbyBackButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    padding: "12px 20px",
    background: "rgba(26, 26, 37, 0.8)",
    backdropFilter: "blur(10px)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "12px",
    color: "#a1a1aa",
    fontSize: "14px",
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 250ms ease",
  },
};

export default Game;
