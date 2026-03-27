import * as React from "react";

import BotReasoningPanel from "../../components/BotReasoningPanel/BotReasoningPanel";
import BotSelection from "../../components/BotSelection/BotSelection";
import Lobby from "../../components/Lobby/Lobby";
import PlayersList from "../../components/PlayersList/PlayersList";
import WaitMesssage from "../../components/WaitMessage/WaitMesssage";
import GameGrid from "../GameGrid/GameGrid";
import Notification from "../Notification/Notification";

class Game extends React.Component<{}, {}> {
  public render() {
    return (
      <React.Fragment>
        <BotSelection />
        <Lobby />
        <WaitMesssage />
        <Notification />
        <PlayersList />
        <GameGrid />
        {process.env.REACT_APP_ENABLE_BOT_REASONING_IN_UI === "true" && (
          <BotReasoningPanel />
        )}
      </React.Fragment>
    );
  }
}

export default Game;
