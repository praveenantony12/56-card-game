import React, { useState } from 'react';
import { Button, Container, Header, Segment, Message, Input } from 'semantic-ui-react';

interface GameModeSelectionProps {
    onCreateGame: () => void;
    onJoinGame: (gameId: string) => void;
}

const GameModeSelection: React.FC<GameModeSelectionProps> = ({ onCreateGame, onJoinGame }) => {
    const [selectedMode, setSelectedMode] = useState<'create' | 'join' | null>(null);
    const [gameId, setGameId] = useState('');
    const [error, setError] = useState('');

    const handleCreateGame = () => {
        setSelectedMode('create');
        onCreateGame();
    };

    const handleJoinGame = () => {
        if (!gameId.trim()) {
            setError('Please enter a valid Game ID');
            return;
        }
        setError('');
        onJoinGame(gameId.trim());
    };

    const handleGameIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setGameId(e.target.value);
        if (error) setError('');
    };

    if (selectedMode === 'create') {
        return null; // Let parent component show login form
    }

    return (

        <Container style={{ marginTop: '50px', maxwidth: '500px' }}>

            <Segment raised padded>
                <Header as="h2" textAlign="center" color="blue">
                    Welcome to Card Game
                </Header >

                {!selectedMode ? (
                    <div style={{ textAlign: 'center', marginTop: '30px' }}>
                        <Header as="h3" style={{ marginBottom: '30px' }}>
                            Choose game models
                        </Header>

                        <Button
                            size="large"
                            color="green"
                            onClick={handleCreateGame}
                            style={{ width: '100%', marginBottom: '20px' }}
                        >
                            Create New Game
                        </Button>
                        <Button
                            size="large"
                            color="blue"
                            onClick={() => setSelectedMode('join')}
                            style={{ width: '100%' }}
                        >
                            Join Existing Game
                        </Button>

                    </div>

                ) : (

                    <div style={{ marginTop: '20px' }}>
                        <h3>Join Existing Game</h3>
                        <div>
                            <label htmlFor="gameIdInput" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                                Game ID
                            </label>
                            <Input focus placeholder='Search...' />
                            <Input
                                id="gameIdInput"
                                name="gameId"
                                type="text"
                                placeholder="Enter the Game ID shared by the game creator"
                                value={gameId}
                                onChange={handleGameIdChange}
                                style={{
                                    width: '100%',
                                    height: '48px',
                                    padding: '12px',
                                    border: '2px solid #2185de',
                                    borderRadius: '14px',
                                    fontSize: '16px',
                                    display: 'block',
                                    visibility: 'visible',
                                    opacity: '1',
                                    backgroundColor: '#ffffff',
                                    color: '#333333',
                                    boxSizing: 'border-box',
                                    marginBottom: '10px'
                                }}
                            />
                            {error && (
                                <div style={{
                                    color: '#e74c3c',
                                    backgroundColor: '#fdf2f2',
                                    border: '1px solid #e74c3c',
                                    borderRadius: '4px',
                                    padding: '10px',
                                    marginTop: '10px'
                                }}>
                                    {error}
                                </div>
                            )}
                        </div>

                        <div style={{ marginTop: '20px' }}>
                            <button
                                onClick={handleJoinGame}
                                disabled={!gameId.trim()}
                                style={{
                                    backgroundColor: !gameId.trim() ? '#cccccc' : '#2185d0',
                                    color: 'white',
                                    border: 'none',
                                    padding: '12px 24px',
                                    borderRadius: '4px',
                                    fontSize: '14px',
                                    cursor: !gameId.trim() ? 'not-allowed' : 'pointer',
                                    marginRight: '10px'
                                }}
                            >
                                Join Game
                            </button>
                            <button
                                onClick={() => setSelectedMode(null)}
                                style={{
                                    backgroundColor: 'transparent',
                                    color: '#2185de',
                                    border: '1px solid #2185d0',
                                    padding: '12px 24px',
                                    borderRadius: '4px',
                                    fontSize: '14px',
                                    cursor: 'pointer'
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
