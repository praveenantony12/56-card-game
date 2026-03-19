import * as React from "react";

import BotReasoningPanel from "../../components/BotReasoningPanel/BotReasoningPanel";
import BotSelection from "../../components/BotSelection/BotSelection";
import PlayersList from "../../components/PlayersList/PlayersList";
import VoiceControl from "../../components/VoiceControl/VoiceControl";
import WaitMesssage from "../../components/WaitMessage/WaitMesssage";
import GameGrid from "../GameGrid/GameGrid";
import Notification from "../Notification/Notification";

class Game extends React.Component<{}, {}> {
  public render() {
    return (
      <React.Fragment>
        <BotSelection />
        <WaitMesssage />
        <Notification />
        <PlayersList />
        <GameGrid />
        {process.env.REACT_APP_ENABLE_BOT_REASONING_IN_UI === "true" && (
          <BotReasoningPanel />
        )}
        {/* Floating voice-mode control — always visible during the game */}
        <VoiceControl />
      </React.Fragment>
    );
  }
}

export default Game;
