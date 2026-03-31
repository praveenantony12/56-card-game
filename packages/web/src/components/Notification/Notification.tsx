import { inject, observer } from "mobx-react";
import * as React from "react";

import { IStore } from "../../stores/IStore";

import "./notification.css";

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

    // Handle position switch request notifications
    if (
      notification &&
      typeof notification === "object" &&
      notification.action === "POSITION_SWITCH_REQUEST"
    ) {
      return this.renderPositionSwitchRequest(notification.data);
    }

    // Handle regular notifications
    const message =
      error ||
      (typeof notification === "string"
        ? notification
        : notification?.message || "Unnkown notification");

    return (
      <div className="notif-bar warn">
        <button className="notif-dismiss" onClick={this.handleDismiss}>
          ✕
        </button>
        <div className="notif-header">Game notification!</div>
        <div className="notif-body">
          <p>{message}</p>
        </div>
      </div>
    );
  }

  private renderReconnectionRequest(data: any) {
    return (
      <div className="notif-bar info">
        <div className="notif-header">Player Reconnection Request</div>
        <div className="notif-body">
          <p>
            Player "{data.playerName}" wants to rejoin the game. Do you approve?
          </p>
        </div>
        <div className="notif-actions">
          <button
            className="notif-btn approve"
            onClick={() => this.handleReconnectionApproval(data.playerId, true)}
          >
            Approve
          </button>
          <button
            className="notif-btn deny"
            onClick={() =>
              this.handleReconnectionApproval(data.playerId, false)
            }
          >
            Deny
          </button>
        </div>
      </div>
    );
  }

  private renderForfeitRequest(data: any) {
    return (
      <div className="notif-bar warn">
        <div className="notif-header">Game Forfeit Request</div>
        <div className="notif-body">
          <p>
            Player "{data.requestedBy}" from {data.team} has requested to
            forfeit the game.
          </p>
          <p>Do you approve? All team members must approve to forfeit.</p>
        </div>
        <div className="notif-actions">
          <button
            className="notif-btn approve"
            onClick={() => this.handleForfeitApproval(true)}
          >
            Approve Forfeit
          </button>
          <button
            className="notif-btn deny"
            onClick={() => this.handleForfeitApproval(false)}
          >
            Deny Forfeit
          </button>
        </div>
      </div>
    );
  }

  private renderForfeitWaiting(data: any) {
    return (
      <div className="notif-bar info">
        <div className="notif-header">Forfeit Request Sent</div>
        <div className="notif-body">
          <p>{data.message}</p>
        </div>
      </div>
    );
  }

  private renderForfeitApprovalUpdate(data: any) {
    return (
      <div className="notif-bar info">
        <div className="notif-header">Forfeit Approval Progress</div>
        <div className="notif-body">
          <p>
            Approvals: {data.approvedCount} / {data.totalNeeded}
          </p>
        </div>
      </div>
    );
  }

  private renderGameForfeited(data: any) {
    return (
      <div className="notif-bar error">
        <div className="notif-header">Game Forfeited!</div>
        <div className="notif-body">
          <p>{data.message}</p>
          <p>Team A Score: {data.teamAScore}</p>
          <p>Team B Score: {data.teamBScore}</p>
        </div>
      </div>
    );
  }

  private handleReconnectionApproval = async (
    playerId: string,
    approve: boolean,
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

  private renderPositionSwitchRequest(data: any) {
    return (
      <div className="notif-bar info">
        <div className="notif-header">Team Seating Shuffle Request</div>
        <div className="notif-body">
          <p>{data.message}</p>
        </div>
        <div className="notif-actions">
          <button
            className="notif-btn approve"
            onClick={() => this.handlePositionSwitchApproval(true)}
          >
            Approve
          </button>
          <button
            className="notif-btn deny"
            onClick={() => this.handlePositionSwitchApproval(false)}
          >
            Deny
          </button>
        </div>
      </div>
    );
  }

  private handlePositionSwitchApproval = async (approve: boolean) => {
    try {
      await this.store.approvePositionSwitch(approve);
      this.store.clearNotifications();
    } catch (error) {
      console.error("Error handling position switch approval: ", error);
    }
  };

  private handleDismiss = () => {
    this.store.clearNotifications();
  };
}

export default Notification;
