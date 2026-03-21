import { inject, observer } from "mobx-react";
import * as React from "react";
import { Button, Grid, Icon, Label } from "semantic-ui-react";
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

    const canSelectPlayer =
      typeof droppedCards === "undefined" || droppedCards.length === 0;

    if (!players) {
      return null;
    }

    const hasGameStarted = droppedCards && droppedCards.length > 0;
    const showStartLabel = isBiddingPhase && !hasGameStarted;

    const rows = players.map((player) => {
      const isCurrentBiddingPlayer =
        isBiddingPhase && player === currentBiddingPlayerId;
      const isStartingPlayer = player === startingPlayerId;
      const status = isBiddingPhase
        ? isCurrentBiddingPlayer
          ? "Bid"
          : "Wait"
        : player === currentPlayerId
          ? "Play"
          : "Wait";

      return (
        <Grid.Column textAlign="center" key={player}>
          <Button
            as="div"
            labelPosition="right"
            disabled={
              isBiddingPhase
                ? isCurrentBiddingPlayer
                  ? false
                  : true
                : canSelectPlayer || player === currentPlayerId
                  ? false
                  : true
            }
            onClick={
              isBiddingPhase
                ? isCurrentBiddingPlayer
                  ? this.handlePlayerSelectClick.bind(this, player)
                  : false
                : canSelectPlayer
                  ? this.handlePlayerSelectClick.bind(this, player)
                  : false
            }
          >
            <Button
              color={
                isBiddingPhase
                  ? isCurrentBiddingPlayer
                    ? "yellow"
                    : "grey"
                  : player === currentPlayerId
                    ? "green"
                    : "white"
              }
            >
              <span className="playerName">{player}</span>
            </Button>
            <Label
              as="a"
              color={
                isBiddingPhase
                  ? isCurrentBiddingPlayer
                    ? "green"
                    : "black"
                  : player === currentPlayerId
                    ? "red"
                    : "black"
              }
              pointing="left"
              className="hiddenOnMobile"
            >
              {status}
            </Label>
          </Button>
          {showStartLabel && isStartingPlayer && (
            <div className="startLabelContainer">
              <Label color="blue" className="startLabel">
                Start
              </Label>
            </div>
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
              background: "linear-gradient(90deg, #00b5ad, #0e6e6a)",
              color: "white",
              padding: "8px 10px",
              fontWeight: "bold",
              fontSize: "14px",
              letterSpacing: "1px",
              borderRadius: "4px",
              marginBottom: "8px",
              textAlign: "center",
            }}
          >
            👀 Spectator Mode - you are watching this game
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
