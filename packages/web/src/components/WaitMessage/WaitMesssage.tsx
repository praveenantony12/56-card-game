import { inject, observer } from "mobx-react";
import * as React from "react";
import { Icon, Message } from "semantic-ui-react";
import { IStore } from "../../stores/IStore";
import { IGame } from "../../stores/models/IGameInfo";
import { IUser } from "../../stores/models/IUserInfo";

interface IProps {
  store?: IStore;
}

@inject("store")
@observer
class WaitMesssage extends React.Component<IProps, {}> {
  private get store(): IStore {
    return this.props.store as IStore;
  }

  private get gameInfo(): IGame {
    return this.store.game;
  }

  private get userInfo(): IUser {
    return this.store.user;
  }

  public render() {
    if (this.store.isPendingReconnectionApproval) {
      return (
        <Message icon={true} info>
          <Icon name="clock outline" />
          <Message.Content>
            <Message.Header>Waiting for approval</Message.Header>
            Your reconnection request has been sent to other players for approval.
          </Message.Content>
        </Message>
      );
    }

    return (
      <Message icon={true} hidden={!this.canShowWaitMessage}>
        <Icon name="circle notched" loading={true} />
        <Message.Content>
          <Message.Header>Please wait.</Message.Header>
          We will connect you to play once all the players join.
        </Message.Content>
      </Message>
    );
  }

  private get canShowWaitMessage() {
    return this.userInfo.isSignedIn && !this.gameInfo.canStartGame;
  }
}

export default WaitMesssage;
