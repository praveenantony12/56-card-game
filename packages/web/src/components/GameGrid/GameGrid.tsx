import { inject, observer } from "mobx-react";
import * as React from "react";
import { Dimmer } from "semantic-ui-react";
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
      bidHistory,
      teamAPositionSwitchUsed,
      teamBPositionSwitchUsed,
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

    const noBidsMade = !bidHistory || bidHistory.length === 0;
    const teamAPlayersList = [firstPlayer, thirdPlayer, fifthPlayer].filter(
      Boolean,
    );
    const teamBPlayersList = [secondPlayer, fourthPlayer, lastPlayer].filter(
      Boolean,
    );
    const showShuffleA = !!(
      isBiddingPhase &&
      noBidsMade &&
      teamAPlayersList.includes(playerId as string) &&
      !teamAPositionSwitchUsed
    );
    const showShuffleB = !!(
      isBiddingPhase &&
      noBidsMade &&
      teamBPlayersList.includes(playerId as string) &&
      !teamBPositionSwitchUsed
    );

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
        {/* ── Hero Table ── */}
        <div className="cardHeight cardTable">
          <div className="cardOnTable">
            {/* Post-raise UI in center */}
            {(() => {
              const { postRaiseDoubleRound, bidRaisePhase, bidRaiseOfferedTo } =
                this.store.game;
              if (postRaiseDoubleRound && isBiddingPhase) {
                return this.renderPostRaiseButtonsInCenter();
              }
              if (
                bidRaisePhase &&
                bidRaiseOfferedTo === playerId &&
                isBiddingPhase
              ) {
                return this.renderBidRaiseUI();
              }
              return null;
            })()}

            {/* Pass / Not Bidding button */}
            {isYourBiddingTurn &&
              !gameStarted &&
              this.state.currentBiddingsuit === "" &&
              !this.store.game.postRaiseDoubleRound &&
              !this.store.game.bidRaisePhase && (
                <div className="pass-button-container">
                  <button
                    className="pass-btn"
                    onClick={this.handleBiddingPass.bind(this)}
                    disabled={this.state.isProcessingAction}
                  >
                    <span className="pass-label">Pass</span>
                    <span className="pass-action">
                      {this.state.isProcessingAction
                        ? "Processing..."
                        : "Not Bidding"}
                    </span>
                  </button>
                </div>
              )}

            {/* Dropped cards on table */}
            {this.renderCards(droppedCards, false, false, dropCardPlayer)}
          </div>

          {/* Round timer — positioned relative to cardTable */}
          {this.state.isRoundReveal && this.state.timerRemaining > 0 && (
            <div className="round-timer">{this.state.timerRemaining}</div>
          )}

          {/* Winner message — centered on cardTable */}
          {isGameComplete && winnerMessage && (
            <div className="game-winner-overlay">
              <div className="winner-title">{winnerMessage}</div>
              {gameCompleteData && (
                <div className="winner-details">
                  <div>Final Bid: {finalBid}</div>
                  <div style={{ color: "#93c5fd" }}>
                    Team A Points: {gameCompleteData.teamAPoints}
                  </div>
                  <div style={{ color: "#86efac" }}>
                    Team B Points: {gameCompleteData.teamBPoints}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Player's Hand — Fan Layout ── */}
        <div className="myCards">
          {this.renderCards(
            cards,
            true,
            false,
            undefined,
            this.state.isRoundReveal && this.state.timerRemaining > 0,
          )}
        </div>

        {/* ── Bidding / Game Phase UI ── */}
        <div style={{ padding: "0 8px" }}>
          {(() => {
            if (isBiddingPhase) {
              return this.renderBiddingUI(isYourBiddingTurn);
            } else {
              return this.renderNormalGameUI();
            }
          })()}
        </div>

        {/* ── Score HUD ── */}
        <div className="score-hud">
          <div className="score-team team-a">
            <span className="score-label">{firstPlayer}'s Team</span>
            <span className="score-value">
              {teamAScore !== undefined ? teamAScore : 10 - Number(gameScore)}
            </span>
          </div>
          <span className="score-vs">VS</span>
          <div className="score-team team-b">
            <span className="score-value">
              {teamBScore !== undefined ? teamBScore : 10 - Number(gameScore)}
            </span>
            <span className="score-label">{lastPlayer}'s Team</span>
          </div>
        </div>
        {isFirstPlayer && !gameStarted && (
          <input
            type="range"
            min="-10"
            max="10"
            step="1"
            value={gameScore}
            className="scoreSlider showSlider"
            id="gameScoreSlider"
            onChange={this.updateScore.bind(this)}
          />
        )}

        {/* ── Team Card Piles ── */}
        <div className="team-piles-row">
          <div className="team-pile">
            <div className="team-pile-header team-a">
              Team A [{firstPlayer} {thirdPlayer} {fifthPlayer}]
              <span
                className="team-pile-points team-a"
                style={
                  isGameComplete && biddingTeam === "A"
                    ? {
                        background: gameCompleteData?.biddingTeamAchievedBid
                          ? "rgba(34, 197, 94, 0.3)"
                          : "rgba(239, 68, 68, 0.3)",
                        color: gameCompleteData?.biddingTeamAchievedBid
                          ? "#86efac"
                          : "#fca5a5",
                      }
                    : {}
                }
              >
                {gameCompleteData ? gameCompleteData.teamAPoints : 0}
              </span>
            </div>
            <div className="teamCards teamACards">
              {this.renderCards(teamACards, false, true)}
            </div>
          </div>
          <div className="team-pile">
            <div className="team-pile-header team-b">
              Team B [{secondPlayer} {fourthPlayer} {lastPlayer}]
              <span
                className="team-pile-points team-b"
                style={
                  isGameComplete && biddingTeam === "B"
                    ? {
                        background: gameCompleteData?.biddingTeamAchievedBid
                          ? "rgba(34, 197, 94, 0.3)"
                          : "rgba(239, 68, 68, 0.3)",
                        color: gameCompleteData?.biddingTeamAchievedBid
                          ? "#86efac"
                          : "#fca5a5",
                      }
                    : {}
                }
              >
                {gameCompleteData ? gameCompleteData.teamBPoints : 0}
              </span>
            </div>
            <div className="teamCards teamBCards">
              {this.renderCards(teamBCards, false, true)}
            </div>
          </div>
        </div>

        {/* ── Game Actions Bar ── */}
        <div className="game-actions-bar">
          <button
            className="game-action-btn"
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
          </button>
          <span className="game-action-sep">or</span>
          <button
            className="game-action-btn"
            onClick={this.viewAllCards.bind(this, gameId)}
            disabled={!(typeof cards === "undefined" || cards.length === 0)}
          >
            View All Cards
          </button>
          {showShuffleA && (
            <>
              <span className="game-action-sep">or</span>
              <button
                className="game-action-btn"
                onClick={this.handleSwitchPositions.bind(this, "A")}
                disabled={this.state.isProcessingAction}
                title="Randomly shuffle Team A seating positions (one-time)"
              >
                Shuffle Team A Seats
              </button>
            </>
          )}
          {showShuffleB && (
            <>
              <span className="game-action-sep">or</span>
              <button
                className="game-action-btn"
                onClick={this.handleSwitchPositions.bind(this, "B")}
                disabled={this.state.isProcessingAction}
                title="Randomly shuffle Team B seating positions (one-time)"
              >
                Shuffle Team B Seats
              </button>
            </>
          )}
          <>
            <span className="game-action-sep">or</span>
            <button
              className={`game-action-btn reconnect-toggle-btn${this.store.showReconnectMode ? " active" : ""}`}
              onClick={() => this.store.toggleReconnectMode()}
              title="Show/hide per-player force-reconnect buttons"
            >
              {this.store.showReconnectMode
                ? "Hide Reconnect"
                : "Show Reconnect"}
            </button>
          </>
        </div>
      </Dimmer.Dimmable>
    );
  }

  private updateScore = (event: any) => {
    this.store.updateGameScore(event.target.value);
  };

  /**
   * Render a read-only spectator view: team roster, table, scores, bid info, card piles.
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

    const teamAPlayers = [firstPlayer, thirdPlayer, fifthPlayer].filter(
      Boolean,
    );
    const teamBPlayers = [secondPlayer, fourthPlayer, lastPlayer].filter(
      Boolean,
    );

    return (
      <div className="spectator-wrapper">
        {/* ── Team Roster Card ── */}
        <div className="spectator-roster">
          <div className="spectator-roster-team team-a">
            <span className="spectator-roster-label">Team A</span>
            <div className="spectator-roster-players">
              {teamAPlayers.map((p) => (
                <span key={p} className="spectator-roster-player team-a">
                  {p}
                </span>
              ))}
            </div>
          </div>
          <div className="spectator-roster-vs">VS</div>
          <div className="spectator-roster-team team-b">
            <span className="spectator-roster-label">Team B</span>
            <div className="spectator-roster-players">
              {teamBPlayers.map((p) => (
                <span key={p} className="spectator-roster-player team-b">
                  {p}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ── Card Table ── */}
        <div className="cardHeight cardTable">
          <div className="cardOnTable">
            {this.renderCards(droppedCards, false, false, dropCardPlayer)}
          </div>

          {this.state.isRoundReveal && this.state.timerRemaining > 0 && (
            <div className="round-timer">{this.state.timerRemaining}</div>
          )}

          {isGameComplete && winnerMessage && (
            <div className="game-winner-overlay">
              <div className="winner-title">{winnerMessage}</div>
              {gameCompleteData && (
                <div className="winner-details">
                  <div>Final Bid: {finalBid}</div>
                  <div style={{ color: "#60a5fa" }}>
                    Team A: {gameCompleteData.teamAPoints} pts
                  </div>
                  <div style={{ color: "#4ade80" }}>
                    Team B: {gameCompleteData.teamBPoints} pts
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Phase Info (bid status / game status) ── */}
        <div className="spectator-phase-info">
          {isBiddingPhase
            ? this.renderSpectatorBiddingInfo()
            : this.renderNormalGameUI()}
        </div>

        {/* ── Score HUD ── */}
        <div className="score-hud">
          <div className="score-team team-a">
            <span className="score-label">{firstPlayer}'s Team</span>
            <span className="score-value">
              {teamAScore !== undefined ? teamAScore : 10 - Number(gameScore)}
            </span>
          </div>
          <span className="score-vs">VS</span>
          <div className="score-team team-b">
            <span className="score-value">
              {teamBScore !== undefined ? teamBScore : 10 - Number(gameScore)}
            </span>
            <span className="score-label">{lastPlayer}'s Team</span>
          </div>
        </div>

        {/* ── Team Card Piles ── */}
        <div className="team-piles-row">
          <div className="team-pile">
            <div
              className={`team-pile-header team-a${isGameComplete && biddingTeam === "A" ? (gameCompleteData?.biddingTeamAchievedBid ? " result-win" : " result-lose") : ""}`}
            >
              <span className="team-pile-name">
                Team A &middot; {teamAPlayers.join(" · ")}
              </span>
              <span className="team-pile-points team-a">
                {gameCompleteData ? gameCompleteData.teamAPoints : 0}
              </span>
            </div>
            <div className="teamCards teamACards">
              {this.renderCards(teamACards, false, true)}
            </div>
          </div>
          <div className="team-pile">
            <div
              className={`team-pile-header team-b${isGameComplete && biddingTeam === "B" ? (gameCompleteData?.biddingTeamAchievedBid ? " result-win" : " result-lose") : ""}`}
            >
              <span className="team-pile-name">
                Team B &middot; {teamBPlayers.join(" · ")}
              </span>
              <span className="team-pile-points team-b">
                {gameCompleteData ? gameCompleteData.teamBPoints : 0}
              </span>
            </div>
            <div className="teamCards teamBCards">
              {this.renderCards(teamBCards, false, true)}
            </div>
          </div>
        </div>
      </div>
    );
  }

  /**
   * Render bid info panel for spectators during the bidding phase.
   */
  private renderSpectatorBiddingInfo() {
    const { bidHistory, currentBiddingPlayerId, bidDouble, bidReDouble } =
      this.store.game;
    let lastBidText = "No bids yet";
    let lastBidPlayerId = "";
    if (bidHistory && bidHistory.length > 0) {
      for (let i = bidHistory.length - 1; i >= 0; i--) {
        const entry = bidHistory[i] as any;
        if (entry.action === "bid") {
          lastBidText = `${entry.playerId}  ${entry.bidValue}${entry.suit ? " " + entry.suit : ""}`;
          lastBidPlayerId = entry.playerId || "";
          if (bidDouble) {
            lastBidText += " · Double";
          }
          if (bidReDouble) {
            lastBidText += " · Re-Double";
          }
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
        ? "#93c5fd"
        : currentTurnTeam === "B"
          ? "#86efac"
          : "#e2e8f0";
    const lastBidColor =
      lastBidTeam === "A"
        ? "#93c5fd"
        : lastBidTeam === "B"
          ? "#86efac"
          : "#94a3b8";
    const teamBadge = currentTurnTeam ? (
      <span
        className={`spectator-team-badge team-${currentTurnTeam.toLowerCase()}`}
      >
        Team {currentTurnTeam}
      </span>
    ) : null;

    return (
      <div className="spectator-bid-card">
        <div className="spectator-bid-card-title">🎯 Bidding in progress</div>
        <div className="spectator-bid-row">
          <span className="spectator-bid-key">Current turn</span>
          <span
            className="spectator-bid-val"
            style={{ color: currentTurnColor }}
          >
            {currentBiddingPlayerId} {teamBadge}
          </span>
        </div>
        <div className="spectator-bid-row">
          <span className="spectator-bid-key">Last bid</span>
          <span className="spectator-bid-val" style={{ color: lastBidColor }}>
            {lastBidText}
          </span>
        </div>
      </div>
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
    const { bidRaisePhase, bidRaiseOfferedTo, postRaiseDoubleRound } =
      this.store.game;
    const playerId = this.store.user.playerId as string;

    // Bid raise phase is rendered inside cardOnTable via renderBidRaiseUI()
    if (bidRaisePhase && bidRaiseOfferedTo === playerId) {
      return null;
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

    return (
      <>
        {/* Bid status bar */}
        <div className="bid-status-bar">
          <div
            className={`bid-status-chip ${
              hasActualBid
                ? lastBidTeam === "A"
                  ? "team-a"
                  : lastBidTeam === "B"
                    ? "team-b"
                    : ""
                : ""
            }`}
          >
            {hasActualBid
              ? `${lastBiddingPlayer} → ${this.formatBidDisplay(
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
          </div>
          {isYourBiddingTurn && (
            <div
              className={`bid-status-chip ${
                myTeam === "A" ? "team-a" : myTeam === "B" ? "team-b" : ""
              }`}
            >
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
            </div>
          )}
        </div>

        {isYourBiddingTurn && (
          <div className="bidding-dashboard">
            {/* Bid Value Grid (28-56) */}
            <div className="bid-number-grid">
              {Array.from({ length: 29 }, (_, i) => 28 + i).map((bidValue) => {
                const isDisabled = hasActualBid && bidValue <= lastBidValue;
                const bidMaxedOut = lastBidValue >= 56;
                return (
                  <button
                    key={bidValue}
                    className={`bid-num-btn ${
                      currentBiddingValue === bidValue ? "selected" : ""
                    }`}
                    disabled={isDisabled || bidMaxedOut}
                    onClick={() =>
                      this.handleBidNumberClick(
                        bidValue,
                        lastBidValue,
                        lastBidsuit,
                      )
                    }
                  >
                    {bidValue}
                  </button>
                );
              })}
              <button
                className="bid-num-btn modifier"
                onClick={() => this.handleModifierClick(0)}
                disabled={currentBiddingValue > 55 || lastBidValue >= 56}
              >
                +
              </button>
              {[1, 2, 3, 4, 5].map((mod) => (
                <button
                  key={`+${mod}`}
                  className="bid-num-btn modifier"
                  onClick={() => this.handleModifierClick(mod)}
                  disabled={
                    currentBiddingValue > 56 - mod || lastBidValue >= 56
                  }
                >
                  +{mod}
                </button>
              ))}
              <button
                className="bid-num-btn reset"
                onClick={() => this.handleResetBid()}
              >
                Reset
              </button>
            </div>

            {/* Suit Selection Pills */}
            <div className="suit-selection-row">
              {suits.map((suit) => {
                const isSuitAvailable = this.hasSuitInHand(suit.name);
                const isSelected = currentBiddingsuit === suit.name;
                const bidMaxedOut = lastBidValue >= 56;
                const suitColorClass =
                  suit.name === "H" || suit.name === "D" ? "red" : "silver";
                return (
                  <button
                    key={suit.name}
                    className={`suit-pill ${suitColorClass} ${
                      isSelected ? "selected" : ""
                    }`}
                    disabled={!isSuitAvailable || bidMaxedOut}
                    onClick={() => this.handleBiddingSuitClick(suit.name)}
                    title={suit.label}
                  >
                    {suit.label} {suit.symbol}
                  </button>
                );
              })}
              {noTrumpTypes.map((type) => {
                const isSelected =
                  currentBiddingsuit === "N" && noTrumpType === type.name;
                const bidMaxedOut = lastBidValue >= 56;
                return (
                  <button
                    key={type.name}
                    className={`suit-pill purple ${
                      isSelected ? "selected" : ""
                    }`}
                    disabled={bidMaxedOut}
                    onClick={() =>
                      this.handleNoTrumpTypeClick(
                        type.name as "Noes" | "Pass" | "No-Trump",
                      )
                    }
                    title={type.label}
                  >
                    {type.label}
                  </button>
                );
              })}
            </div>

            {/* Action Buttons */}
            <div className="bid-actions-row">
              <button
                className="action-pill bid"
                onClick={this.handleBiddingDone.bind(this)}
                disabled={
                  !hasPlayerMadeSelections ||
                  lastBidValue >= 56 ||
                  this.state.isProcessingAction
                }
              >
                ➜ {this.state.isProcessingAction ? "Processing..." : "BID"}
              </button>
              {(() => {
                const currentPlayerTeam = this.getPlayerTeam(
                  this.store.user.playerId as string,
                );
                const { lastBiddingTeam } = this.store.game;
                const canDouble =
                  hasActualBid &&
                  lastBidValue > 0 &&
                  !bidDouble &&
                  !bidReDouble &&
                  currentPlayerTeam &&
                  lastBiddingTeam &&
                  currentPlayerTeam !== lastBiddingTeam;
                const canReDouble =
                  bidDouble &&
                  !bidReDouble &&
                  currentPlayerTeam &&
                  lastBiddingTeam &&
                  currentPlayerTeam === lastBiddingTeam;

                return (
                  <>
                    {canDouble && (
                      <button
                        className="action-pill double"
                        onClick={this.handleBiddingDouble.bind(this)}
                        disabled={this.state.isProcessingAction}
                      >
                        ⚡{" "}
                        {this.state.isProcessingAction
                          ? "Processing..."
                          : "Double"}
                      </button>
                    )}
                    {canReDouble && (
                      <button
                        className="action-pill re-double"
                        onClick={this.handleBiddingReDouble.bind(this)}
                        disabled={this.state.isProcessingAction}
                      >
                        ♚{" "}
                        {this.state.isProcessingAction
                          ? "Processing..."
                          : "Re-Double"}
                      </button>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
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
        ? `${playerName}'s bid → ${suitDisplay} [${bidValue}]${
            bidDouble ? " (Double)" : ""
          }${bidReDouble ? " (Re-Double)" : ""}`
        : "Game Starting...";

    const bidTeamClass =
      biddingTeam === "A" ? "team-a" : biddingTeam === "B" ? "team-b" : "";

    return <div className={`bid-info-bar ${bidTeamClass}`}>{label}</div>;
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

  private renderBidRaiseUI() {
    const { currentBet, trumpSuit } = this.store.game;
    const currentBidValue = parseInt(currentBet || "28");
    const availableLevels: number[] = [];

    if (currentBidValue < 40) {
      availableLevels.push(40, 48, 56);
    } else if (currentBidValue < 48) {
      availableLevels.push(48, 56);
    } else if (currentBidValue < 56) {
      availableLevels.push(56);
    }

    const suitNameMap: Record<string, string> = {
      H: "Hearts ♥",
      E: "Spades ♠",
      D: "Diamonds ♦",
      C: "Clubs ♣",
      N: "Noes",
    };
    const suitDisplay =
      (trumpSuit && suitNameMap[trumpSuit]) || trumpSuit || "";

    return (
      <div className="raiseYourBidContainer">
        <h2 style={{ marginBottom: "20px" }}>Raise your Bid?</h2>
        <p style={{ marginBottom: "10px" }}>
          You won the bidding with{" "}
          <strong>
            {currentBidValue} {suitDisplay}
          </strong>
        </p>
        <p style={{ marginBottom: "20px", fontSize: "14px", color: "#ccc" }}>
          You can raise your bid to a higher level for the same suit
        </p>
        <div className="bid-actions-row" style={{ marginBottom: "20px" }}>
          {availableLevels.map((level) => (
            <button
              key={level}
              className="action-pill bid"
              style={{ margin: "5px" }}
              onClick={() => this.handleRaiseBid(level)}
              disabled={this.state.isProcessingAction}
            >
              {this.state.isProcessingAction
                ? "Processing..."
                : `Raise to ${level}`}
            </button>
          ))}
        </div>
        <button
          className="action-pill pass"
          onClick={this.handleSkipRaise.bind(this)}
          disabled={this.state.isProcessingAction}
        >
          {this.state.isProcessingAction
            ? "Processing..."
            : "Skip - Start Game"}
        </button>
      </div>
    );
  }

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
    const raisedBidTeamClass =
      raisedBidTeam === "A" ? "team-a" : raisedBidTeam === "B" ? "team-b" : "";

    return (
      <>
        <div className={`bid-info-bar ${raisedBidTeamClass}`}>
          {`${lastBiddingPlayer} raised bid → ${suitDisplay} [${lastBidValue}]`}
          {bidDouble && " (Double)"}
          {bidReDouble && " (Re-Double)"}
        </div>
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
            backgroundColor: "rgba(59, 130, 246, 0.88)",
            boxShadow: "0 10px 30px rgba(59, 130, 246, 0.35)",
          }
        : lastBiddingTeam === "B"
          ? {
              backgroundColor: "rgba(34, 197, 94, 0.88)",
              boxShadow: "0 10px 30px rgba(34, 197, 94, 0.35)",
            }
          : {
              backgroundColor: "rgba(245, 158, 11, 0.88)",
              boxShadow: "0 10px 30px rgba(245, 158, 11, 0.3)",
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
      return (
        <div
          className="post-raise-center handleBiddingPassPostRaise"
          style={postRaiseTheme}
        >
          <strong style={{ fontSize: "15px" }}>Post-Raise Round</strong>
          <p
            style={{
              fontSize: "12px",
              marginTop: "6px",
              marginBottom: "4px",
              opacity: 0.9,
            }}
          >
            {lastBiddingPlayer} raised bid → {suitDisplay} [{lastBidValue}]
          </p>
          <p style={{ fontSize: "11px", marginTop: "4px", opacity: 0.75 }}>
            Waiting for {currentBiddingPlayerId}...
          </p>
        </div>
      );
    }

    return (
      <div
        className="post-raise-center handleBiddingPassPostRaise"
        style={postRaiseTheme}
      >
        <strong style={{ fontSize: "15px" }}>Post-Raise Round</strong>
        <p
          style={{
            fontSize: "12px",
            marginTop: "6px",
            marginBottom: "4px",
            opacity: 0.9,
          }}
        >
          {lastBiddingPlayer} raised bid → {suitDisplay} [{lastBidValue}]
          {bidDouble && " (Double)"}
          {bidReDouble && " (Re-Double)"}
        </p>
        <p
          style={{
            fontSize: "11px",
            marginTop: "4px",
            marginBottom: "12px",
            opacity: 0.75,
          }}
        >
          {isOpponentTeam && !bidDouble && "You can Double or Pass"}
          {isBiddingTeam && bidDouble && "You can Re-Double or Pass"}
        </p>
        <div className="bid-actions-row">
          <button
            className="action-pill pass"
            onClick={this.handleBiddingPass.bind(this)}
          >
            Pass
          </button>
          {isOpponentTeam && !bidDouble && !bidReDouble && (
            <button
              className="action-pill double"
              onClick={this.handleBiddingDouble.bind(this)}
            >
              ⚡ Double
            </button>
          )}
          {isBiddingTeam && bidDouble && !bidReDouble && (
            <button
              className="action-pill re-double"
              onClick={this.handleBiddingReDouble.bind(this)}
            >
              ♚ Re-Double
            </button>
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
