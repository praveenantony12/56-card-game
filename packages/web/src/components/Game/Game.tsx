import * as React from "react";

import BotReasoningPanel from "../../components/BotReasoningPanel/BotReasoningPanel";
import BotSelection from "../../components/BotSelection/BotSelection";
import PlayersList from "../../components/PlayersList/PlayersList";
import WaitMesssage from "../../components/WaitMessage/WaitMesssage";
import GameGrid from "../GameGrid/GameGrid";
import Notification from "../Notification/Notification";

const BOT_REASONING_ENABLED = process.env.ENABLE_BOT_REASONING_IN_UI === "true";

class Game extends React.Component<{}, {}> {
  public render() {
    return (
      <React.Fragment>
        <BotSelection />
        <WaitMesssage />
        <Notification />
        <PlayersList />
        <GameGrid />
        {BOT_REASONING_ENABLED && <BotReasoningPanel />}
      </React.Fragment>
    );
  }
}

export default Game;
