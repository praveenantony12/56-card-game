import { inject, observer } from "mobx-react";
import * as React from "react";

import { Button, Form, Input, Menu, Message, Icon } from "semantic-ui-react";
import { IStore } from "../../stores/IStore";
import GameModeSelection from "../GameModeSelection";

import "./header.css";

interface IProps {
  store?: IStore;
}

@inject("store")
@observer
class Header extends React.Component<IProps, {}> {
  private inputRef: any;

  private get store(): IStore {
    return this.props.store as IStore;
  }

  constructor(props: IProps) {
    super(props);
  }

  public render() {
    // Show game mode selection if user hasn't signed in yet and mode selection is active
    if (!this.store.user.isSignedIn && this.store.game.showGameModeSelection) {
      return (
        <GameModeSelection
          onCreateGame={this.onCreateGame}
          onJoinGame={this.onJoinGame}
        />
      );
    }

    return (
      <Menu
        color="orange"
        inverted
        attached={true}
        size="small"
        className={this.store.user.isSignedIn ? "hide" : "show"}
      >
        <Menu.Item active={true}>
          <h5>56</h5>
        </Menu.Item>

        <Menu.Menu position="right">{this.renderMenus()}</Menu.Menu>
      </Menu>
    );
  }

  private onSignIn = async () => {
    await this.store.signIn(this.inputRef.value);

    if (this.inputRef) {
      this.inputRef.value = "";
    }
  };

  private onCreateGame = () => {
    this.store.setGameModeCreate();
  }

  private onJoinGame = (gameId: string) => {
    this.store.setGameModeJoin(gameId);
  }

  private onLeaveGame = () => {
    this.store.leaveGame();
  };

  private onTextRef = (ref: any) => {
    this.inputRef = ref;
  };

  private renderMenus = () => {
    if (this.store.isAttemptingReconnection) {
      return this.reconnectingMessage();
    }

    if (!this.store.user.isSignedIn) {
      return this.signInButton();
    }

    return this.leaveGameButton();
  };

  private reconnectingMessage = () => {
    <Menu.Item>
      <Message info>
        <Icon name="circle notched" loading={true} />
        Reconnecting to the game...
      </Message>
    </Menu.Item>
  }

  private signInButton = () => (
    <Menu.Item>
      <Form className="signin-form">
        <Input action={true} placeholder="Player name">
          <input type="text" ref={this.onTextRef} />
          <Button type="submit" color="black" onClick={this.onSignIn}>
            Sign In
          </Button>
        </Input>
      </Form>
    </Menu.Item>
  );

  private leaveGameButton = () => (
    <Menu.Item>
      <Button color="blue" onClick={this.onLeaveGame}>
        Leave game
      </Button>
    </Menu.Item>
  );
}

export default Header;
