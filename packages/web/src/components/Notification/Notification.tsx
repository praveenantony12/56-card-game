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
    if (notification && typeof notification === "object" &&
      notification.action === "reconnection_request") {
      return this.renderReconnectionRequest(notification.data);
    }

    // Handle regular notifications
    const message = error ||
      (typeof notification === "string" ?
        notification : notification?.message || "Unnkown notification");

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
        <p>Player "{data.playerName}" wants to rejoin the game. Do you approve?</p>
        <Button.Group>
          <Button
            positive
            onClick={() => this.handleReconnectionApproval(data.playerId, true)}
          >
            Approve
          </Button>
          <Button
            negative
            onClick={() => this.handleReconnectionApproval(data.playerId, false)}
          >
            Deny
          </Button>
        </Button.Group>
      </Message>
    )
  }

  private handleReconnectionApproval = async (playerId: string, approve: boolean) => {
    try {
      if (approve) {
        await this.store.approveReconnection(playerId);
      } else {
        await this.store.denyReconnection(playerId);
      }
    } catch (error) {
      console.error('Error handling reconnection approval: ', error);
    }
  }

  private handleDismiss = () => {
    this.store.clearNotifications();
  };
}

export default Notification;
