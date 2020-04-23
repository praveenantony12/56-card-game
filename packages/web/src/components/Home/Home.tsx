import * as React from "react";
import Footer from "../../components/Footer/Footer";
import Header from "../../components/Header/Header";
import Game from "../Game/Game";

import "./home.css";

class Home extends React.Component<{}, {}> {
  public render() {
    return (
      <React.Fragment>
        <Header />
        <div className="container">
          <Game />
        </div>
        <Footer />
      </React.Fragment>
    );
  }
}

export default Home;
