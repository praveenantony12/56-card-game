import * as React from "react";

import BotSelection from "../../components/BotSelection/BotSelection";
import PlayersList from "../../components/PlayersList/PlayersList";
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
      </React.Fragment>
    );
  }
}

export default Game;
