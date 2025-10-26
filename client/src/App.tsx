import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import Board from "./components/Board";
import type { Piece } from "./utils/checkerUtils";

type MatchState = {
  id: string;
  state: {
    board: Piece[]; // length 32
    currentPlayer: 1 | -1;
    moveNumber: number;
    noProgressCount: number;
  };
  players?: any;
};

const SERVER = import.meta.env.VITE_SERVER_URL ?? "http://localhost:3000";
const socket: Socket = io(SERVER, { transports: ["websocket"] });

export default function App() {
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<string>("Disconnected");
  const [roomCode, setRoomCode] = useState("");
  const [matchId, setMatchId] = useState<string | null>(null);
  const [matchState, setMatchState] = useState<MatchState | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [playerId] = useState<string>(() => "p_" + Math.random().toString(36).slice(2, 9));
  const [playerSide] = useState<1 | -1>(1); // simple local assignment — must match server seat logic

  useEffect(() => {
    const handleConnect = () => {
      setConnected(true);
      setStatus("Connected");
    };
    const handleDisconnect = () => {
      setConnected(false);
      setStatus("Disconnected");
    };
    const handleRoomCreated = (code: string) => {
      setMatchId(code);
      setStatus(`Room created: ${code}`);
    };
    const handleJoinedRoom = (code: string) => {
      setMatchId(code);
      setStatus(`Joined: ${code}`);
    };
    const handleMatchFound = (code: string) => {
      setMatchId(code);
      setStatus(`Matched: ${code}`);
    };
    const handleMatchUpdate = (m: MatchState) => {
      setMatchState(m);
      setMatchId(m.id ?? matchId);
      setStatus("Match updated");
    };
    const handleMoveError = (payload: any) => {
      alert("Move rejected: " + (payload?.error ?? "Illegal move"));
    };
    const handleGameOver = (payload: any) => {
      alert("Game over: " + JSON.stringify(payload));
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("room_created", handleRoomCreated);
    socket.on("joined_room", handleJoinedRoom);
    socket.on("match_found", handleMatchFound);
    socket.on("match_update", handleMatchUpdate);
    socket.on("move_error", handleMoveError);
    socket.on("game_over", handleGameOver);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("room_created", handleRoomCreated);
      socket.off("joined_room", handleJoinedRoom);
      socket.off("match_found", handleMatchFound);
      socket.off("match_update", handleMatchUpdate);
      socket.off("move_error", handleMoveError);
      socket.off("game_over", handleGameOver);
    };
  }, [matchId]);

  // === Lobby actions ===
  const createRoom = () => {
    const code = roomCode || Math.random().toString(36).substring(2, 7).toUpperCase();
    socket.emit("create_room", code);
    setMatchId(code);
  };
  const joinRoom = () => {
    if (!roomCode) return alert("Enter room code");
    socket.emit("join_room", roomCode);
    setMatchId(roomCode);
  };
  const quickMatch = () => {
    socket.emit("quick_match");
  };

  // === Move attempt ===
  const attemptMove = (fromIdx: number, toIdx: number) => {
    if (!matchId) return alert("No match id");
    if (!matchState) return alert("No match state yet");
    const move = { seq: [fromIdx, toIdx], captures: [] };
    socket.emit("make_move", { matchId, playerId, playerSide, move });
    setSelectedIdx(null);
  };

  const onSelectPiece = (idx: number) => {
    if (!matchState) return;
    const p = matchState.state.board[idx];
    if (p === 0 || p === undefined || p === null) return;
    const owner = p > 0 ? 1 : -1;
    if (owner !== playerSide) {
      alert("Not your piece.");
      return;
    }
    setSelectedIdx(idx);
  };

  return (
    <div style={{ padding: 20, fontFamily: "system-ui, Arial" }}>
      <h1>♟️ GlitchUp Checkers (Client)</h1>
      <div style={{ marginBottom: 12 }}>
        <strong>Status:</strong> {status} — <strong>Socket:</strong> {connected ? "open" : "closed"}
      </div>

      <div style={{ marginBottom: 12 }}>
        <input
          placeholder="Room code (optional)"
          value={roomCode}
          onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
        />
        <button onClick={createRoom} style={{ marginLeft: 8 }}>
          Create Room
        </button>
        <button onClick={joinRoom} style={{ marginLeft: 8 }}>
          Join Room
        </button>
        <button onClick={quickMatch} style={{ marginLeft: 8 }}>
          Quick Match
        </button>
      </div>

      <div style={{ marginBottom: 12 }}>
        <strong>Your ID:</strong> {playerId} — <strong>Side:</strong> {playerSide === 1 ? "P1" : "P2"}
      </div>

      <div style={{ display: "flex", gap: 24 }}>
        <div>
          <Board
            matchId={matchId}
            stateBoard={matchState ? matchState.state.board : null}
            currentPlayer={matchState ? matchState.state.currentPlayer : null}
            selectedIdx={selectedIdx}
            onSelectPiece={onSelectPiece}
            onAttemptMove={attemptMove}
          />
        </div>

        <div style={{ minWidth: 260 }}>
          <h3>Match Info</h3>
          <pre style={{ whiteSpace: "pre-wrap" }}>
            {matchState ? JSON.stringify(matchState, null, 2) : "No match"}
          </pre>
        </div>
      </div>
    </div>
  );
}
