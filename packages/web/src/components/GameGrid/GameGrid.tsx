import { inject, observer } from "mobx-react";
import * as React from "react";
import { Dimmer, Grid, Label } from "semantic-ui-react";
import { IStore } from "../../stores/IStore";
import Card from "../Card/Card";
// import Draggable from "react-draggable"; // The default
// import { DraggableCore } from "react-draggable"; // <DraggableCore>
// import Draggable, { DraggableCore } from "react-draggable";

import "./game-grid.css";

interface IProps {
  store?: IStore;
}

@inject("store")
@observer
class GameGrid extends React.Component<IProps, {}> {
  private get store(): IStore {
    return this.props.store as IStore;
  }

  constructor(props: IProps) {
    super(props);
  }

  public render() {
    const {
      yourTurn,
      canStartGame,
      cards,
      droppedCards,
      players,
      teamACards,
      teamBCards
    } = this.store.game;

    const { gameId } = this.store.user;
    const firstPlayer = players && players.length > 0 ? players[0] : "";
    const secondPlayer = players && players.length > 0 ? players[1] : "";
    const thirdPlayer = players && players.length > 0 ? players[2] : "";
    const fourthPlayer = players && players.length > 0 ? players[3] : "";
    const fifthPlayer = players && players.length > 0 ? players[4] : "";
    const lastPlayer =
      players && players.length > 1 ? players[players.length - 1] : "";

    if (!canStartGame) {
      return null;
    }

    console.log("Cards ===> " + JSON.stringify(cards));
    console.log("Dropped Cards ===> " + JSON.stringify(droppedCards));
    console.log("Team A Cards ===> " + JSON.stringify(teamACards));
    console.log("Team B Cards ===> " + JSON.stringify(teamBCards));

    return (
      <Dimmer.Dimmable dimmed={!yourTurn}>
        <Grid stackable={true} id="game-grid">
          <Grid.Column width={16}>
            <h5 className="ui dividing header">Who starts next round</h5>
            {this.selectPlayerStart(players, droppedCards)}
          </Grid.Column>

          <Grid.Column width={10}>
            <h5 className="ui dividing header">Your Cards</h5>
            {this.renderCards(cards, true, false)}
          </Grid.Column>

          <Grid.Column width={6}>
            <h5 className="ui dividing header">Table</h5>
            {this.renderCards(droppedCards, false, false)}
          </Grid.Column>

          <Grid.Column width={16}>
            <h5 className="ui dividing header">Who won the current round</h5>
            {firstPlayer &&
              lastPlayer &&
              players &&
              this.renderTeamButtons(
                firstPlayer,
                lastPlayer,
                players,
                droppedCards
              )}
          </Grid.Column>

          <Grid.Column width={16}>
            <h5 className="ui dividing header">Game options</h5>
            {this.gameOptions(cards, gameId)}
          </Grid.Column>

          <Grid.Column width={8} className="teamCards">
            <h5 className="ui dividing header">
              Team - A [{firstPlayer} {thirdPlayer} {fifthPlayer}]
            </h5>
            {this.renderCards(teamACards, false, true)}
          </Grid.Column>

          <Grid.Column width={8} className="teamCards">
            <h5 className="teamCards ui dividing header">
              Team - B [{secondPlayer} {fourthPlayer} {lastPlayer}]
            </h5>
            {this.renderCards(teamBCards, false, true)}
          </Grid.Column>
          {/* <Grid.Column width={16} className="teamCards">
            <React.Fragment>
              <h5 className="ui dividing header">RESTART</h5>
              <a
                className="ui image label gameOptionsButton"
                onClick={this.handleRestartGameClick.bind(this, gameId)}
              >
                Restart Game
              </a>
            </React.Fragment>
          </Grid.Column> */}
        </Grid>
      </Dimmer.Dimmable>
    );
  }

  private handleCardClick = (card: string) => {
    const el = document.getElementById(card);
    if (el) {
      el.classList.add("disabled");
    }
    setTimeout(() => {
      this.enableCardClicks();
    }, 1000);
    this.store.dropCard(card);
  };

  private enableCardClicks = () => {
    const cards = Array.from(document.getElementsByClassName("card-clickable"));
    cards.forEach(card => card.classList.remove("disabled"));
  };

  private renderTeamButtons(
    firstPlayer: string,
    lastPlayer: string,
    players: string[],
    droppedCards?: string[]
  ) {
    return (
      <div className="btn-group">
        {typeof droppedCards === "undefined" ||
        droppedCards.length === players.length ? (
          <React.Fragment>
            <a
              className="ui image label playerSelectButton"
              onClick={this.handleRoundWinnerButtonClick.bind(this, "A")}
            >
              <Label as="a">{firstPlayer}'s Team</Label>
            </a>
            <a
              className="ui image label playerSelectButton"
              onClick={this.handleRoundWinnerButtonClick.bind(this, "B")}
            >
              <Label as="a">{lastPlayer}'s Team</Label>
            </a>
          </React.Fragment>
        ) : (
          <div>Game in progress</div>
        )}
      </div>
    );
  }

  private handleRoundWinnerButtonClick(teamName: string) {
    if (teamName === "A") {
      this.store.deckWonByTeamA();
    } else {
      this.store.deckWonByTeamB();
    }
  }

  private renderCards(
    cards?: string[],
    isClickable: boolean = false,
    flipOver: boolean = false
  ) {
    if (!cards) {
      return null;
    }

    return cards.map(card => (
      <Card
        className={isClickable ? "card-clickable" : "card"}
        id={card}
        key={card}
        card={card}
        style={{ fontSize: "17pt" }}
        disabled={!isClickable}
        onCardClick={this.handleCardClick}
        flipOver={flipOver}
      />
    ));
  }

  private handlePlayerSelectClick = (playerId: string) => {
    this.store.selectPlayer(playerId);
  };

  private selectPlayerStart(players?: string[], droppedCards?: string[]) {
    if (!players) {
      return null;
    }

    return (
      <div className="btn-group">
        {typeof droppedCards === "undefined" || droppedCards.length === 0 ? (
          players.map((player, index) => (
            <a
              color="blue"
              className="ui image label playerSelectButton"
              key={index}
              onClick={this.handlePlayerSelectClick.bind(this, player)}
            >
              <Label as="a">
                <img src="https://react.semantic-ui.com/images/avatar/small/joe.jpg" />
                {player}
              </Label>
            </a>
          ))
        ) : (
          <div>Game in progress</div>
        )}
      </div>
    );
  }

  private handleRestartGameClick = (gameId: string) => {
    this.store.restartGame(gameId);
  };

  private viewAllCards = () => {
    const teamCards = document.querySelectorAll(".flip_card");
    teamCards.forEach(teamCard => teamCard.classList.remove("flip_card"));
    const teamCardImages = document.querySelectorAll(".flip_image");
    teamCardImages.forEach(teamCardImage => {
      teamCardImage.classList.remove("flip_image");
    });
  };

  private checkAndDeletePreviousCards(cards?: string[]) {
    // const existingDeckCards = document.querySelectorAll(".ten .card-clickable");
    const existingDeckCards = [].slice.call(
      document.querySelectorAll(".ten .card-clickable")
    );
    const parentNode =
      existingDeckCards.length > 0 ? existingDeckCards[0].parentNode : null;

    // if (cards && parentNode != null) {
    //   existingDeckCards.forEach((deckCard: any, index: any) => {
    //     if (deckCard.id !== cards[index]) {
    //       try {
    //         parentNode.removeChild(deckCard);
    //         existingDeckCards.splice(index, 1);
    //       } catch (err) {
    //         console.log("Error caught while removing child node == > " + err);
    //       }
    //     }
    //   });
    // }

    if (cards && parentNode != null) {
      cards.forEach((card, index) => {
        if (card !== existingDeckCards[index].id) {
          const insideIndex = index;
          while (
            card !== existingDeckCards[insideIndex].id &&
            insideIndex < existingDeckCards.length
          ) {
            try {
              parentNode.removeChild(existingDeckCards[insideIndex]);
              existingDeckCards.splice(insideIndex, 1);
            } catch (err) {
              console.log(
                "Error caught at checkAndDeletePreviousCards == > " + err
              );
            }
          }
        }
      });
      for (let i = cards.length; i < existingDeckCards.length; i++) {
        try {
          parentNode.removeChild(existingDeckCards[i]);
        } catch (err) {
          console.log(
            "Error caught at checkAndDeletePreviousCards == > " + err
          );
        }
      }
    }
  }

  private gameOptions(cards?: string[], gameId?: string) {
    return (
      <div className="btn-group">
        {typeof cards === "undefined" ||
          (cards.length === 0 && (
            <React.Fragment>
              <a
                className="ui image label gameOptionsButton"
                onClick={this.handleRestartGameClick.bind(this, gameId)}
              >
                <Label as="a">Restart Game</Label>
              </a>
              <a
                className="ui image label gameOptionsButton"
                onClick={this.viewAllCards.bind(this, gameId)}
              >
                <Label as="a">View All Cards</Label>
              </a>
            </React.Fragment>
          ))}
        <a
          className="ui image label"
          onClick={this.checkAndDeletePreviousCards.bind(this, cards)}
        >
          <Label as="a">Refresh Cards</Label>
        </a>
      </div>
    );
  }
}

export default GameGrid;
