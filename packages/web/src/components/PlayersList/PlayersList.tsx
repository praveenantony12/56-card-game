import { inject, observer } from "mobx-react";
import * as React from "react";
import { Button, Grid, Label } from "semantic-ui-react";
import { IStore } from "../../stores/IStore";
import { IGame } from "../../stores/models/IGameInfo";

import "./players-list.css";

interface IProps {
  store?: IStore;
}

@inject("store")
@observer
class PlayersList extends React.Component<IProps, {}> {
  private get store(): IStore {
    return this.props.store as IStore;
  }

  private getPlayerTeam(playerId: string): "A" | "B" | null {
    const { players } = this.gameInfo;
    if (!players) {
      return null;
    }

    const index = players.findIndex((player) => player === playerId);
    if (index === -1) {
      return null;
    }

    return index % 2 === 0 ? "A" : "B";
  }

  private get gameInfo(): IGame {
    return this.store.game;
  }

  public render() {
    return this.renderList();
  }

  private handlePlayerSelectClick = (playerId: string) => {
    this.store.selectPlayer(playerId);
  };

  private renderList() {
    const {
      players,
      currentPlayerId,
      isBiddingPhase,
      currentBiddingPlayerId,
      startingPlayerId,
    } = this.gameInfo;
    const { droppedCards } = this.store.game;
    const selfPlayerId = this.store.user.playerId as string;

    if (!players) {
      return null;
    }

    const hasGameStarted = !!(droppedCards && droppedCards.length > 0);
    const showStartLabel = isBiddingPhase && !hasGameStarted;

    const rows = players.map((player) => {
      const isCurrentBiddingPlayer =
        isBiddingPhase && player === currentBiddingPlayerId;
      const isStartingPlayer = player === startingPlayerId;
      const playerTeam = this.getPlayerTeam(player);
      const teamClassName =
        playerTeam === "A"
          ? "teamASeat"
          : playerTeam === "B"
            ? "teamBSeat"
            : "";

      // Determine if this player should be the active (clickable) one
      let isActivePlayer: boolean;
      if (isBiddingPhase) {
        // During bidding, only the current bidding player is active
        isActivePlayer = !!isCurrentBiddingPlayer;
      } else if (hasGameStarted) {
        // During gameplay, seats are not clickable — players drop cards directly
        isActivePlayer = false;
      } else {
        // Bidding complete but game not started yet - only starting player is active
        isActivePlayer = !!isStartingPlayer;
      }

      // Visual highlight for current turn (non-clickable indicator)
      const isCurrentTurn =
        hasGameStarted && !!(currentPlayerId && player === currentPlayerId);

      const status = isBiddingPhase
        ? isCurrentBiddingPlayer
          ? "Bid"
          : "Wait"
        : isCurrentTurn
          ? "Play"
          : "Wait";

      // During gameplay, show current turn as visually highlighted but not clickable
      const showHighlighted = isActivePlayer || isCurrentTurn;

      return (
        <Grid.Column textAlign="center" key={player}>
          <Button
            as="div"
            labelPosition="right"
            className={`playerSeat ${teamClassName}`}
            disabled={!showHighlighted}
            onClick={
              isActivePlayer
                ? this.handlePlayerSelectClick.bind(this, player)
                : false
            }
          >
            <Button
              color={
                isBiddingPhase
                  ? isCurrentBiddingPlayer
                    ? playerTeam === "A"
                      ? "blue"
                      : "green"
                    : "grey"
                  : isCurrentTurn
                    ? playerTeam === "A"
                      ? "blue"
                      : "green"
                    : undefined
              }
              className={`playerSeatButton ${teamClassName}`}
            >
              <span className="playerName">{player}</span>
            </Button>
            <Label
              as="a"
              color={playerTeam === "A" ? "blue" : "green"}
              pointing="left"
              className={`hiddenOnMobile playerStatus ${teamClassName}`}
            >
              {status}
            </Label>
          </Button>
          {showStartLabel && isStartingPlayer && (
            <div className="startLabelContainer">
              <Label color="red" className="startLabel">
                Start
              </Label>
            </div>
          )}
          {player !== selfPlayerId && this.store.showReconnectMode && (
            <button
              className="force-reconnect-btn"
              title={`Force reconnect ${player}`}
              onClick={() => this.store.forceReconnect(player)}
            >
              ↺
            </button>
          )}
        </Grid.Column>
      );
    });

    const isSpectator = this.store.user.isSpectator;

    return (
      <>
        {isSpectator && (
          <div
            style={{
              background: "linear-gradient(90deg, #151c22, #0d1218)",
              color: "white",
              padding: "8px 16px",
              fontWeight: "bold",
              fontSize: "14px",
              letterSpacing: "1px",
              borderRadius: "4px",
              marginBottom: "8px",
              textAlign: "center",
              border: "1px solid rgba(33, 133, 208, 0.35)",
              boxShadow: "0 6px 18px rgba(0, 0, 0, 0.35)",
            }}
          >
            👁️ Spectator Mode - you are watching this game
          </div>
        )}
        <Grid className="playersGrid" columns="equal">
          <Grid.Row>{rows}</Grid.Row>
        </Grid>
      </>
    );
  }
}

export default PlayersList;
