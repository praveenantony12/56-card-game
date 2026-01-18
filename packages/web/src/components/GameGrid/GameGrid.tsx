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
  currentBiddingValue: number;
  currentBiddingsuit: string;
  biddingHistory: Array<{ suit: string; value: number }>;
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
  private lastBidHistoryLength: number = 0;

  constructor(props: IProps) {
    super(props);
    this.state = {
      timerRemaining: 0,
      isRoundReveal: false,
      currentBiddingValue: 28,
      currentBiddingsuit: "",
      biddingHistory: [],
    };
  }

  componentDidUpdate(prevProps: IProps, prevState: IState) {
    const {
      dropCardPlayer,
      players,
      bidHistory,
      isBiddingPhase,
      currentBiddingPlayerId,
    } = this.store.game;
    const { playerId } = this.store.user;
    const currentDropCount = dropCardPlayer ? dropCardPlayer.length : 0;
    const playersCount = players ? players.length : 0;
    const currentBidHistoryLength = bidHistory ? bidHistory.length : 0;

    // Debug
    // console.debug(`[GameGrid] dropCounts: last=${this.lastDropCount}, current=${currentDropCount}, players=${playersCount}, revealBlocked=${this.revealBlocked}, roundRevealStarted=${this.roundRevealStarted}, timer=${this.state.timerRemaining}`);

    // Detect start of a new game - when bidHistory is reset to empty (new game started)
    // Only reset if it's NOT currently this player's turn to avoid interfering with active bidding
    const isMyBiddingTurn =
      isBiddingPhase && currentBiddingPlayerId === playerId;
    if (
      this.lastBidHistoryLength > 0 &&
      currentBidHistoryLength === 0 &&
      !isMyBiddingTurn
    ) {
      // Reset local bidding state for new game
      this.setState({
        currentBiddingValue: 28,
        currentBiddingsuit: "",
        biddingHistory: [],
      } as any);
    }

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
    if (
      currentDropCount === playersCount &&
      playersCount > 0 &&
      !this.roundRevealStarted &&
      this.lastDropCount < playersCount
    ) {
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
    this.lastBidHistoryLength = currentBidHistoryLength;
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
      isGameComplete,
      winnerMessage,
      gameCompleteData,
      finalBid,
      biddingTeam,
      biddingPlayer,
      teamAScore,
      teamBScore,
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
      { symbol: "♣", name: "C", label: "Clubs" },
    ];

    return (
      <Dimmer.Dimmable dimmed={!yourTurn}>
        <Grid.Row centered={true} columns={1}>
          <Grid.Column className="cardHeight cardTable">
            <div className="cardOnTable">
              {this.renderCards(droppedCards, false, false, dropCardPlayer)}
              {this.state.isRoundReveal && this.state.timerRemaining > 0 && (
                <div className="round-timer">{this.state.timerRemaining}</div>
              )}
              {isGameComplete && winnerMessage && (
                <div
                  className="game-winner-message"
                  style={{
                    position: "absolute",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    backgroundColor: "rgb(0,0,0,0.8)",
                    color: "white",
                    padding: "20px",
                    borderRadius: "10px",
                    fontSize: "18px",
                    fontWeight: "bold",
                    textAlign: "center",
                    zIndex: 1000,
                    maxWidth: "400px",
                  }}
                >
                  <div>{winnerMessage}</div>
                  {gameCompleteData && (
                    <div
                      style={{
                        marginTop: "10px",
                        fontSize: "14px",
                        fontWeight: "normal",
                      }}
                    >
                      <div>Final Bid: {finalBid}</div>
                      <div>Team A Points: {gameCompleteData.teamAPoints}</div>
                      <div>Team B Points: {gameCompleteData.teamBPoints}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Grid.Column>
          <Grid.Column>
            <div className="myCards">
              {this.renderCards(
                cards,
                true,
                false,
                undefined,
                this.state.isRoundReveal && this.state.timerRemaining > 0
              )}
            </div>
          </Grid.Column>
        </Grid.Row>

        <Grid centered={true}>
          <Grid.Row
            centered={true}
            columns={1}
            className="biddingGrid"
            style={{ marginTop: "-2rem" }}
          >
            <Grid.Column
              textAlign="center"
              mobile={16}
              tablet={16}
              computer={16}
              style={{
                display: "flex",
                alignItems: "center",
                flexDirection: "column",
              }}
            >
              {(() => {
                const { isBiddingPhase, currentBiddingPlayerId } =
                  this.store.game;
                const { playerId } = this.store.user;
                const isYourBiddingTurn =
                  isBiddingPhase && currentBiddingPlayerId === playerId
                    ? true
                    : false;

                if (isBiddingPhase) {
                  return this.renderBiddingUI(isYourBiddingTurn);
                } else {
                  return this.renderNormalGameUI();
                }
              })()}

              <Button.Group
                fluid={true}
                style={{
                  width: "25%",
                  display: "flex",
                  justifyContent: "center",
                }}
              >
                <Button as="div" labelPosition="left" disabled={gameStarted}>
                  <Label
                    as="a"
                    basic={true}
                    color="red"
                    pointing="right"
                    style={{ width: "90%", justifyContent: "center" }}
                  >
                    {firstPlayer}'s Team
                  </Label>
                  <Button color="red">
                    {teamAScore !== undefined
                      ? teamAScore
                      : 10 - Number(gameScore)}
                  </Button>
                </Button>
                <Button.Or text="VS" />
                <Button as="div" labelPosition="right" disabled={gameStarted}>
                  <Button color="red">
                    {teamBScore !== undefined
                      ? teamBScore
                      : 10 - Number(gameScore)}
                  </Button>
                  <Label
                    as="a"
                    basic={true}
                    color="red"
                    pointing="left"
                    style={{ width: "90%", justifyContent: "center" }}
                  >
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
                  <Button
                    color={
                      isGameComplete && biddingTeam === "A"
                        ? gameCompleteData?.biddingTeamAchievedBid
                          ? "green"
                          : "red"
                        : "black"
                    }
                    className="teamAPoints"
                  >
                    {gameCompleteData ? gameCompleteData.teamAPoints : 0}
                  </Button>
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
                  <Button
                    color={
                      isGameComplete && biddingTeam === "B"
                        ? gameCompleteData?.biddingTeamAchievedBid
                          ? "green"
                          : "red"
                        : "black"
                    }
                    className="teamBPoints"
                  >
                    {gameCompleteData ? gameCompleteData.teamBPoints : 0}
                  </Button>
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
                color="orange"
                onClick={this.handleForfeitGameClick.bind(this, gameId)}
                disabled={typeof cards === "undefined" || cards.length === 0}
              >
                Forfeit Game
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
      </Dimmer.Dimmable>
    );
  }

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

  private handleTrumpSuitClick(suit: string) {
    this.store.selectTrumpSuit(suit);
  }

  private renderBiddingUI(isYourBiddingTurn: boolean) {
    const suits = [
      { symbol: "Noes", name: "N", label: "" },
      { symbol: "♥", name: "H", label: "Hearts" },
      { symbol: "♠", name: "E", label: "Spade" },
      { symbol: "♦", name: "D", label: "Diamond" },
      { symbol: "♣", name: "C", label: "Clubs" },
    ];

    const {
      currentBiddingPlayerId,
      bidHistory,
      bidDouble,
      bidReDouble,
      currentBet,
      trumpSuit,
    } = this.store.game;
    const { currentBiddingValue, currentBiddingsuit } = this.state;

    // Determine current bid from history
    let lastBidValue = 28;
    let lastBidsuit = "N";
    let lastBiddingPlayer = "";
    let hasActualBid = false;

    if (bidHistory && bidHistory.length > 0) {
      for (let i = bidHistory.length - 1; i >= 0; i--) {
        const entry = bidHistory[i];
        if (entry.action === "bid") {
          lastBidValue = entry.bidValue || 28;
          lastBidsuit = entry.suit || "N";
          lastBiddingPlayer = entry.playerId || "";
          hasActualBid = true;
          break;
        }
      }
    }

    const currentSuitInfo = suits.find((s) => s.name === currentBiddingsuit);
    const lastSuitInfo = suits.find((s) => s.name === lastBidsuit);
    const displayedSuitInfo = suits.find(
      (s) => s.name === (currentBiddingsuit || lastBidsuit)
    );

    // Only show bid value if player has made selections, otherwise empty
    const hasPlayerMadeSelections = this.state.biddingHistory.length > 0;

    return (
      <>
        {/* Show current bid with player name and any double/re-double status */}
        <Button.Group
          fluid={true}
          style={{ width: "100%", display: "block", marginBottom: "10px" }}
        >
          <Label
            as="a"
            basic={true}
            color="blue"
            pointing="right"
            style={{ width: "100%", justifyContent: "center" }}
          >
            {hasActualBid
              ? `${lastBiddingPlayer} bids: ${lastBidValue} ${
                  lastSuitInfo?.name === "N"
                    ? "Noes"
                    : `${lastSuitInfo?.label} ${lastSuitInfo?.symbol}`
                }`
              : "No Bids Yet"}
            {bidDouble && " (Double)"}
            {bidReDouble && " (Re-Double)"}
          </Label>
        </Button.Group>

        {isYourBiddingTurn && (
          <>
            {/* Suit Selection */}
            <Button.Group
              fluid={true}
              style={{ width: "100%", display: "block", marginBottom: "10px" }}
            >
              {suits.map((suit) => (
                <Label
                  as="a"
                  basic={currentBiddingsuit === suit.name ? false : true}
                  key={suit.name}
                  color={currentBiddingsuit === suit.name ? "green" : "red"}
                  onClick={() =>
                    this.handleBiddingSuitClick(
                      suit.name,
                      lastBidValue,
                      lastBidsuit,
                      hasActualBid
                    )
                  }
                  title={suit.label}
                  style={{
                    cursor: "pointer",
                    padding: "8px 12px",
                    margin: "2px",
                  }}
                >
                  {suit.label} {suit.symbol}
                </Label>
              ))}
            </Button.Group>

            {/* Bid Value Display */}
            <Button.Group
              fluid={true}
              style={{
                width: "100%",
                display: "flex",
                justifyContent: "center",
                marginBottom: "10px",
              }}
            >
              <Button disabled color="blue">
                Your Bid:{" "}
                {hasPlayerMadeSelections
                  ? `${currentBiddingValue} ${
                      displayedSuitInfo?.name === "N"
                        ? "Noes"
                        : `${displayedSuitInfo?.label} ${displayedSuitInfo?.symbol}`
                    }`
                  : "Not selected"}
              </Button>
            </Button.Group>

            {/* Action Buttons */}
            <Button.Group
              fluid={true}
              style={{ width: "100%", display: "block", marginBottom: "10px" }}
            >
              <Button
                color="yellow"
                onClick={this.handleBiddingUndo.bind(
                  this,
                  lastBidValue,
                  lastBidsuit
                )}
                disabled={this.state.biddingHistory.length === 0}
              >
                <Icon name="undo" /> Undo
              </Button>
              <Button
                color="green"
                onClick={this.handleBiddingDone.bind(this)}
                disabled={!hasPlayerMadeSelections}
              >
                <Icon name="arrow alternate circle right outline" /> Bid
              </Button>
              <Button color="red" onClick={this.handleBiddingPass.bind(this)}>
                <Icon name="hand paper outline" /> Pass
              </Button>
              {hasActualBid &&
                lastBidValue > 0 &&
                !bidDouble &&
                !bidReDouble && (
                  <Button
                    color="yellow"
                    onClick={this.handleBiddingDouble.bind(this)}
                  >
                    <Icon name="bolt" /> Double
                  </Button>
                )}
              {bidDouble && !bidReDouble && (
                <Button
                  color="violet"
                  onClick={this.handleBiddingReDouble.bind(this)}
                >
                  <Icon name="chess king" /> Re-Double
                </Button>
              )}
            </Button.Group>
          </>
        )}
      </>
    );
  }

  private renderNormalGameUI() {
    const {
      currentBet,
      currentBetPlayerId,
      trumpSuit,
      finalBid,
      biddingTeam,
      biddingPlayer,
      gameScore,
      bidDouble,
      bidReDouble,
    } = this.store.game;
    const { players } = this.store.game;
    const firstPlayer = players && players.length > 0 ? players[0] : "";
    const secondPlayer = players && players.length > 1 ? players[1] : "";
    const thirdPlayer = players && players.length > 2 ? players[2] : "";
    const fourthPlayer = players && players.length > 3 ? players[3] : "";
    const fifthPlayer = players && players.length > 4 ? players[4] : "";
    const lastPlayer =
      players && players.length > 0 ? players[players.length - 1] : "";

    const suits = [
      { symbol: "Noes", name: "N", label: "" },
      { symbol: "♥", name: "H", label: "Hearts" },
      { symbol: "♠", name: "E", label: "Spade" },
      { symbol: "♦", name: "D", label: "Diamond" },
      { symbol: "♣", name: "C", label: "Clubs" },
    ];

    // Check for active bid or fallback to final bid
    const hasCurrentBid =
      currentBet && parseInt(currentBet) >= 28 && currentBetPlayerId;
    const hasFinalBid = !hasCurrentBid && finalBid && finalBid >= 28;

    // Try to get player name from various sources
    let playerName = "";
    if (hasCurrentBid) {
      playerName = currentBetPlayerId;
    } else if (hasFinalBid) {
      if (biddingPlayer) {
        playerName = biddingPlayer;
      } else if (biddingTeam) {
        // Fallback to first player in bidding team
        const teamPlayers =
          biddingTeam === "A"
            ? [firstPlayer, thirdPlayer, fifthPlayer]
            : [secondPlayer, fourthPlayer, lastPlayer];
        playerName = teamPlayers[0] || "";
      }
    }

    const bidValue = hasCurrentBid
      ? currentBet
      : hasFinalBid
      ? finalBid.toString()
      : "?";
    const suitInfo = suits.find((s) => s.name === (trumpSuit || "N"));

    // Handle suit display - for Noes, just show "Noes", for others show "label symbol"
    let suitDisplay = "";
    if (suitInfo) {
      if (suitInfo.name === "N") {
        suitDisplay = "Noes";
      } else {
        suitDisplay = `${suitInfo.label} ${suitInfo.symbol}`;
      }
    }

    const label =
      (hasCurrentBid || hasFinalBid) && playerName
        ? `${playerName}'s bid: ${bidValue} ${suitDisplay}${
            bidDouble ? " (Double)" : ""
          }${bidReDouble ? " (Re-Double)" : ""}`
        : "Game Starting...";

    return (
      <Button.Group
        fluid={true}
        style={{ width: "100%", display: "block", marginBottom: "10px" }}
      >
        <Label
          as="a"
          basic={true}
          color="blue"
          pointing="right"
          style={{ width: "100%", justifyContent: "center" }}
        >
          {label}
        </Label>
      </Button.Group>
    );
  }

  private handleBiddingSuitClick = (
    suit: string,
    lastBidValue: number,
    lastBidsuit: string,
    hasActualBid: boolean
  ) => {
    this.setState(
      (prevState) => {
        let newValue;

        // If no suit has been selected yet by this player (first selection)
        if (prevState.currentBiddingsuit === "") {
          // If there's already a bid in history (even 28 Noes from a pass), increment from it
          // Otherwise, start at 28 (very first player, no bids yet)
          newValue = hasActualBid ? lastBidValue + 1 : 28;
        } else if (prevState.currentBiddingsuit !== suit) {
          // Switching to a different suit, increment from last bid
          newValue = lastBidValue + 1;
        } else {
          // Continuing same suit, increment further
          newValue = prevState.currentBiddingValue + 1;
        }

        // Cap at 56
        newValue = Math.min(newValue, 56);

        return {
          currentBiddingsuit: suit,
          currentBiddingValue: newValue,
        } as any;
      },
      () => {
        // Save to history
        this.setState(
          (prevState) =>
            ({
              biddingHistory: [
                ...prevState.biddingHistory,
                {
                  suit: suit,
                  value: this.state.currentBiddingValue,
                },
              ],
            } as any)
        );
      }
    );
  };

  private handleBiddingUndo = (lastBidValue: number, lastBidsuit: string) => {
    if (this.state.biddingHistory.length === 0) {
      return;
    }

    const newHistory = [...this.state.biddingHistory];
    newHistory.pop();

    // Restore to previous state
    if (newHistory.length > 0) {
      const lastEntry = newHistory[newHistory.length - 1];
      this.setState({
        biddingHistory: newHistory,
        currentBiddingValue: lastEntry.value,
        currentBiddingsuit: lastEntry.suit,
      } as any);
    } else {
      // Reset to no selection
      this.setState({
        biddingHistory: newHistory,
        currentBiddingValue: 28,
        currentBiddingsuit: "", // No suit selected
      } as any);
    }
  };

  private handleBiddingDone = () => {
    const { currentBiddingValue, currentBiddingsuit } = this.state;
    this.store.biddingAction("bid", currentBiddingValue, currentBiddingsuit);
    // Reset local bidding state
    this.setState({
      currentBiddingValue: 28,
      currentBiddingsuit: "",
      biddingHistory: [],
    } as any);
  };

  private handleBiddingPass = () => {
    // Check if there's any bid in the global bidding history
    const { bidHistory } = this.store.game;
    let hasAnyBid = false;

    if (bidHistory && bidHistory.length > 0) {
      for (let i = bidHistory.length - 1; i >= 0; i--) {
        const entry = bidHistory[i];
        if (entry.action === "bid") {
          hasAnyBid = true;
          break;
        }
      }
    }

    // Only default to 28 Noes if NO ONE has bid yet (very first player of the game)
    if (
      !hasAnyBid &&
      this.state.currentBiddingsuit === "" &&
      this.state.biddingHistory.length === 0
    ) {
      this.store.biddingAction("bid", 28, "N");
    } else {
      this.store.biddingAction("pass");
    }
    // Reset local bidding state
    this.setState({
      currentBiddingValue: 28,
      currentBiddingsuit: "",
      biddingHistory: [],
    } as any);
  };

  private handleBiddingDouble = () => {
    this.store.biddingAction("double");
    // Reset local bidding state
    this.setState({
      currentBiddingValue: 28,
      currentBiddingsuit: "",
      biddingHistory: [],
    } as any);
  };

  private handleBiddingReDouble = () => {
    this.store.biddingAction("re-double");
    // Reset local bidding state
    this.setState({
      currentBiddingValue: 28,
      currentBiddingsuit: "",
      biddingHistory: [],
    } as any);
  };

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
    this.store.restartGame(gameId);
  };

  private handleForfeitGameClick = (gameId: string) => {
    this.store.forfeitGame(gameId);
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
