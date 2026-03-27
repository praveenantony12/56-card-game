import React, { useState, useEffect } from "react";
import {
  Button,
  Container,
  Header,
  Segment,
  Message,
  Input,
} from "semantic-ui-react";
import gameStore from "../stores/store";

interface GameModeSelectionProps {
  onCreateGame: () => void;
  onJoinGame: (gameId: string) => void;
  onWatchGame: (gameId: string) => void;
  onFindMatch: () => void;
}

const GameModeSelection: React.FC<GameModeSelectionProps> = ({
  onCreateGame,
  onJoinGame,
  onWatchGame,
  onFindMatch,
}) => {
  const [selectedMode, setSelectedMode] = useState<
    "create" | "join" | "watch" | null
  >(null);
  const [gameId, setGameId] = useState("");
  const [error, setError] = useState("");

  // Check if gameId was set from URL parameters and pre-select join mode
  useEffect(() => {
    if (gameStore.game.gameIdToJoin && gameStore.game.gameMode === "join") {
      setSelectedMode("join");
      setGameId(gameStore.game.gameIdToJoin);
    }
  }, []);

  const handleCreateGame = () => {
    setSelectedMode("create");
    onCreateGame();
  };

  const handleFindMatch = () => {
    onFindMatch();
  };

  const handleJoinGame = () => {
    if (!gameId.trim()) {
      setError("Please enter a valid Game ID");
      return;
    }
    setError("");
    onJoinGame(gameId.trim());
  };

  const handleWatchGame = () => {
    if (!gameId.trim()) {
      setError("Please enter a valid Game ID");
      return;
    }
    setError("");
    onWatchGame(gameId.trim());
  };

  const handleGameIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setGameId(e.target.value);
    if (error) setError("");
  };

  // Only return null when creating a game - parent handles the next step
  if (selectedMode === "create") {
    return null;
  }

  return (
    <Container style={{ marginTop: "50px", maxWidth: "500px" }}>
      <Segment
        style={{ background: `url(./images/background_white.jpg)` }}
        raised
        padded
      >
        <Header as="h1" textAlign="center" color="blue">
          56 Card Game
        </Header>

        {!selectedMode ? (
          <div style={{ textAlign: "center", marginTop: "30px" }}>
            <Header as="h5">Choose Game Mode</Header>

            <Button
              size="large"
              color="green"
              onClick={handleCreateGame}
              style={{ width: "100%", marginBottom: "20px" }}
            >
              Create New Game
            </Button>

            <Button
              size="large"
              color="blue"
              onClick={() => setSelectedMode("join")}
              style={{ width: "100%", marginBottom: "20px" }}
            >
              Join Existing Game
            </Button>
            <Button
              size="large"
              color="teal"
              onClick={() => setSelectedMode("watch")}
              style={{ width: "100%", marginBottom: "20px" }}
            >
              Watch a Game
            </Button>

            {/* ── Join a Table (lobby) ── */}
            <div
              style={{
                background: "linear-gradient(135deg, #1a1a2e, #0f3460)",
                borderRadius: "10px",
                padding: "18px 16px",
                marginTop: "4px",
              }}
            >
              <p
                style={{
                  color: "#90caf9",
                  fontSize: "13px",
                  margin: "0 0 10px",
                }}
              >
                Step into the lobby and start playing with 5 other players. The
                game begins automatically when the table is full.
              </p>
              <Button
                size="large"
                color="violet"
                onClick={handleFindMatch}
                style={{ width: "100%" }}
              >
                🔍&nbsp; Join a Table
              </Button>
            </div>
          </div>
        ) : selectedMode === "join" ? (
          <div style={{ marginTop: "20px" }}>
            <h3>Join Existing Game</h3>
            <div>
              <label
                htmlFor="gameIdInput"
                style={{
                  display: "block",
                  marginBottom: "5px",
                  fontWeight: "bold",
                }}
              >
                Game ID
              </label>
              <Input focus placeholder="Search..." />
              <input
                id="gameIdInput"
                name="gameId"
                type="text"
                placeholder="Enter the Game ID shared by the game creator"
                value={gameId}
                onChange={handleGameIdChange}
                style={{
                  width: "90%",
                  height: "40px",
                  padding: "12px",
                  border: "2px solid #2185d0",
                  borderRadius: "4px",
                  fontSize: "16px",
                  display: "block",
                  visibility: "visible",
                  opacity: "1",
                  backgroundColor: "#ffffff",
                  color: "#333333",
                  boxSizing: "border-box",
                  marginBottom: "10px",
                }}
              />
              {error && (
                <div
                  style={{
                    color: "#e74c3c",
                    backgroundColor: "#fdf2f2",
                    border: "1px solid #e74c3c",
                    borderRadius: "4px",
                    padding: "10px",
                    marginTop: "10px",
                  }}
                >
                  {error}
                </div>
              )}
            </div>

            <div style={{ marginTop: "4rem" }}>
              <button
                onClick={handleJoinGame}
                disabled={!gameId.trim()}
                style={{
                  backgroundColor: !gameId.trim() ? "#cccccc" : "#2185d0",
                  color: "white",
                  border: "none",
                  padding: "12px 24px",
                  borderRadius: "4px",
                  fontSize: "14px",
                  cursor: !gameId.trim() ? "not-allowed" : "pointer",
                  marginRight: "10px",
                }}
              >
                Join Game
              </button>
              <button
                onClick={() => setSelectedMode(null)}
                style={{
                  backgroundColor: "transparent",
                  color: "#2185d0",
                  border: "1px solid #2185d0",
                  padding: "12px 24px",
                  borderRadius: "4px",
                  fontSize: "14px",
                  cursor: "pointer",
                }}
              >
                Back
              </button>
            </div>
          </div>
        ) : (
          /* Watch mode */
          <div style={{ marginTop: "20px" }}>
            <h3>Watch a Game</h3>
            <p
              style={{ color: "#666", marginBottom: "15px", fontSize: "14px" }}
            >
              Enter a Game ID to watch an ongoing game. You will be able to see
              the table, bids, scores and cards played, but not players' hands.
            </p>
            <div>
              <label
                htmlFor="watchGameIdInput"
                style={{
                  display: "block",
                  marginBottom: "5px",
                  fontWeight: "bold",
                }}
              >
                Game ID
              </label>
              <input
                id="watchGameIdInput"
                name="watchGameId"
                type="text"
                placeholder="Enter the Game ID to watch"
                value={gameId}
                onChange={handleGameIdChange}
                style={{
                  width: "90%",
                  height: "40px",
                  padding: "12px",
                  border: "2px solid #00b5ad",
                  borderRadius: "4px",
                  fontSize: "16px",
                  display: "block",
                  visibility: "visible",
                  opacity: "1",
                  backgroundColor: "#ffffff",
                  color: "#333333",
                  boxSizing: "border-box",
                  marginBottom: "10px",
                }}
              />
              {error && (
                <div
                  style={{
                    color: "#e74c3c",
                    backgroundColor: "#fdf2f2",
                    border: "1px solid #e74c3c",
                    borderRadius: "4px",
                    padding: "10px",
                    marginTop: "10px",
                  }}
                >
                  {error}
                </div>
              )}
            </div>

            <div style={{ marginTop: "4rem" }}>
              <button
                onClick={handleWatchGame}
                disabled={!gameId.trim()}
                style={{
                  backgroundColor: !gameId.trim() ? "#cccccc" : "#00b5ad",
                  color: "white",
                  border: "none",
                  padding: "12px 24px",
                  borderRadius: "4px",
                  fontSize: "14px",
                  cursor: !gameId.trim() ? "not-allowed" : "pointer",
                  marginRight: "10px",
                }}
              >
                Watch Game
              </button>
              <button
                onClick={() => setSelectedMode(null)}
                style={{
                  backgroundColor: "transparent",
                  color: "#00b5ad",
                  border: "1px solid #00b5ad",
                  padding: "12px 24px",
                  borderRadius: "4px",
                  fontSize: "14px",
                  cursor: "pointer",
                }}
              >
                Back
              </button>
            </div>
          </div>
        )}
      </Segment>
    </Container>
  );
};

export default GameModeSelection;
