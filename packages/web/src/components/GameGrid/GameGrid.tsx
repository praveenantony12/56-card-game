import { inject, observer } from "mobx-react";
import * as React from "react";
import { Button, Dimmer, Grid, Icon, Label } from "semantic-ui-react";
import POINTS from "../../constants/points";
import { IStore } from "../../stores/IStore";
import Card from "../Card/Card";
// import POINTS from "../../constants/Points";

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
      teamBCards,
      currentBet,
      currentBetPlayerId,
      dropCardPlayer,
    } = this.store.game;

    const { gameId, playerId } = this.store.user;
    const firstPlayer = players && players.length > 0 ? players[0] : "";
    const secondPlayer = players && players.length > 1 ? players[1] : "";
    const thirdPlayer = players && players.length > 2 ? players[2] : "";
    const fourthPlayer = players && players.length > 3 ? players[3] : "";
    const fifthPlayer = players && players.length > 4 ? players[4] : "";
    const lastPlayer =
      players && players.length > 0 ? players[players.length - 1] : "";
    let isFirstPlayer = false;

    if (players && players.length > 0 && playerId) {
      isFirstPlayer = players[0] === playerId;
    }

    if (!canStartGame) {
      return null;
    }

    return (
      <Dimmer.Dimmable dimmed={!yourTurn}>
        <Grid stackable={true} id="game-grid">
          <Grid.Column width={4}>
            <h5 className="ui dividing header">Bidding</h5>
            {this.playerBidding(
              currentBet,
              currentBetPlayerId,
              droppedCards,
              teamACards,
              teamBCards
            )}
          </Grid.Column>

          <Grid.Column width={12}>
            <h5 className="ui dividing header">Who starts next round</h5>
            {this.selectPlayerStart(players, droppedCards)}
          </Grid.Column>

          <Grid.Column width={16}>
            <h5 className="ui dividing header">Your Cards</h5>
            {/* <Dimmer active={!yourTurn} inverted={true} className="myCards">
              <Loader>Wait!</Loader>
            </Dimmer> */}
            {this.renderCards(cards, true, false)}
          </Grid.Column>

          <Grid.Column width={10} className="cardHeight">
            <h5 className="ui dividing header">Table</h5>
            {this.renderCards(droppedCards, false, false, dropCardPlayer)}
          </Grid.Column>

          <Grid.Column width={6}>
            <h5 className="ui dividing header">Who won the current round</h5>
            {firstPlayer &&
              players &&
              this.renderTeamButtons(
                firstPlayer,
                lastPlayer,
                players,
                droppedCards
              )}
          </Grid.Column>

          <Grid.Column width={8} className="teamCards teamACards cardHeight">
            <h5 className="ui dividing header">
              Team - A [{firstPlayer} {thirdPlayer} {fifthPlayer}]
              <Label className="teamAPoints">0</Label>
              <Label>
                <Button
                  onClick={this.clearPoints}
                  animated="fade"
                  className="clearButton"
                >
                  <Button.Content visible={true}>Reset</Button.Content>
                  <Button.Content hidden={true}>
                    <Icon name="refresh" />
                  </Button.Content>
                </Button>
              </Label>
            </h5>
            {this.renderCards(teamACards, false, true)}
          </Grid.Column>

          <Grid.Column width={8} className="teamCards  teamBCards cardHeight">
            <h5 className="teamCards ui dividing header">
              Team - B [{secondPlayer} {fourthPlayer} {lastPlayer}]
              <Label className="teamBPoints">0</Label>
              <Label>
                <Button
                  onClick={this.clearPoints}
                  animated="fade"
                  className="clearButton"
                >
                  <Button.Content visible={true}>Reset</Button.Content>
                  <Button.Content hidden={true}>
                    <Icon name="refresh" />
                  </Button.Content>
                </Button>
              </Label>
            </h5>
            {this.renderCards(teamBCards, false, true)}
          </Grid.Column>
        </Grid>

        <Grid.Column width={16}>
          <h5 className="ui dividing header">Game options</h5>
          {this.gameOptions(cards, gameId, isFirstPlayer)}
        </Grid.Column>
      </Dimmer.Dimmable>
    );
  }

  private clearPoints = () => {
    const teamAPointsDiv: any = document.querySelectorAll(".teamAPoints");
    const teamABointsDiv: any = document.querySelectorAll(".teamBPoints");
    teamAPointsDiv[0].innerText = 0;
    teamABointsDiv[0].innerText = 0;
  };

  private playerBidding = (
    currentBet?: string,
    currentBetPlayerId?: string,
    droppedCards?: string[],
    teamACards?: string[],
    teamBCards?: string[]
  ) => {
    const gameStarted =
      (droppedCards && droppedCards.length > 0) ||
      (teamACards && teamACards.length > 0) ||
      (teamBCards && teamBCards.length > 0);
    return (
      <div className="btn-group">
        <Button
          icon={true}
          className="plusminusButtons"
          onClick={this.decrement.bind(this, currentBet)}
          disabled={Number(currentBet) === 28 || gameStarted}
        >
          <Icon name="minus square outline" />
        </Button>
        {currentBet && currentBet > "27" ? (
          <Label className={gameStarted ? "bidFinal" : "bidInProgress"}>
            {currentBetPlayerId} bids {currentBet}
          </Label>
        ) : (
          <Label>No bids yet</Label>
        )}
        <Button
          icon={true}
          className="plusminusButtons"
          onClick={this.increment.bind(this, currentBet)}
          disabled={Number(currentBet) === 56 || gameStarted}
        >
          <Icon name="plus square outline" />
        </Button>
      </div>
    );
  };

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

  private increment = (bet: string) => {
    const currentBet = bet && Number(bet) < 56 ? Number(bet) + 1 : "28";
    this.store.incrementBetByPlayer(currentBet.toString());
  };

  private decrement = (bet: string) => {
    const currentBet = bet && Number(bet) > 29 ? Number(bet) - 1 : "28";
    this.store.incrementBetByPlayer(currentBet.toString());
  };

  private enableCardClicks = () => {
    const cards = Array.from(document.getElementsByClassName("card-clickable"));
    cards.forEach((card) => card.classList.remove("disabled"));
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
        !(droppedCards.length < players.length) ? (
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

  private addNameToCardOnTable = (card: string, dropCardPlayer: string[]) => {
    const playerCardCombo = dropCardPlayer.find(
      (element) => element.indexOf(card) > -1
    );
    if (playerCardCombo && playerCardCombo.split("-").length > 1) {
      return playerCardCombo.split("-")[1];
    } else {
      return "";
    }
  };

  private renderCards(
    cards?: string[],
    isClickable: boolean = false,
    flipOver: boolean = false,
    dropCardPlayer?: string[]
  ) {
    if (!cards) {
      return null;
    }

    return cards.map((card) => (
      <Card
        className={isClickable ? "card-clickable" : "card"}
        id={card}
        key={card}
        card={card}
        playerName={
          dropCardPlayer ? this.addNameToCardOnTable(card, dropCardPlayer) : ""
        }
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
    const teamAPointsDiv: any = document.querySelectorAll(".teamAPoints");
    const teamABointsDiv: any = document.querySelectorAll(".teamBPoints");
    teamAPointsDiv[0].innerText = "0";
    teamABointsDiv[0].innerText = "0";
    this.store.restartGame(gameId);
  };

  private viewAllCards = () => {
    const teamCards = document.querySelectorAll(".flip_card");
    teamCards.forEach((teamCard) => teamCard.classList.remove("flip_card"));
    const teamCardImages = document.querySelectorAll(".flip_image");
    teamCardImages.forEach((teamCardImage) => {
      teamCardImage.classList.remove("flip_image");
    });
    this.calculatePoints();
  };

  private calculatePoints = () => {
    const teamACardsDiv: any = document.querySelectorAll(".teamACards .card");
    const teamBCardsDiv: any = document.querySelectorAll(".teamBCards .card");
    const teamACards = [];
    const teamBCards = [];
    for (const card of teamACardsDiv) {
      teamACards.push(card.id);
    }
    for (const card of teamBCardsDiv) {
      teamBCards.push(card.id);
    }

    const mappedTeamACards = teamACards.map((card) => {
      return { card, weight: POINTS[card.slice(2)] };
    });
    const mappedTeamBCards = teamBCards.map((card) => {
      return { card, weight: POINTS[card.slice(2)] };
    });
    const totalTeamAPoints = mappedTeamACards.reduce(
      /* tslint:disable:no-string-literal */
      (a, b) => a + (b["weight"] || 0),
      0
      /* tslint:disable:no-string-literal */
    );
    const totalTeamBPoints = mappedTeamBCards.reduce(
      /* tslint:disable:no-string-literal */
      (a, b) => a + (b["weight"] || 0),
      0
      /* tslint:disable:no-string-literal */
    );

    const teamAPointsDiv: any = document.querySelectorAll(".teamAPoints");
    const teamABointsDiv: any = document.querySelectorAll(".teamBPoints");
    teamAPointsDiv[0].innerText = totalTeamAPoints;
    teamABointsDiv[0].innerText = totalTeamBPoints;
  };

  private gameOptions(
    cards?: string[],
    gameId?: string,
    isFirstPlayer?: boolean
  ) {
    const isCardsEmpty = typeof cards === "undefined" || cards.length === 0;
    const showRestartButton = isCardsEmpty || isFirstPlayer;
    return (
      <div className="btn-group">
        {showRestartButton && (
          <a
            className="ui image label gameOptionsButton"
            onClick={this.handleRestartGameClick.bind(this, gameId)}
          >
            <Label as="a">Restart Game</Label>
          </a>
        )}
        {isCardsEmpty && (
          <a
            className="ui image label gameOptionsButton"
            onClick={this.viewAllCards.bind(this, gameId)}
          >
            <Label as="a">View All Cards</Label>
          </a>
        )}
      </div>
    );
  }
}

export default GameGrid;
