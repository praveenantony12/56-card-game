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
    const { players, currentPlayerId, isBiddingPhase, currentBiddingPlayerId } =
      this.gameInfo;
    const { droppedCards } = this.store.game;

    const canSelectPlayer =
      typeof droppedCards === "undefined" || droppedCards.length === 0;

    if (!players) {
      return null;
    }

    const rows = players.map((player) => {
      const isCurrentBiddingPlayer =
        isBiddingPhase && player === currentBiddingPlayerId;
      const status = isBiddingPhase
        ? isCurrentBiddingPlayer
          ? "Bid"
          : "Wait to Bid"
        : player === currentPlayerId
        ? "Play"
        : "Wait";

      return (
        <Grid.Column textAlign="center" key={player}>
          {/* <Segment
            color={currentPlayerStrikeHighLightColor(player)}
            id="players-list"
          > */}
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
              <Icon name={player.startsWith("Bot_") ? "user secret" : "user"} />
              {player}
            </Button>
            <Label
              as="a"
              color={
                isBiddingPhase
                  ? isCurrentBiddingPlayer
                    ? "yellow"
                    : "grey"
                  : player === currentPlayerId
                  ? "red"
                  : "black"
              }
              pointing="left"
            >
              {status}
            </Label>
          </Button>
          {/* </Segment> */}
        </Grid.Column>
      );
    });

    return (
      <Grid className="playersGrid" columns="equal">
        <Grid.Row>{rows}</Grid.Row>
      </Grid>
    );
  }
}

export default PlayersList;
