import * as React from "react";
import Game from "../Game/Game";

import "./home.css";

class Home extends React.Component<{}, {}> {
  public render() {
    return (
      <div
        className="background"
        style={{
          minHeight: "100vh",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <div className="game-wrapper">
          <Game />
        </div>
      </div>
    );
  }
}

export default Home;
