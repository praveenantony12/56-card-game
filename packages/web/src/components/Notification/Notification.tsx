import { inject, observer } from "mobx-react";
import * as React from "react";
import { Button, Message } from "semantic-ui-react";

import { IStore } from "../../stores/IStore";

interface IProps {
  store?: IStore;
}

@inject("store")
@observer
class Notification extends React.Component<IProps, {}> {
  private get store(): IStore {
    return this.props.store as IStore;
  }

  public render() {
    const { error, notification } = this.store.game;

    if (!error && !notification) {
      return null;
    }

    // Handle reconnection request notifications
    if (
      notification &&
      typeof notification === "object" &&
      notification.action === "reconnection_request"
    ) {
      return this.renderReconnectionRequest(notification.data);
    }

    // Handle forfeit request notifications
    if (
      notification &&
      typeof notification === "object" &&
      notification.action === "FORFEIT_REQUEST"
    ) {
      return this.renderForfeitRequest(notification.data);
    }

    // Handle forfeit waiting notifications
    if (
      notification &&
      typeof notification === "object" &&
      notification.action === "FORFEIT_WAITING"
    ) {
      return this.renderForfeitWaiting(notification.data);
    }

    // Handle forfeit approval update notifications
    if (
      notification &&
      typeof notification === "object" &&
      notification.action === "FORFEIT_APPROVAL_UPDATE"
    ) {
      return this.renderForfeitApprovalUpdate(notification.data);
    }

    // Handle game forfeited notifications
    if (
      notification &&
      typeof notification === "object" &&
      notification.action === "GAME_FORFEITED"
    ) {
      return this.renderGameForfeited(notification.data);
    }

    // Handle regular notifications
    const message =
      error ||
      (typeof notification === "string"
        ? notification
        : notification?.message || "Unnkown notification");

    return (
      <Message warning={true} onDismiss={this.handleDismiss}>
        <Message.Header>Game notification!</Message.Header>
        <p>{message}</p>
      </Message>
    );
  }

  private renderReconnectionRequest(data: any) {
    return (
      <Message info>
        <Message.Header>Player Reconnection Request</Message.Header>
        <p>
          Player "{data.playerName}" wants to rejoin the game. Do you approve?
        </p>
        <Button.Group>
          <Button
            positive
            onClick={() => this.handleReconnectionApproval(data.playerId, true)}
          >
            Approve
          </Button>
          <Button
            negative
            onClick={() =>
              this.handleReconnectionApproval(data.playerId, false)
            }
          >
            Deny
          </Button>
        </Button.Group>
      </Message>
    );
  }

  private renderForfeitRequest(data: any) {
    return (
      <Message warning>
        <Message.Header>Game Forfeit Request</Message.Header>
        <p>
          Player "{data.requestedBy}" from {data.team} has requested to forfeit
          the game.
        </p>
        <p>Do you approve? All team members must approve to forfeit.</p>
        <Button.Group>
          <Button positive onClick={() => this.handleForfeitApproval(true)}>
            Approve Forfeit
          </Button>
          <Button negative onClick={() => this.handleForfeitApproval(false)}>
            Deny Forfeit
          </Button>
        </Button.Group>
      </Message>
    );
  }

  private renderForfeitWaiting(data: any) {
    return (
      <Message info>
        <Message.Header>Forfeit Request Sent</Message.Header>
        <p>{data.message}</p>
      </Message>
    );
  }

  private renderForfeitApprovalUpdate(data: any) {
    return (
      <Message info>
        <Message.Header>Forfeit Approval Progress</Message.Header>
        <p>
          Approvals: {data.approvedCount} / {data.totalNeeded}
        </p>
      </Message>
    );
  }

  private renderGameForfeited(data: any) {
    return (
      <Message error>
        <Message.Header>Game Forfeited!</Message.Header>
        <p>{data.message}</p>
        <p>Team A Score: {data.teamAScore}</p>
        <p>Team B Score: {data.teamBScore}</p>
      </Message>
    );
  }

  private handleReconnectionApproval = async (
    playerId: string,
    approve: boolean
  ) => {
    try {
      if (approve) {
        await this.store.approveReconnection(playerId);
      } else {
        await this.store.denyReconnection(playerId);
      }
    } catch (error) {
      console.error("Error handling reconnection approval: ", error);
    }
  };

  private handleForfeitApproval = async (approve: boolean) => {
    try {
      if (approve) {
        await this.store.approveForfeit();
      } else {
        await this.store.denyForfeit();
      }
    } catch (error) {
      console.error("Error handling forfeit approval: ", error);
    }
  };

  private handleDismiss = () => {
    this.store.clearNotifications();
  };
}

export default Notification;
