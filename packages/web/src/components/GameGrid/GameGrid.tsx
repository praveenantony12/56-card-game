import { inject, observer } from "mobx-react";
import * as React from "react";
import { Button, Dimmer, Grid, Icon, Label } from "semantic-ui-react";
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
  isRestarting: boolean;
  restartLockedUntilFirstCard: boolean;
  currentBiddingValue: number;
  currentBiddingsuit: string;
  biddingHistory: Array<{ suit: string; value: number }>;
  bidSelectionType: "direct" | "modifier" | null;
  bidModifier: number;
  clickOrder: "bidFirst" | "suitFirst" | null; // Track which was clicked first
  noTrumpType: "Noes" | "Pass" | "No-Trump" | null;
  isProcessingAction: boolean; // Prevent double-click and rapid actions
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
      isRestarting: false,
      restartLockedUntilFirstCard: true,
      currentBiddingValue: 0,
      currentBiddingsuit: "",
      biddingHistory: [],
      bidSelectionType: null,
      bidModifier: 0,
      clickOrder: null,
      noTrumpType: null,
      isProcessingAction: false,
    };
  }

  componentDidUpdate(prevProps: IProps, prevState: IState) {
    const {
      droppedCards,
      players,
      bidHistory,
      isBiddingPhase,
      currentBiddingPlayerId,
    } = this.store.game;
    const { playerId } = this.store.user;
    const currentDropCount = droppedCards ? droppedCards.length : 0;
    const playersCount = players ? players.length : 0;
    const currentBidHistoryLength = bidHistory ? bidHistory.length : 0;
    const firstCardPlayed = currentDropCount > 0;

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
        currentBiddingValue: 0,
        currentBiddingsuit: "",
        biddingHistory: [],
        bidSelectionType: null,
        bidModifier: 0,
        clickOrder: null,
        noTrumpType: null,
      } as any);
    }

    if (
      this.lastBidHistoryLength > 0 &&
      currentBidHistoryLength === 0 &&
      !this.state.restartLockedUntilFirstCard
    ) {
      this.setState({ restartLockedUntilFirstCard: true });
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

    if (
      this.state.restartLockedUntilFirstCard &&
      !isBiddingPhase &&
      firstCardPlayed
    ) {
      this.setState({ restartLockedUntilFirstCard: false });
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
      dropCardPlayer,
      isGameComplete,
      winnerMessage,
      gameCompleteData,
      finalBid,
      biddingTeam,
      teamAScore,
      teamBScore,
    } = this.store.game;

    const { gameId, playerId, isSpectator } = this.store.user;
    const firstPlayer = players && players.length > 0 ? players[0] : "";
    const secondPlayer = players && players.length > 1 ? players[1] : "";
    const thirdPlayer = players && players.length > 2 ? players[2] : "";
    const fourthPlayer = players && players.length > 3 ? players[3] : "";
    const fifthPlayer = players && players.length > 4 ? players[4] : "";
    const lastPlayer =
      players && players.length > 0 ? players[players.length - 1] : "";
    let isFirstPlayer = false;
    const gameStarted =
      (droppedCards && droppedCards.length > 0) ||
      (teamACards && teamACards.length > 0) ||
      (teamBCards && teamBCards.length > 0);

    if (players && players.length > 0 && playerId) {
      isFirstPlayer = players[0] === playerId;
    }

    if (!canStartGame) {
      return null;
    }

    const gameScore = this.store.game.gameScore || "0";

    const { isBiddingPhase, currentBiddingPlayerId } = this.store.game;

    const isYourBiddingTurn =
      isBiddingPhase && currentBiddingPlayerId === playerId;

    // Spectator mode: render the read-only view
    if (isSpectator) {
      return this.renderSpectatorView({
        gameScore,
        firstPlayer,
        secondPlayer,
        thirdPlayer,
        fourthPlayer,
        fifthPlayer,
        lastPlayer,
        droppedCards,
        teamACards,
        teamBCards,
        dropCardPlayer,
        isGameComplete,
        winnerMessage,
        gameCompleteData,
        finalBid,
        biddingTeam,
        teamAScore,
        teamBScore,
        isBiddingPhase,
      });
    }

    return (
      <Dimmer.Dimmable dimmed={!yourTurn}>
        <Grid.Row centered={true} columns={1}>
          <Grid.Column className="cardHeight cardTable">
            <div className="cardOnTable">
              {/* Show post-raise UI in center if in post-raise round */}
              {(() => {
                const { postRaiseDoubleRound } = this.store.game;
                if (postRaiseDoubleRound && isBiddingPhase) {
                  return this.renderPostRaiseButtonsInCenter();
                }
                return null;
              })()}
              <Button.Group
                className="handleBiddingPass"
                style={{
                  display:
                    this.state.currentBiddingsuit !== "" ||
                      gameStarted ||
                      !isYourBiddingTurn ||
                      this.store.game.postRaiseDoubleRound ||
                      this.store.game.bidRaisePhase
                      ? "none"
                      : "block",
                }}
                onClick={this.handleBiddingPass.bind(this)}
              >
                <Button
                  as="div"
                  labelPosition="left"
                  color="red"
                  disabled={this.state.isProcessingAction}
                >
                  <Label as="a" basic={true} color="black" pointing="right">
                    Pass
                  </Label>
                  <Button color="red" disabled={this.state.isProcessingAction}>
                    {this.state.isProcessingAction
                      ? "Processing..."
                      : "Not Bidding"}
                  </Button>
                </Button>
              </Button.Group>
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
                    top: "12rem",
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
                      <div style={{ color: "#9bd4ff" }}>
                        Team A Points: {gameCompleteData.teamAPoints}
                      </div>
                      <div style={{ color: "#7ee89e" }}>
                        Team B Points: {gameCompleteData.teamBPoints}
                      </div>
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
                this.state.isRoundReveal && this.state.timerRemaining > 0,
              )}
            </div>
          </Grid.Column>
        </Grid.Row>

        <Grid centered={true}>
          <Grid.Row
            centered={true}
            columns={1}
            className="biddingGrid"
            style={{ marginTop: "-3rem" }}
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
                    color="blue"
                    pointing="right"
                    style={{
                      width: "90%",
                      justifyContent: "center",
                      borderColor: "rgb(36 136 211)",
                      color: "rgb(36 136 211)",
                      fontWeight: "bold",
                    }}
                  >
                    {firstPlayer}'s Team
                  </Label>
                  <Button color="blue">
                    {teamAScore !== undefined
                      ? teamAScore
                      : 10 - Number(gameScore)}
                  </Button>
                </Button>
                <Button.Or text="VS" />
                <Button as="div" labelPosition="right" disabled={gameStarted}>
                  <Button color="green">
                    {teamBScore !== undefined
                      ? teamBScore
                      : 10 - Number(gameScore)}
                  </Button>
                  <Label
                    as="a"
                    basic={true}
                    color="green"
                    pointing="left"
                    style={{
                      width: "90%",
                      justifyContent: "center",
                      borderColor: "rgb(32 186 69)",
                      color: "rgb(32 186 69)",
                      fontWeight: "bold",
                    }}
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
                  gameStarted || !isFirstPlayer
                    ? "scoreSlider hideSlider"
                    : "scoreSlider showSlider"
                }
                id="gameScoreSlider"
                data-show-value="true"
                onChange={this.updateScore.bind(this)}
              />
            </Grid.Column>
          </Grid.Row>
        </Grid>

        <Grid centered={true}>
          <Grid.Row centered={true} columns={2}>
            <Grid.Column textAlign="center">
              <Button.Group className="teamAButtonGroup">
                <Button as="div" labelPosition="left">
                  <Label
                    as="a"
                    basic={true}
                    color="blue"
                    pointing="right"
                    style={{
                      background: "rgba(33, 133, 208, 0.16)",
                      borderColor: "rgb(36 136 211)",
                      color: "rgb(36 136 211)",
                      boxShadow: "0 0 10px rgba(33, 133, 208, 0.35)",
                      fontWeight: "bold",
                    }}
                  >
                    Team A [{firstPlayer} {thirdPlayer} {fifthPlayer}]
                  </Label>
                  <Button
                    color={
                      isGameComplete && biddingTeam === "A"
                        ? gameCompleteData?.biddingTeamAchievedBid
                          ? "green"
                          : "red"
                        : "blue"
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
                  <Label
                    as="a"
                    basic={true}
                    color="green"
                    pointing="right"
                    style={{
                      background: "rgba(39, 174, 96, 0.08)",
                      borderColor: "rgb(32 186 69)",
                      color: "rgb(32 186 69)",
                      boxShadow: "0 0 10px rgba(39, 174, 96, 0.3)",
                      fontWeight: "bold",
                    }}
                  >
                    Team B [{secondPlayer} {fourthPlayer} {lastPlayer}]
                  </Label>
                  <Button
                    color={
                      isGameComplete && biddingTeam === "B"
                        ? gameCompleteData?.biddingTeamAchievedBid
                          ? "green"
                          : "red"
                        : "green"
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
                  this.state.isRestarting ||
                  this.state.restartLockedUntilFirstCard ||
                  !(
                    typeof cards === "undefined" ||
                    cards.length === 0 ||
                    isFirstPlayer
                  )
                }
              >
                {this.state.isRestarting ? "Restarting..." : "Restart Game"}
              </Button>
              <Button.Or />
              {/* <Button
                color="orange"
                onClick={this.handleForfeitGameClick.bind(this, gameId)}
                disabled={typeof cards === "undefined" || cards.length === 0}
              >
                Forfeit Game
              </Button>
              <Button.Or /> */}
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

        {/* Spectator mode: show game ID and option to watch another game */}
        {this.renderPositionSwitchButtons(
          firstPlayer,
          secondPlayer,
          thirdPlayer,
          fourthPlayer,
          fifthPlayer,
          lastPlayer,
          playerId as string,
        )}
      </Dimmer.Dimmable>
    );
  }

  private updateScore = (event: any) => {
    this.store.updateGameScore(event.target.value);
  };

  /**
   * Render a read-only spectator view: table scores, team card piles, bid info.
   * Players' hand cards and action buttons are hidden.
   */
  private renderSpectatorView(props: {
    gameScore: string;
    firstPlayer: string;
    secondPlayer: string;
    thirdPlayer: string;
    fourthPlayer: string;
    fifthPlayer: string;
    lastPlayer: string;
    droppedCards: string[] | undefined;
    teamACards: string[] | undefined;
    teamBCards: string[] | undefined;
    dropCardPlayer: string[] | undefined;
    isGameComplete: boolean | undefined;
    winnerMessage: string | undefined;
    gameCompleteData: any;
    finalBid: number | undefined;
    biddingTeam: string | undefined;
    teamAScore: number | undefined;
    teamBScore: number | undefined;
    isBiddingPhase: boolean | undefined;
  }) {
    const {
      gameScore,
      firstPlayer,
      secondPlayer,
      thirdPlayer,
      fourthPlayer,
      fifthPlayer,
      lastPlayer,
      droppedCards,
      teamACards,
      teamBCards,
      dropCardPlayer,
      isGameComplete,
      winnerMessage,
      gameCompleteData,
      finalBid,
      biddingTeam,
      teamAScore,
      teamBScore,
      isBiddingPhase,
    } = props;

    return (
      <div>
        {/* Cards on table */}

        <Grid centered={true}>
          <Grid.Row centered={true} columns={1}>
            <Grid.Column className="cardHeight cardTable">
              <div className="cardOnTable">
                {this.renderCards(droppedCards, false, false, dropCardPlayer)}
                {this.state.isRoundReveal && this.state.timerRemaining > 0 && (
                  <div className="round-timer">
                    {" "}
                    {this.state.timerRemaining}{" "}
                  </div>
                )}

                {isGameComplete && winnerMessage && (
                  <div
                    className="game-winner-message"
                    style={{
                      position: "absolute",
                      left: "50%",
                      top: "12rem",
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
                        <div style={{ color: "#9bd4ff" }}>
                          Team A Points: {gameCompleteData.teamAPoints}
                        </div>
                        <div style={{ color: "#7ee89e" }}>
                          Team B Points: {gameCompleteData.teamBPoints}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Grid.Column>
          </Grid.Row>
        </Grid>

        {/* Bid info - above the score, centered, matching regular game layout */}
        <Grid centered={true}>
          <Grid.Row centered={true} columns={1}>
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
              {isBiddingPhase
                ? this.renderSpectatorBiddingInfo()
                : this.renderNormalGameUI()}
            </Grid.Column>
          </Grid.Row>
        </Grid>

        {/* Score display */}
        <Grid centered={true}>
          <Grid.Row centered={true} columns={1}>
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
              <Button.Group
                fluid={true}
                style={{
                  width: "25%",
                  display: "flex",
                  justifyContent: "center",
                }}
              >
                <Button as="div" labelPosition="left" disabled>
                  <Label
                    as="a"
                    basic={true}
                    color="blue"
                    pointing="right"
                    style={{
                      width: "90%",
                      justifyContent: "center",
                      borderColor: "rgb(36 136 211)",
                      color: "rgb(36 136 211)",
                      fontWeight: "bold",
                    }}
                  >
                    {firstPlayer}'s Team
                  </Label>
                  <Button color="blue" disabled>
                    {teamAScore !== undefined
                      ? teamAScore
                      : 10 - Number(gameScore)}
                  </Button>
                </Button>
                <Button.Or text="VS" />
                <Button as="div" labelPosition="right" disabled>
                  <Button color="green">
                    {teamBScore !== undefined
                      ? teamBScore
                      : 10 - Number(gameScore)}
                  </Button>
                  <Label
                    as="a"
                    basic={true}
                    color="green"
                    pointing="left"
                    style={{
                      width: "90%",
                      justifyContent: "center",
                      borderColor: "rgb(32 186 69)",
                      color: "rgb(32 186 69)",
                      fontWeight: "bold",
                    }}
                  >
                    {lastPlayer}'s Team
                  </Label>
                </Button>
              </Button.Group>
            </Grid.Column>
          </Grid.Row>
        </Grid>

        {/* Team card piles */}
        <Grid centered={true}>
          <Grid.Row centered={true} columns={2}>
            <Grid.Column textAlign="center">
              <Button.Group className="teamAButtonGroup">
                <Button as="div" labelPosition="left">
                  <Label
                    as="a"
                    basic={true}
                    color="blue"
                    pointing="right"
                    style={{
                      background: "rgba(33, 133, 208, 0.16)",
                      borderColor: "rgb(36 136 211)",
                      color: "rgb(36 136 211)",
                      boxShadow: "0 0 10px rgba(33, 133, 208, 0.35)",
                      fontWeight: "bold",
                    }}
                  >
                    Team A [{firstPlayer} {thirdPlayer} {fifthPlayer}]
                  </Label>
                  <Button
                    color={
                      isGameComplete && biddingTeam === "A"
                        ? gameCompleteData?.biddingTeamAchievedBid
                          ? "green"
                          : "red"
                        : "blue"
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
                  <Label
                    as="a"
                    basic={true}
                    color="green"
                    pointing="right"
                    style={{
                      background: "rgba(39, 174, 96, 0.08)",
                      borderColor: "rgb(32 186 69)",
                      color: "rgb(32 186 69)",
                      boxShadow: "0 0 10px rgba(39, 174, 96, 0.3)",
                      fontWeight: "bold",
                    }}
                  >
                    Team B [{secondPlayer} {fourthPlayer} {lastPlayer}]
                  </Label>
                  <Button
                    color={
                      isGameComplete && biddingTeam === "B"
                        ? gameCompleteData?.biddingTeamAchievedBid
                          ? "green"
                          : "red"
                        : "green"
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
      </div>
    );
  }

  /**
   * Render bid info panel for spectators during the bidding phase.
   */
  private renderSpectatorBiddingInfo() {
    const { bidHistory, currentBiddingPlayerId, bidDouble, bidReDouble } =
      this.store.game;
    let lastBid = "No bids yet";
    let lastBidPlayerId = "";
    if (bidHistory && bidHistory.length > 0) {
      for (let i = bidHistory.length - 1; i >= 0; i--) {
        const entry = bidHistory[i] as any;
        if (entry.action === "bid") {
          lastBid = `${entry.playerId} ➡ ${entry.bidValue} ${entry.suit || ""}`;
          lastBidPlayerId = entry.playerId || "";
          if (bidDouble) lastBid += " (Double)";
          if (bidReDouble) lastBid += " (Re-Double)";
          break;
        }
      }
    }
    const currentTurnTeam = this.getPlayerTeam(currentBiddingPlayerId || "");
    const lastBidTeam = lastBidPlayerId
      ? this.getPlayerTeam(lastBidPlayerId)
      : null;
    const currentTurnColor =
      currentTurnTeam === "A"
        ? "#9bd4ff"
        : currentTurnTeam === "B"
          ? "#7ee89e"
          : "white";
    const lastBidColor =
      lastBidTeam === "A"
        ? "#9bd4ff"
        : lastBidTeam === "B"
          ? "#7ee89e"
          : "white";
    const teamLabel = currentTurnTeam ? ` (Team ${currentTurnTeam})` : "";
    return (
      <div
        style={{
          textAlign: "center",
          backgroundColor: "rgba(0,0,0,0.6)",
          color: "white",
          padding: "10px",
          marginTop: "8px",
          borderRadius: "6px",
        }}
      >
        <strong>Bidding in progress</strong>
        <div style={{ marginTop: "4px" }}>
          Current turn:{" "}
          <em style={{ color: currentTurnColor }}>
            {currentBiddingPlayerId}
            {teamLabel}
          </em>
        </div>
        <div style={{ marginTop: "4px" }}>
          Last bid: <em style={{ color: lastBidColor }}>{lastBid}</em>
        </div>
      </div>
    );
  }

  /**
   * Render team-specific one-time position switch buttons
   * Visible only during bidding phase, before any bid us made, and if the team hasn't used it.
   */
  private renderPositionSwitchButtons(
    p0: string,
    p1: string,
    p2: string,
    p3: string,
    p4: string,
    p5: string,
    myPlayerId: string,
  ) {
    const {
      isBiddingPhase,
      bidHistory,
      teamAPositionSwitchUsed,
      teamBPositionSwitchUsed,
    } = this.store.game;

    // Only show before any bid is made
    const noBidsMade = !bidHistory || bidHistory.length === 0;
    if (!isBiddingPhase || !noBidsMade) {
      return null;
    }

    // Determine my team (Team A: includes 0, 2, 4; Team B: includes 1, 3, 5)
    const teamAPlayers = [p0, p2, p4].filter(Boolean);
    const teamBPlayers = [p1, p3, p5].filter(Boolean);
    const isTeamA = teamAPlayers.includes(myPlayerId);
    const isTeamB = teamBPlayers.includes(myPlayerId);

    if (!isTeamA && !isTeamB) {
      return null; // Player not in either team (shouldn't happen), don't show buttons
    }

    return (
      <Grid centered={true} style={{ marginTop: "4px" }}>
        <Grid.Row centered={true} columns={1}>
          <Grid.Column textAlign="center">
            {isTeamA && !teamAPositionSwitchUsed && (
              <Button
                color="blue"
                size="small"
                onClick={this.handleSwitchPositions.bind(this, "A")}
                style={{ margin: "4px" }}
                disabled={this.state.isProcessingAction}
                title="Ask your team to randomly shuffle Team A seating positions (one-time only)"
              >
                🔀 Shuffle Team A Seats
              </Button>
            )}
            {isTeamB && !teamBPositionSwitchUsed && (
              <Button
                color="green"
                size="small"
                onClick={this.handleSwitchPositions.bind(this, "B")}
                style={{ margin: "4px" }}
                disabled={this.state.isProcessingAction}
                title="Ask your team to randomly shuffle Team B seating positions (one-time only)"
              >
                🔀 Shuffle Team B Seats
              </Button>
            )}
          </Grid.Column>
        </Grid.Row>
      </Grid>
    );
  }

  private handleSwitchPositions = async (team: "A" | "B") => {
    if (this.state.isProcessingAction) return;
    this.setState({ isProcessingAction: true });
    try {
      await this.store.requestPositionSwitch(team);
    } finally {
      setTimeout(() => this.setState({ isProcessingAction: false }), 2000);
    }
  };

  private hasSuitInHand = (suit: string): boolean => {
    if (suit === "N") {
      return true; // "No Trump" is always a valid suit to choose
    }

    const { cards } = this.store.game;
    if (!cards || cards.length === 0) {
      return false;
    }

    return cards.some((card) => card && card.length > 1 && card[1] === suit);
  };

  private handleCardClick = (card: string) => {
    // Prevent double-clicks and rapid actions while processing
    if (this.state.isProcessingAction) {
      return;
    }

    this.setState({ isProcessingAction: true });

    const el = document.getElementById(card);
    if (el) {
      el.classList.add("disabled");
    }

    //Call the drop card action
    this.store.dropCard(card);

    // Re-enable after 3 seconds (increased from 1s to handle slow connections)
    setTimeout(() => {
      this.setState({ isProcessingAction: false });
      this.enableCardClicks();
    }, 3000);
  };

  private enableCardClicks = () => {
    const cards = Array.from(document.getElementsByClassName("card-clickable"));
    cards.forEach((card) => card.classList.remove("disabled"));
  };

  private renderBiddingUI(isYourBiddingTurn: boolean) {
    const {
      bidRaisePhase,
      bidRaiseOfferedTo,
      currentBet,
      trumpSuit,
      postRaiseDoubleRound,
    } = this.store.game;
    const playerId = this.store.user.playerId as string;

    // Show bid raise UI if in bid raise phase and it's this player's turn
    if (bidRaisePhase && bidRaiseOfferedTo === playerId) {
      const currentBidValue = parseInt(currentBet || "28");
      const availableLevels: number[] = [];

      if (currentBidValue < 40) {
        availableLevels.push(40, 48, 56);
      } else if (currentBidValue < 48) {
        availableLevels.push(48, 56);
      } else if (currentBidValue < 56) {
        availableLevels.push(56);
      }

      return (
        <>
          <div className="raiseYourBidContainer">
            <h2 style={{ marginBottom: "20px" }}>Raise your Bid?</h2>
            <p style={{ marginBottom: "10px" }}>
              You won the bidding with{" "}
              <strong>
                {currentBidValue} {trumpSuit}
              </strong>
            </p>
            <p
              style={{ marginBottom: "20px", fontSize: "14px", color: "#ccc" }}
            >
              You can raise your bid to a higher level for the same suit
            </p>
            <div style={{ marginBottom: "20px" }}>
              {availableLevels.map((level) => (
                <Button
                  key={level}
                  color="green"
                  size="large"
                  style={{ margin: "5px" }}
                  onClick={() => this.handleRaiseBid(level)}
                  disabled={this.state.isProcessingAction}
                >
                  {this.state.isProcessingAction
                    ? "Processing..."
                    : `Raise to ${level}`}
                </Button>
              ))}
            </div>
            <Button
              color="red"
              size="large"
              onClick={this.handleSkipRaise.bind(this)}
              disabled={this.state.isProcessingAction}
            >
              {this.state.isProcessingAction
                ? "Processing..."
                : "Skip - Start Game"}
            </Button>
          </div>
        </>
      );
    }

    // Show notification if in post-raise double round
    if (postRaiseDoubleRound) {
      return this.renderPostRaiseBiddingUI(isYourBiddingTurn);
    }

    return this.renderNormalBiddingUI(isYourBiddingTurn);
  }

  private renderNormalBiddingUI(isYourBiddingTurn: boolean) {
    const suits = [
      { symbol: "♥", name: "H", label: "Hearts" },
      { symbol: "♠", name: "E", label: "Spade" },
      { symbol: "♦", name: "D", label: "Diamond" },
      { symbol: "♣", name: "C", label: "Clubs" },
    ];

    const noTrumpTypes = [
      { name: "Noes", label: "Noes" },
      { name: "Pass", label: "Pass" },
      { name: "No-Trump", label: "No-Trump" },
    ];

    const { bidHistory, bidDouble, bidReDouble } = this.store.game;
    const { currentBiddingValue, currentBiddingsuit, noTrumpType } = this.state;

    // Determine current bid from history
    let lastBidValue = 28;
    let lastBidsuit = "N";
    let lastBiddingPlayer = "";
    let lastBidSelectionType: "direct" | "modifier" | null = null;
    let lastBidModifier = 0;
    let lastBidClickOrder: "bidFirst" | "suitFirst" | null = null;
    let lastNoTrumpType: string | null = null;
    let hasActualBid = false;

    if (bidHistory && bidHistory.length > 0) {
      for (let i = bidHistory.length - 1; i >= 0; i--) {
        const entry = bidHistory[i] as any;
        if (entry.action === "bid") {
          lastBidValue = entry.bidValue || 28;
          lastBidsuit = entry.suit || "N";
          lastBiddingPlayer = entry.playerId || "";
          lastBidSelectionType = entry.bidSelectionType || null;
          lastBidModifier = entry.bidModifier || 0;
          lastBidClickOrder = entry.clickOrder || null;
          lastNoTrumpType = entry.noTrumpType || null;
          hasActualBid = true;
          break;
        }
      }
    }

    const lastSuitInfo = suits.find((s) => s.name === lastBidsuit);
    const displayedSuitInfo = suits.find(
      (s) => s.name === (currentBiddingsuit || lastBidsuit),
    );

    // Check if player has selected a bid value (not just suit)
    const hasBidValueSelected =
      currentBiddingValue > 0 &&
      currentBiddingValue >= 28 &&
      currentBiddingValue <= 56;
    const hasSuitSelected = currentBiddingsuit !== "";
    const hasPlayerMadeSelections = hasBidValueSelected && hasSuitSelected;

    // Compute team-based colors for bid display
    const lastBidTeam = hasActualBid
      ? this.getPlayerTeam(lastBiddingPlayer)
      : null;
    const myTeam = this.getPlayerTeam(this.store.user.playerId as string);
    const lastBidStyle = {
      justifyContent: "center" as const,
      color: "white",
      background:
        lastBidTeam === "A"
          ? "rgb(36 136 211)"
          : lastBidTeam === "B"
            ? "rgb(32 186 69)"
            : "transparent",
    };
    const myBidStyle = {
      justifyContent: "center" as const,
      color: myTeam === "A" ? "#c6e6ff" : myTeam === "B" ? "#a0efbf" : "yellow",
      border: `1px solid ${myTeam === "A" ? "rgba(33, 133, 208, 0.6)" : myTeam === "B" ? "rgba(39, 174, 96, 0.6)" : "orange"}`,
      background:
        myTeam === "A"
          ? "rgba(33, 133, 208, 0.12)"
          : myTeam === "B"
            ? "rgba(39, 174, 96, 0.08)"
            : "transparent",
    };

    return (
      <>
        {/* Show current bid with player name and any double/re-double status */}
        <Button.Group
          fluid={true}
          style={{ width: "100%", display: "block", marginBottom: "10px" }}
        >
          <Button color="black" style={lastBidStyle}>
            {hasActualBid
              ? `${lastBiddingPlayer} bids → ${this.formatBidDisplay(
                lastBidValue,
                lastBidsuit,
                lastBidValue,
                lastSuitInfo,
                lastBidSelectionType,
                lastBidModifier,
                lastBidClickOrder,
                lastNoTrumpType,
              )}`
              : "No Bids Yet"}
            {bidDouble && " (Double)"}
            {bidReDouble && " (Re-Double)"}
          </Button>
          <Button color="black" style={myBidStyle}>
            Your Bid:{" "}
            {hasPlayerMadeSelections
              ? this.formatBidDisplay(
                currentBiddingValue,
                currentBiddingsuit,
                lastBidValue,
                displayedSuitInfo,
                undefined,
                undefined,
                undefined,
                noTrumpType,
              )
              : "Not selected"}
          </Button>
        </Button.Group>

        {isYourBiddingTurn && (
          <>
            {/* Bid Value Buttons (28-56) in 12x3 grid */}
            <div style={{ marginBottom: "10px" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(12, 1fr)",
                  gap: "5px",
                }}
              >
                {Array.from({ length: 29 }, (_, i) => 28 + i).map(
                  (bidValue) => {
                    const isDisabled = hasActualBid && bidValue <= lastBidValue;
                    const bidMaxedOut = lastBidValue >= 56;
                    return (
                      <Button
                        key={bidValue}
                        color={
                          currentBiddingValue === bidValue ? "green" : "grey"
                        }
                        disabled={isDisabled || bidMaxedOut}
                        onClick={() =>
                          this.handleBidNumberClick(
                            bidValue,
                            lastBidValue,
                            lastBidsuit,
                          )
                        }
                        style={{
                          padding: "8px 4px",
                          fontSize: "12px",
                          opacity: isDisabled && hasActualBid ? 0.5 : 1,
                        }}
                      >
                        {bidValue}
                      </Button>
                    );
                  },
                )}
                <Button
                  key="+"
                  color={"blue"}
                  onClick={() => this.handleModifierClick(0)}
                  disabled={currentBiddingValue > 55 || lastBidValue >= 56}
                  style={{
                    padding: "8px 4px",
                    fontSize: "12px",
                  }}
                >
                  +
                </Button>
                <Button
                  key="+1"
                  color={"blue"}
                  onClick={() => this.handleModifierClick(1)}
                  disabled={currentBiddingValue > 55 || lastBidValue >= 56}
                  style={{
                    padding: "8px 4px",
                    fontSize: "12px",
                  }}
                >
                  +1
                </Button>
                <Button
                  key="+2"
                  color={"blue"}
                  onClick={() => this.handleModifierClick(2)}
                  disabled={currentBiddingValue > 54 || lastBidValue >= 56}
                  style={{
                    padding: "8px 4px",
                    fontSize: "12px",
                  }}
                >
                  +2
                </Button>
                <Button
                  key="+3"
                  color={"blue"}
                  onClick={() => this.handleModifierClick(3)}
                  disabled={currentBiddingValue > 53 || lastBidValue >= 56}
                  style={{
                    padding: "8px 4px",
                    fontSize: "12px",
                  }}
                >
                  +3
                </Button>
                <Button
                  key="+4"
                  color={"blue"}
                  onClick={() => this.handleModifierClick(4)}
                  disabled={currentBiddingValue > 52 || lastBidValue >= 56}
                  style={{
                    padding: "8px 4px",
                    fontSize: "12px",
                  }}
                >
                  +4
                </Button>
                <Button
                  key="+5"
                  color={"blue"}
                  onClick={() => this.handleModifierClick(5)}
                  disabled={currentBiddingValue > 51 || lastBidValue >= 56}
                  style={{
                    padding: "8px 4px",
                    fontSize: "12px",
                  }}
                >
                  +5
                </Button>
                <Button
                  key="resetBid"
                  color={"red"}
                  onClick={() => this.handleResetBid()}
                  style={{
                    padding: "8px 4px",
                    fontSize: "12px",
                  }}
                >
                  Reset
                </Button>
              </div>
            </div>

            {/* Suit Selection */}
            <Button.Group
              fluid={true}
              style={{ width: "100%", display: "block", marginBottom: "10px" }}
            >
              {/* Regular Suit Selection */}
              {suits.map((suit) =>
                (() => {
                  const isSuitAvailable = this.hasSuitInHand(suit.name);
                  const isSelected = currentBiddingsuit === suit.name;
                  const bidMaxedOut = lastBidValue >= 56;
                  return (
                    <Label
                      as="a"
                      basic={!isSelected}
                      key={suit.name}
                      color={
                        isSelected ? "green" : isSuitAvailable ? "red" : "grey"
                      }
                      onClick={() =>
                        isSuitAvailable &&
                        !bidMaxedOut &&
                        this.handleBiddingSuitClick(suit.name)
                      }
                      title={suit.label}
                      style={{
                        cursor:
                          isSuitAvailable && !bidMaxedOut
                            ? "pointer"
                            : "not-allowed",
                        padding: "8px 12px",
                        margin: "2px",
                        opacity: isSuitAvailable && !bidMaxedOut ? 1 : 0.5,
                      }}
                    >
                      {suit.label} {suit.symbol}
                    </Label>
                  );
                })(),
              )}
              {/* No-Trump Type Selection */}
              {noTrumpTypes.map((type) => {
                const isSelected =
                  currentBiddingsuit === "N" && noTrumpType === type.name;
                const bidMaxedOut = lastBidValue >= 56;
                return (
                  <Label
                    as="a"
                    basic={!isSelected}
                    key={type.name}
                    color={isSelected ? "green" : "purple"}
                    onClick={() =>
                      !bidMaxedOut &&
                      this.handleNoTrumpTypeClick(
                        type.name as "Noes" | "Pass" | "No-Trump",
                      )
                    }
                    title={type.label}
                    style={{
                      cursor: bidMaxedOut ? "not-allowed" : "pointer",
                      padding: "8px 12px",
                      margin: "2px",
                      opacity: bidMaxedOut ? 0.5 : 1,
                    }}
                  >
                    {type.label}
                  </Label>
                );
              })}
            </Button.Group>

            {/* Action Buttons */}
            <Button.Group
              fluid={true}
              style={{ width: "100%", display: "block", marginBottom: "10px" }}
            >
              <Button
                color="red"
                onClick={this.handleBiddingDone.bind(this)}
                disabled={
                  !hasPlayerMadeSelections ||
                  lastBidValue >= 56 ||
                  this.state.isProcessingAction
                }
                style={{
                  minWidth: "190px",
                }}
              >
                <Icon name="arrow circle right" /> &nbsp;{" "}
                {this.state.isProcessingAction ? "Processing..." : "BID"}
              </Button>
              {(() => {
                // Only show Double/Re-Double buttons if player is on the correct team
                const currentPlayerTeam = this.getPlayerTeam(
                  this.store.user.playerId as string,
                );
                const { lastBiddingTeam } = this.store.game;

                // Double: only show to opponents of the bidding team
                const canDouble =
                  hasActualBid &&
                  lastBidValue > 0 &&
                  !bidDouble &&
                  !bidReDouble &&
                  currentPlayerTeam &&
                  lastBiddingTeam &&
                  currentPlayerTeam !== lastBiddingTeam;

                // Re-Double: only show to members of the bidding team after a double
                const canReDouble =
                  bidDouble &&
                  !bidReDouble &&
                  currentPlayerTeam &&
                  lastBiddingTeam &&
                  currentPlayerTeam === lastBiddingTeam;

                return (
                  <>
                    {canDouble && (
                      <Button
                        color="yellow"
                        onClick={this.handleBiddingDouble.bind(this)}
                        disabled={this.state.isProcessingAction}
                      >
                        <Icon name="bolt" />{" "}
                        {this.state.isProcessingAction
                          ? "Processing..."
                          : "Double"}
                      </Button>
                    )}
                    {canReDouble && (
                      <Button
                        color="violet"
                        onClick={this.handleBiddingReDouble.bind(this)}
                        disabled={this.state.isProcessingAction}
                      >
                        <Icon name="chess king" />{" "}
                        {this.state.isProcessingAction
                          ? "Processing..."
                          : "Re-Double"}
                      </Button>
                    )}
                  </>
                );
              })()}
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
      bidDouble,
      bidReDouble,
      bidHistory,
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

    // Try to get player name and last bid metadata from various sources
    let playerName = "";
    let lastBidSelectionType: "direct" | "modifier" | null = null;
    let lastBidModifier = 0;
    let lastBidSuit = trumpSuit || "N";
    let lastBidClickOrder: "bidFirst" | "suitFirst" | null = null;
    let lastNoTrumpType: string | null = null;

    if (hasCurrentBid) {
      playerName = currentBetPlayerId;
    } else if (hasFinalBid) {
      // Look for the last player who made a bid in bidHistory
      if (bidHistory && bidHistory.length > 0) {
        for (let i = bidHistory.length - 1; i >= 0; i--) {
          const entry = bidHistory[i] as any;
          if (entry.action === "bid") {
            if (entry.playerId) {
              playerName = entry.playerId;
            }
            lastBidSelectionType = entry.bidSelectionType || null;
            lastBidModifier = entry.bidModifier || 0;
            lastBidSuit = entry.suit || lastBidSuit;
            lastBidClickOrder = entry.clickOrder || null;
            lastNoTrumpType = entry.noTrumpType || null;
            break;
          }
        }
      }
      // Fallback to biddingPlayer if available
      if (!playerName && biddingPlayer) {
        playerName = biddingPlayer;
      }
      // Fallback to first player in bidding team
      if (!playerName && biddingTeam) {
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
    const suitInfo = suits.find((s) => s.name === (lastBidSuit || "N"));

    const suitDisplay = this.formatSuitDisplay(
      lastBidSuit,
      suitInfo,
      lastNoTrumpType,
    );

    const label =
      (hasCurrentBid || hasFinalBid) && playerName
        ? `${playerName}'s bid → ${suitDisplay} [${bidValue}]${bidDouble ? " (Double)" : ""
        }${bidReDouble ? " (Re-Double)" : ""}`
        : "Game Starting...";

    const bidTeamStyle = {
      justifyContent: "center" as const,
      color: "white",
      background:
        biddingTeam === "A"
          ? "rgb(36 136 211)"
          : biddingTeam === "B"
            ? "rgb(32 186 69)"
            : "transparent",
    };

    return (
      <Button.Group
        fluid={true}
        style={{ width: "100%", display: "block", marginBottom: "10px" }}
      >
        <Button color="black" style={bidTeamStyle}>
          {label}
        </Button>
      </Button.Group>
    );
  }

  private handleBidNumberClick = (
    bidValue: number,
    lastBidValue: number,
    lastBidsuit: string,
  ) => {
    // Set the exact bid value, default suit to Noes if not selected
    // Track if this is the first click
    const clickOrder =
      this.state.clickOrder === null && this.state.currentBiddingsuit === ""
        ? "bidFirst"
        : this.state.clickOrder;

    this.setState({
      currentBiddingValue: bidValue,
      bidSelectionType: "direct",
      bidModifier: 0,
      clickOrder,
    } as any);
  };

  private handleModifierClick = (modifier: number) => {
    // modifier values: 0 for +, 1 for +1, 2 for +2, etc.
    // Always calculate from the last bid value, not from current selection
    const effectiveModifier = modifier === 0 ? 1 : modifier;
    let lastBidValue = 28;
    const { bidHistory } = this.store.game;
    let hasActualBid = false;

    if (bidHistory && bidHistory.length > 0) {
      for (let i = bidHistory.length - 1; i >= 0; i--) {
        const entry = bidHistory[i];
        if (entry.action === "bid") {
          lastBidValue = entry.bidValue || 28;
          hasActualBid = true;
          break;
        }
      }
    }

    let newValue: number;
    if (hasActualBid) {
      // Subsequent players: actualBid = lastBidValue + numJacks
      newValue = Math.min(lastBidValue + effectiveModifier, 56);
    } else {
      // First player: actualBid = 28 + max(0, numJacks - 1)
      // So + and +1 both give 28, +2 gives 29, +3 gives 30, etc.
      newValue = Math.min(28 + Math.max(0, effectiveModifier - 1), 56);
    }

    // Track if this is the first click
    const clickOrder =
      this.state.clickOrder === null && this.state.currentBiddingsuit === ""
        ? "bidFirst"
        : this.state.clickOrder;

    this.setState({
      currentBiddingValue: newValue,
      bidSelectionType: "modifier",
      bidModifier: modifier,
      clickOrder,
    } as any);
  };

  private handleBiddingSuitClick = (suit: string) => {
    // Only set the suit, don't change the bid value
    // Track if this is the first click
    const clickOrder =
      this.state.clickOrder === null && this.state.currentBiddingValue === 0
        ? "suitFirst"
        : this.state.clickOrder;

    this.setState({
      currentBiddingsuit: suit,
      clickOrder,
      noTrumpType: null, // Clear no-trump type when selecting a regular suit
    } as any);
  };

  private handleNoTrumpTypeClick = (type: "Noes" | "Pass" | "No-Trump") => {
    const clickOrder =
      this.state.clickOrder === null && this.state.currentBiddingValue === 0
        ? "suitFirst"
        : this.state.clickOrder;

    // For plain "Noes" with no bid value already selected, auto-increment
    // the last bid by 1 — eliminates the need to click a number separately
    if (type === "Noes" && this.state.currentBiddingValue === 0) {
      let lastBidValue = 28;
      const { bidHistory } = this.store.game;
      let hasActualBid = false;
      if (bidHistory && bidHistory.length > 0) {
        for (let i = bidHistory.length - 1; i >= 0; i--) {
          const entry = bidHistory[i] as any;
          if (entry.action === "bid") {
            lastBidValue = entry.bidValue || 28;
            hasActualBid = true;
            break;
          }
        }
      }
      const autoValue = Math.min(hasActualBid ? lastBidValue + 1 : 28, 56);
      this.setState({
        currentBiddingsuit: "N",
        noTrumpType: type,
        clickOrder,
        currentBiddingValue: autoValue,
        bidSelectionType: "direct",
        bidModifier: 0,
      } as any);
    } else {
      this.setState({
        currentBiddingsuit: "N",
        noTrumpType: type,
        clickOrder,
      } as any);
    }
  };

  private handleResetBid = () => {
    // Reset the bid selection to start fresh
    this.setState({
      currentBiddingValue: 0, // 0 means no selection yet
      currentBiddingsuit: "",
      bidSelectionType: null,
      bidModifier: 0,
      clickOrder: null,
      noTrumpType: null,
    } as any);
  };

  private formatSuitDisplay = (
    suit: string,
    suitInfo: any,
    noTrumpType?: string | null,
  ): string => {
    if (suit === "" || !suitInfo) {
      return noTrumpType || "";
    }
    if (suitInfo?.name === "N") {
      return noTrumpType || "Noes";
    }
    return `${suitInfo?.label} ${suitInfo?.symbol}`;
  };

  private formatBidDisplay = (
    bidValue: number,
    suit: string,
    lastBidValue: number,
    suitInfo: any,
    bidSelectionType?: "direct" | "modifier" | null,
    bidModifier?: number,
    overrideClickOrder?: "bidFirst" | "suitFirst" | null,
    noTrumpType?: string | null,
  ): string => {
    // Use provided noTrumpType if given, otherwise use component state
    const finalNoTrumpType =
      noTrumpType !== undefined ? noTrumpType : this.state.noTrumpType;
    const suitDisplay = this.formatSuitDisplay(
      suit,
      suitInfo,
      finalNoTrumpType,
    );

    // Use override if provided, otherwise use component state
    const clickOrder =
      overrideClickOrder !== undefined
        ? overrideClickOrder
        : this.state.clickOrder;

    // Special case: Auto-generated first player pass (mandatory minimum bid)
    // Shows as "Pass (28)" instead of "28 Pass [28]"
    if (finalNoTrumpType === "Pass" && clickOrder === null && bidValue === 28) {
      return `${suitDisplay} (${bidValue})`;
    }

    let bidStyle: string;

    // Use provided bidSelectionType/bidModifier if given, otherwise use component state
    const selectionType =
      bidSelectionType !== undefined
        ? bidSelectionType
        : this.state.bidSelectionType;
    const modifier =
      bidModifier !== undefined ? bidModifier : this.state.bidModifier;

    if (selectionType === "modifier") {
      if (modifier === 0) {
        bidStyle = "+";
      } else {
        bidStyle = `+${modifier}`;
      }
    } else {
      bidStyle = bidValue.toString();
    }

    // Auto-Noes should render as exactly: Noes [31]
    if (suit === "N" && finalNoTrumpType === "Noes") {
      return `${suitDisplay} [${bidValue}]`;
    }

    if (!suitDisplay) {
      return `${bidStyle} [${bidValue}]`;
    }

    // If suit was clicked first, show: suit bidStyle [value]
    // If bid was clicked first, show: bidStyle suit [value]
    if (clickOrder === "suitFirst") {
      return `${suitDisplay} ${bidStyle} [${bidValue}]`;
    } else {
      // Default to bidStyle first
      return `${bidStyle} ${suitDisplay} [${bidValue}]`;
    }
  };

  private handleBiddingDone = () => {
    // Prevent double-clicks and rapid actions while processing
    if (this.state.isProcessingAction) {
      return;
    }

    this.setState({ isProcessingAction: true });

    const {
      currentBiddingValue,
      currentBiddingsuit,
      bidSelectionType,
      bidModifier,
      clickOrder,
      noTrumpType,
    } = this.state;

    const hasBidValueSelected =
      currentBiddingValue > 0 &&
      currentBiddingValue >= 28 &&
      currentBiddingValue <= 56;
    const hasSuitSelected = currentBiddingsuit !== "";

    // Invalid bid guard: number alone is not allowed.
    if (!hasBidValueSelected || !hasSuitSelected) {
      this.setState({ isProcessingAction: false });
      return;
    }

    const suit = currentBiddingsuit;
    const finalNoTrumpType = noTrumpType;
    // Include bid selection type and modifier in the action so history can track it
    (this.store.biddingAction as any)(
      "bid",
      currentBiddingValue,
      suit,
      bidSelectionType,
      bidModifier,
      clickOrder,
      finalNoTrumpType,
    );
    // Reset local bidding state
    this.setState({
      currentBiddingValue: 0,
      currentBiddingsuit: "",
      biddingHistory: [],
      bidSelectionType: null,
      bidModifier: 0,
      clickOrder: null,
      noTrumpType: null,
    } as any);

    // Re-enable after 2 seconds
    setTimeout(() => {
      this.setState({ isProcessingAction: false });
    }, 2000);
  };

  /**
   * Get the team of a player based on their index in the players array
   * Team A: positions 0, 2, 4
   * Team B: positions 1, 3, 5
   */
  private getPlayerTeam(playerId: string): "A" | "B" | null {
    const { players } = this.store.game;
    if (!players) return null;

    const playerIndex = players.findIndex(
      (p: any) => p === playerId || p.playerId === playerId,
    );
    if (playerIndex === -1) return null;

    // Team A: even positions (0, 2, 4), Team B: odd positions (1, 3, 5)
    return playerIndex % 2 === 0 ? "A" : "B";
  }

  private handleBiddingPass = () => {
    // Prevent double-clicks and rapid actions while processing
    if (this.state.isProcessingAction) {
      return;
    }

    this.setState({ isProcessingAction: true });

    // "Not Bidding" button always sends a regular pass action
    // Players must intentionally select bid value + "Pass" no-trump type to bid "28 Pass"
    this.store.biddingAction("pass");

    // Reset local bidding state
    this.setState({
      currentBiddingValue: 0,
      currentBiddingsuit: "",
      biddingHistory: [],
      bidSelectionType: null,
      bidModifier: 0,
      clickOrder: null,
      noTrumpType: null,
    } as any);

    // Re-enable after 2 seconds
    setTimeout(() => {
      this.setState({ isProcessingAction: false });
    }, 2000);
  };

  private handleBiddingDouble = () => {
    // Prevent double-clicks and rapid actions while processing
    if (this.state.isProcessingAction) {
      return;
    }

    this.setState({ isProcessingAction: true });

    this.store.biddingAction("double");
    // Reset local bidding state
    this.setState({
      currentBiddingValue: 0,
      currentBiddingsuit: "",
      biddingHistory: [],
      bidSelectionType: null,
      bidModifier: 0,
      clickOrder: null,
      noTrumpType: null,
    } as any);

    // Re-enable after 2 seconds
    setTimeout(() => {
      this.setState({ isProcessingAction: false });
    }, 2000);
  };

  private handleBiddingReDouble = () => {
    // Prevent double-clicks and rapid actions while processing
    if (this.state.isProcessingAction) {
      return;
    }

    this.setState({ isProcessingAction: true });

    this.store.biddingAction("re-double");
    // Reset local bidding state
    this.setState({
      currentBiddingValue: 0,
      currentBiddingsuit: "",
      biddingHistory: [],
      bidSelectionType: null,
      bidModifier: 0,
      clickOrder: null,
      noTrumpType: null,
    } as any);

    // Re-enable after 2 seconds
    setTimeout(() => {
      this.setState({ isProcessingAction: false });
    }, 2000);
  };

  private handleRaiseBid = (newBidValue: number) => {
    // Prevent double-clicks and rapid actions while processing
    if (this.state.isProcessingAction) {
      return;
    }

    this.setState({ isProcessingAction: true });
    this.store.raiseBid(newBidValue);

    // Re-enable after 2 seconds
    setTimeout(() => {
      this.setState({ isProcessingAction: false });
    }, 2000);
  };

  private handleSkipRaise = () => {
    // Prevent double-clicks and rapid actions while processing
    if (this.state.isProcessingAction) {
      return;
    }

    this.setState({ isProcessingAction: true });
    this.store.skipRaise();

    // Re-enable after 2 seconds
    setTimeout(() => {
      this.setState({ isProcessingAction: false });
    }, 2000);
  };

  private renderPostRaiseBiddingUI(isYourBiddingTurn: boolean) {
    const { bidHistory, bidDouble, bidReDouble, currentBet, trumpSuit } =
      this.store.game;

    // Determine current bid from history
    let lastBidValue = parseInt(currentBet || "28");
    let lastBiddingPlayer = "";

    if (bidHistory && bidHistory.length > 0) {
      for (let i = bidHistory.length - 1; i >= 0; i--) {
        const entry = bidHistory[i] as any;
        if (entry.action === "bid" || entry.action === "raise-bid") {
          if (entry.bidValue) {
            lastBidValue = entry.bidValue;
          }
          lastBiddingPlayer = entry.playerId || "";
          break;
        }
      }
    }

    const suits = [
      { symbol: "♥", name: "H", label: "Hearts" },
      { symbol: "♠", name: "E", label: "Spade" },
      { symbol: "♦", name: "D", label: "Diamond" },
      { symbol: "♣", name: "C", label: "Clubs" },
    ];
    const suitInfo = suits.find((s) => s.name === trumpSuit);
    const suitDisplay =
      trumpSuit === "N"
        ? "Noes"
        : `${suitInfo?.label || ""} ${suitInfo?.symbol || ""}`;

    const raisedBidTeam = this.getPlayerTeam(lastBiddingPlayer);
    const raisedBidStyle = {
      justifyContent: "center" as const,
      color: "white",
      background:
        raisedBidTeam === "A"
          ? "rgb(36 136 211)"
          : raisedBidTeam === "B"
            ? "rgb(32 186 69)"
            : "#ff8c00",
    };

    return (
      <>
        {/* Show current raised bid */}
        <Button.Group
          fluid={true}
          style={{ width: "100%", display: "block", marginBottom: "10px" }}
        >
          <Button color="black" style={raisedBidStyle}>
            {`${lastBiddingPlayer} raised bid → ${suitDisplay} [${lastBidValue}]`}
            {bidDouble && " (Double)"}
            {bidReDouble && " (Re-Double)"}
          </Button>
        </Button.Group>
      </>
    );
  }

  private renderPostRaiseButtonsInCenter() {
    const {
      bidHistory,
      bidDouble,
      bidReDouble,
      currentBet,
      trumpSuit,
      lastBiddingTeam,
      currentBiddingPlayerId,
    } = this.store.game;
    const playerId = this.store.user.playerId as string;
    const currentPlayerTeam = this.getPlayerTeam(playerId);
    const isYourBiddingTurn = currentBiddingPlayerId === playerId;

    // Determine current bid from history
    let lastBidValue = parseInt(currentBet || "28");
    let lastBiddingPlayer = "";

    if (bidHistory && bidHistory.length > 0) {
      for (let i = bidHistory.length - 1; i >= 0; i--) {
        const entry = bidHistory[i] as any;
        if (entry.action === "bid" || entry.action === "raise-bid") {
          if (entry.bidValue) {
            lastBidValue = entry.bidValue;
          }
          lastBiddingPlayer = entry.playerId || "";
          break;
        }
      }
    }

    const suits = [
      { symbol: "♥", name: "H", label: "Hearts" },
      { symbol: "♠", name: "E", label: "Spade" },
      { symbol: "♦", name: "D", label: "Diamond" },
      { symbol: "♣", name: "C", label: "Clubs" },
    ];

    const suitInfo = suits.find((s) => s.name === trumpSuit);
    const suitDisplay =
      trumpSuit === "N"
        ? "Noes"
        : `${suitInfo?.label || ""} ${suitInfo?.symbol || ""}`;

    const postRaiseTheme =
      lastBiddingTeam === "A"
        ? {
          backgroundColor: "rgba(33, 133, 208, 0.92)",
          boxShadow: "0 10px 30px rgba(33, 133, 208, 0.4)",
        }
        : lastBiddingTeam === "B"
          ? {
            backgroundColor: "rgba(39, 174, 96, 0.95)",
            boxShadow: "0 10px 30px rgba(39, 174, 96, 0.4)",
          }
          : {
            backgroundColor: "rgba(255, 165, 0, 0.95)",
            boxShadow: "0 10px 30px rgba(255, 165, 0, 0.35)",
          };

    // Determine available actions based on team
    const isOpponentTeam =
      currentPlayerTeam &&
      lastBiddingTeam &&
      currentPlayerTeam !== lastBiddingTeam;
    const isBiddingTeam =
      currentPlayerTeam &&
      lastBiddingTeam &&
      currentPlayerTeam === lastBiddingTeam;

    if (!isYourBiddingTurn) {
      // Show notification for other players
      return (
        <div
          className="handleBiddingPassPostRaise"
          style={{
            ...postRaiseTheme,
            color: "white",
            padding: "20px",
            borderRadius: "10px",
            textAlign: "center",
            maxWidth: "400px",
            margin: "0 auto",
            zIndex: 1000,
          }}
        >
          <strong style={{ fontSize: "16px" }}>Post-Raise Round</strong>
          <p
            style={{ fontSize: "13px", marginTop: "8px", marginBottom: "5px" }}
          >
            {lastBiddingPlayer} raised bid → {suitDisplay} [{lastBidValue}]
          </p>
          <p style={{ fontSize: "12px", marginTop: "5px", opacity: 0.9 }}>
            Waiting for {currentBiddingPlayerId}...
          </p>
        </div>
      );
    }

    // Show action buttons for current player
    return (
      <div
        className="handleBiddingPassPostRaise"
        style={{
          ...postRaiseTheme,
          color: "white",
          padding: "20px",
          borderRadius: "10px",
          textAlign: "center",
          maxWidth: "500px",
          margin: "0 auto",
          zIndex: 1000,
        }}
      >
        <strong style={{ fontSize: "16px" }}>Post-Raise Round</strong>
        <p style={{ fontSize: "13px", marginTop: "8px", marginBottom: "5px" }}>
          {lastBiddingPlayer} raised bid → {suitDisplay} [{lastBidValue}]
          {bidDouble && " (Double)"}
          {bidReDouble && " (Re-Double)"}
        </p>
        <p
          style={{
            fontSize: "12px",
            marginTop: "5px",
            marginBottom: "15px",
            opacity: 0.9,
          }}
        >
          {isOpponentTeam && !bidDouble && "You can Double or Pass"}
          {isBiddingTeam && bidDouble && "You can Re-Double or Pass"}
        </p>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "10px",
          }}
        >
          {/* Pass button - always available */}
          <Button
            color="red"
            onClick={this.handleBiddingPass.bind(this)}
            size="large"
          >
            Pass
          </Button>

          {/* Double button - only for opponents if not already doubled */}
          {isOpponentTeam && !bidDouble && !bidReDouble && (
            <Button
              color="yellow"
              onClick={this.handleBiddingDouble.bind(this)}
              size="large"
            >
              <Icon name="bolt" />
              Double
            </Button>
          )}

          {/* Re-Double button - only for opponents if already doubled */}
          {isBiddingTeam && bidDouble && !bidReDouble && (
            <Button
              color="violet"
              size="large"
              onClick={this.handleBiddingReDouble.bind(this)}
            >
              <Icon name="chess king" />
              Re-Double
            </Button>
          )}
        </div>
      </div>
    );
  }

  private addNameToCardOnTable = (card: string, dropCardPlayer: string[]) => {
    const cardPrefix = `${card}-`;

    // Find the element in dropCardPlayer that starts with the card prefix
    const playerCardCombo = dropCardPlayer.find(
      (element) =>
        typeof element === "string" && element.startsWith(cardPrefix),
    );

    // If no matching combo is found, return an empty string to avoid errors
    if (!playerCardCombo) {
      return "";
    }

    // Extract and return the player name from the combo string
    return playerCardCombo.slice(cardPrefix.length);
  };

  private renderCards(
    cards?: string[],
    isClickable: boolean = false,
    flipOver: boolean = false,
    dropCardPlayer?: string[],
    disableAllCards: boolean = false,
  ) {
    if (!cards) {
      return null;
    }

    return cards.map((card) => {
      const playerName = dropCardPlayer
        ? this.addNameToCardOnTable(card, dropCardPlayer)
        : "";
      const playerTeam =
        playerName && dropCardPlayer ? this.getPlayerTeam(playerName) : null;
      const playerTeamClass =
        playerTeam === "A"
          ? "playerLabel-team-a"
          : playerTeam === "B"
            ? "playerLabel-team-b"
            : "";
      return (
        <Card
          className={isClickable ? "card-clickable" : "card"}
          id={card}
          key={card}
          card={card}
          playerName={playerName}
          playerTeamClass={playerTeamClass}
          disabled={!isClickable || disableAllCards}
          onCardClick={this.handleCardClick}
          flipOver={flipOver}
        />
      );
    });
  }

  private handleRestartGameClick = async (gameId: string) => {
    if (this.state.isRestarting) {
      return; // Prevent multiple clicks
    }

    this.setState({ isRestarting: true });
    try {
      await this.store.restartGame(gameId);
      this.setState({ restartLockedUntilFirstCard: true });
    } finally {
      this.setState({ isRestarting: false });
    }
  };

  private viewAllCards = () => {
    const teamCards = document.querySelectorAll(".flip_card");
    teamCards.forEach((teamCard) => teamCard.classList.remove("flip_card"));
    const teamCardImages = document.querySelectorAll(".flip_image");
    teamCardImages.forEach((teamCardImage) => {
      teamCardImage.classList.remove("flip_image");
    });
  };
}

export default GameGrid;
