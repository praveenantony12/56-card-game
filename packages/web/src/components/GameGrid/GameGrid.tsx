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
      trumpSuit,
      playerTrumpSuit,
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
    let isLastPlayer = false;
    const gameStarted =
      (droppedCards && droppedCards.length > 0) ||
      (teamACards && teamACards.length > 0) ||
      (teamBCards && teamBCards.length > 0);

    if (players && players.length > 0 && playerId) {
      isFirstPlayer = players[0] === playerId;
    }

    if (players && players.length > 0 && playerId) {
      isLastPlayer = players[players.length - 1] === playerId;
    }

    if (!canStartGame) {
      return null;
    }

    const { gameScore } = !this.store.game.gameScore
      ? { gameScore: "0" }
      : this.store.game;

    const suits = [
      { symbol: "Noes", name: "N", label: "Noes" },
      { symbol: "♥", name: "H", label: "Hearts" },
      { symbol: "♠", name: "E", label: "Spade" },
      { symbol: "♦", name: "D", label: "Diamond" },
      { symbol: "♣", name: "C", label: "Clubs" }
    ];

    return (
      <Dimmer.Dimmable dimmed={!yourTurn}>
        <Grid.Row centered={true} columns={1}>
          <Grid.Column className="cardHeight cardTable">
            <div className="cardOnTable">
              {this.renderCards(droppedCards, false, false, dropCardPlayer)}
            </div>
          </Grid.Column>
          <Grid.Column>
            <div className="myCards">
              {this.renderCards(cards, true, false)}
            </div>
          </Grid.Column>
        </Grid.Row>

        <Grid centered={true}>
          <Grid.Row centered={true} columns={5} className="biddingGrid">
            <Grid.Column textAlign="right">
              <Button.Group fluid={true}>
                {currentBet && currentBet > "27" ? (
                  <Button as="div" labelPosition="left">
                    <Label as="a" basic={true} color="red" pointing="right">
                      &nbsp; &nbsp; &nbsp; &nbsp; {currentBetPlayerId} bids {suits.find(suit => suit.name === trumpSuit)?.label || 'Noes'} &nbsp; &nbsp; &nbsp; &nbsp;
                    </Label>
                    <Button color="red">{currentBet}</Button>
                  </Button>
                ) : (
                  <Button as="div" labelPosition="left">
                    <Label as="a" basic={true} color="red" pointing="right">
                      Game starting, no bids placed yet
                    </Label>
                    <Button color="red" />
                  </Button>
                )}
              </Button.Group>
              <Button.Group fluid={true}>
                <Button
                  icon
                  color='red'
                  onClick={this.decrement.bind(this, currentBet)}
                  disabled={Number(currentBet) === 28 || gameStarted}
                >
                  <Icon name="minus" />
                </Button>
                <Button
                  icon
                  color='red'
                  onClick={this.increment.bind(this, currentBet)}
                  disabled={Number(currentBet) === 56 || gameStarted}
                >
                  <Icon name="plus" />
                </Button>
                <Button as='div' labelPosition='right'>
                  {suits.map((suit) => (
                    <Label
                      as='a'
                      basic={trumpSuit === suit.name ? false : true}
                      pointing='left'
                      key={suit.name}
                      color={trumpSuit === suit.name ? "green" : "red"}
                      onClick={() => this.handleTrumpSuitClick(suit.name)}
                      disabled={gameStarted}
                      title={suit.label}
                    >
                      {suit.symbol}
                    </Label>
                  ))}
                </Button>
              </Button.Group>
            </Grid.Column>

            <Grid.Column textAlign="left">
              <Button.Group fluid={true}>
                <Button as="div" labelPosition="left">
                  <Label as="a" basic={true} color="red" pointing="right">
                    {firstPlayer}'s Team
                  </Label>
                  <Button color="red">{0 - Number(gameScore)}</Button>
                </Button>
                <Button.Or text="VS" />
                <Button as="div" labelPosition="right">
                  <Button color="red">{0 + Number(gameScore)}</Button>
                  <Label as="a" basic={true} color="red" pointing="left">
                    {lastPlayer}'s Team
                  </Label>
                </Button>
              </Button.Group>
              <input
                type="range"
                min="-10"
                max="10"
                step="1"
                value={gameScore}
                className={
                  gameStarted || !isLastPlayer
                    ? "scoreSlider hideSlider"
                    : "scoreSlider showSlider"
                }
                id="gameScoreSlider"
                data-show-value="true"
                onChange={this.updateScore.bind(event)}
              />
            </Grid.Column>
          </Grid.Row>
        </Grid>

        <Grid centered={true}>
          <Grid.Row centered={true} columns={2}>
            <Grid.Column textAlign="center">
              <Button.Group className="teamAButtonGroup">
                <Button as="div" labelPosition="left">
                  <Label as="a" basic={true} color="black" pointing="right">
                    Team - A [{firstPlayer} {thirdPlayer} {fifthPlayer}]
                  </Label>
                  <Button color="black" className="teamAPoints">
                    0
                  </Button>
                </Button>
                <Button as="div" labelPosition="right">
                  <Label
                    as="a"
                    basic={true}
                    color="black"
                    onClick={this.clearPoints}
                    className="showCursor"
                  >
                    Reset
                  </Label>
                </Button>
              </Button.Group>
              <div className="teamCards teamACards">
                {this.renderCards(teamACards, false, true)}
              </div>
            </Grid.Column>
            <Grid.Column textAlign="center">
              <Button.Group className="teamBButtonGroup">
                <Button as="div" labelPosition="left">
                  <Label as="a" basic={true} color="black" pointing="right">
                    Team - B [{secondPlayer} {fourthPlayer} {lastPlayer}]
                  </Label>
                  <Button color="black" className="teamBPoints">
                    0
                  </Button>
                </Button>
                <Button as="div" labelPosition="right">
                  <Label
                    as="a"
                    basic={true}
                    color="black"
                    onClick={this.clearPoints}
                    className="showCursor"
                  >
                    Reset
                  </Label>
                </Button>
              </Button.Group>
              <div className="teamCards teamBCards">
                {this.renderCards(teamBCards, false, true)}
              </div>
            </Grid.Column>
          </Grid.Row>
        </Grid>

        <Grid centered={true}>
          <Grid.Row centered={true} columns={1}>
            <Button.Group>
              <Button
                color="red"
                onClick={this.handleRestartGameClick.bind(this, gameId)}
                disabled={
                  !(
                    typeof cards === "undefined" ||
                    cards.length === 0 ||
                    isFirstPlayer
                  )
                }
              >
                Restart Game
              </Button>
              <Button.Or />
              <Button
                positive={true}
                onClick={this.viewAllCards.bind(this, gameId)}
                disabled={!(typeof cards === "undefined" || cards.length === 0)}
              >
                View All Cards
              </Button>
            </Button.Group>
          </Grid.Row>
        </Grid>
      </Dimmer.Dimmable>
    );
  }

  private clearPoints = () => {
    const teamAPointsDiv: any = document.querySelectorAll(".teamAPoints");
    const teamABointsDiv: any = document.querySelectorAll(".teamBPoints");
    teamAPointsDiv[0].innerText = 0;
    teamABointsDiv[0].innerText = 0;
  };

  private updateScore = (event: any) => {
    this.store.updateGameScore(event.target.value);
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

  private handleRoundWinnerButtonClick(teamName: string) {
    if (teamName === "A") {
      this.store.deckWonByTeamA();
    } else {
      this.store.deckWonByTeamB();
    }
  }

  private handleTrumpSuitClick(suit: string) {
    this.store.selectTrumpSuit(suit);
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
    const { trumpSuit } = this.store.game;
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
      const cardType = card.slice(2) as keyof typeof POINTS;
      let weight = (POINTS[cardType] as any) || 0;
      // Add trump bonus: if card suit matches trump suit, add 10 points
      // if (trumpSuit && card[1] === trumpSuit) {
      //   weight += 10;
      // }
      return { card, weight };
    });
    const mappedTeamBCards = teamBCards.map((card) => {
      const cardType = card.slice(2) as keyof typeof POINTS;
      let weight = (POINTS[cardType] as any) || 0;
      // Add trump bonus: if card suit matches trump suit, add 10 points
      // if (trumpSuit && card[1] === trumpSuit) {
      //   weight += 10;
      // }
      return { card, weight };
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
}

export default GameGrid;
