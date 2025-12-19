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

interface IState {
  timerRemaining: number;
  isRoundReveal: boolean;
}

@inject("store")
@observer
class GameGrid extends React.Component<IProps, IState> {
  private get store(): IStore {
    return this.props.store as IStore;
  }

  private roundInterval: any = null;
  private roundRevealStarted: boolean = false;
  private lastDropCount: number = 0;

  constructor(props: IProps) {
    super(props);
    this.state = { timerRemaining: 0, isRoundReveal: false };
  }

  componentDidUpdate(prevProps: IProps, prevState: IState) {
    const { dropCardPlayer, players } = this.store.game;
    const currentDropCount = dropCardPlayer ? dropCardPlayer.length : 0;
    const playersCount = players ? players.length : 0;

    // Debug
    // console.debug(`[GameGrid] dropCounts: last=${this.lastDropCount}, current=${currentDropCount}, players=${playersCount}, revealBlocked=${this.revealBlocked}, roundRevealStarted=${this.roundRevealStarted}, timer=${this.state.timerRemaining}`);

    // Detect start of a new round (drop count went from >0 to 0)
    if (this.lastDropCount > 0 && currentDropCount === 0) {
      this.roundRevealStarted = false;
      if (this.roundInterval) {
        clearInterval(this.roundInterval);
        this.roundInterval = null;
      }
      this.setState({ timerRemaining: 0, isRoundReveal: false });
    }

    // When all players have dropped and no reveal has started yet, start the timer
    // Start only on the transition when lastDropCount < playersCount -> currentDropCount === playersCount
    if (currentDropCount === playersCount && playersCount > 0 && !this.roundRevealStarted && this.lastDropCount < playersCount) {
      this.roundRevealStarted = true;
      // console.debug("[GameGrid] Starting reveal timer");
      this.setState({ isRoundReveal: true, timerRemaining: 5 }, () => {
        this.roundInterval = setInterval(() => {
          this.setState((s) => {
            if (s.timerRemaining <= 1) {
              if (this.roundInterval) {
                clearInterval(this.roundInterval);
                this.roundInterval = null;
              }
              // mark reveal as finished so next rounds can start their timer
              this.roundRevealStarted = false;
              // finished reveal; wait for server to clear drop list before next round
              // console.debug("[GameGrid] Reveal finished; waiting for server to clear drops");
              return { timerRemaining: 0, isRoundReveal: false };
            }
            return { timerRemaining: s.timerRemaining - 1 } as IState;
          });
        }, 1000);
      });
    }

    this.lastDropCount = currentDropCount;
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
      { symbol: "Noes", name: "N", label: "" },
      { symbol: "♥", name: "H", label: "Hearts" },
      { symbol: "♠", name: "E", label: "Spade" },
      { symbol: "♦", name: "D", label: "Diamond" },
      { symbol: "♣", name: "C", label: "Clubs" }
    ];

    const allPlayersDropped =
      dropCardPlayer && players && dropCardPlayer.length >= players.length;

    return (
      <Dimmer.Dimmable dimmed={!yourTurn}>
        <Grid.Row centered={true} columns={1}>
          <Grid.Column className="cardHeight cardTable">
            <div className="cardOnTable">
              {this.renderCards(droppedCards, false, false, dropCardPlayer)}
              {this.state.isRoundReveal && this.state.timerRemaining > 0 && (
                <div className="round-timer">{this.state.timerRemaining}</div>
              )}
            </div>
          </Grid.Column>
          <Grid.Column>
            <div className="myCards">
              {this.renderCards(cards, true, false, undefined, this.state.isRoundReveal && this.state.timerRemaining > 0)}
            </div>
          </Grid.Column>
        </Grid.Row>

        <Grid centered={true}>
          <Grid.Row centered={true} columns={1} className="biddingGrid" style={{ marginTop: "-2rem" }}>
            <Grid.Column textAlign="center" mobile={16} tablet={16} computer={16} style={{ display: "flex", alignItems: "center", flexDirection: "column" }}>
              <Button.Group fluid={true} style={{ width: "25%", display: "block" }}>
                {(() => {
                  const label = currentBet && currentBet > "27"
                    ? `${currentBetPlayerId} bids ${suits.find(suit => suit.name === (trumpSuit || "N"))?.label} ${suits.find(suit => suit.name === (trumpSuit || "N"))?.symbol}`
                    : "No bids yet";
                  const betValue = currentBet && currentBet > "27" ? currentBet : "?";

                  return (
                    <Button as="div" className="bidStatus" labelPosition="left" style={{ width: "100%" }} disabled={gameStarted}>
                      <Label as="a" basic={true} color="red" pointing="right" style={{ width: "90%", justifyContent: "center" }}>
                        {label}
                      </Label>
                      <Button color="red">{betValue}</Button>
                    </Button>
                  );
                })()}
              </Button.Group>
              <Button.Group fluid={true} style={{ width: "100%", display: "block" }}>
                <Button
                  icon
                  color='red'
                  onClick={this.decrement.bind(this, currentBet)}
                  disabled={Number(currentBet) === 28 || gameStarted}
                >
                  <Icon name="minus" />
                </Button>
                <Button as='div' labelPosition='right' disabled={gameStarted}>
                  {suits.map((suit) => (
                    <Label
                      as='a'
                      basic={trumpSuit === suit.name ? false : true}
                      pointing={suit.name === "N" ? "left" : "right"}
                      key={suit.name}
                      color={trumpSuit === suit.name ? "green" : "red"}
                      onClick={() => this.handleTrumpSuitClick(suit.name)}
                      title={suit.label}
                    >
                      {suit.label} {suit.symbol}
                    </Label>
                  ))}
                </Button>
                <Button
                  icon
                  color="red"
                  onClick={this.increment.bind(this, currentBet)}
                  disabled={Number(currentBet) === 56 || gameStarted}>
                  <Icon name="plus" />
                </Button>
              </Button.Group>

              <Button.Group fluid={true} style={{ width: "25%", display: "flex", justifyContent: "center" }}>
                <Button as="div" labelPosition="left" disabled={gameStarted}>
                  <Label as="a" basic={true} color="red" pointing="right" style={{ width: "90%", justifyContent: "center" }}>
                    {firstPlayer}'s Team
                  </Label>
                  <Button color="red">{0 - Number(gameScore)}</Button>
                </Button>
                <Button.Or text="VS" />
                <Button as="div" labelPosition="right" disabled={gameStarted}>
                  <Button color="red">{0 + Number(gameScore)}</Button>
                  <Label as="a" basic={true} color="red" pointing="left" style={{ width: "90%", justifyContent: "center" }}>
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
                color="red"
                onClick={this.viewAllCards.bind(this, gameId)}
                disabled={!(typeof cards === "undefined" || cards.length === 0)}
              >
                View All Cards
              </Button>
            </Button.Group>
          </Grid.Row>
        </Grid>
      </Dimmer.Dimmable >
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
    dropCardPlayer?: string[],
    disableAllCards: boolean = false
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
        disabled={!isClickable || disableAllCards}
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
