// server/src/index.ts — FINAL DEPLOYMENT VERSION
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { MatchManager } from "./match_manager.js";
import { Wallet } from "./wallet.js";
// --- Initialize Wallet + Match Manager ---
const wallet = new Wallet();
const matchManager = new MatchManager(wallet);
// --- Express + Socket.io setup ---
const app = express();
app.use(express.json());
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
});
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
// --- HTTP health check route ---
app.get("/", (_req, res) => {
    res.send("GlitchUp Checkers Server is Running.");
});
// --- ADMIN / SMS DEPOSIT ENDPOINT ---
app.post("/sms", async (req, res) => {
    const { playerId, amount, transactionId, secretHeader } = req.body;
    if (secretHeader !== process.env.SMS_SECRET_KEY) {
        return res.status(401).send({ error: "Unauthorized SMS source." });
    }
    if (!playerId || typeof amount !== "number" || !transactionId) {
        return res.status(400).send({ error: "Missing required deposit parameters." });
    }
    try {
        await wallet.deposit(playerId, amount);
        console.log(`[DEPOSIT SUCCESS] ${playerId} credited ${amount} (TxID: ${transactionId})`);
        res.status(200).send({ success: true, newBalance: await wallet.getBalance(playerId) });
    }
    catch (e) {
        console.error("Deposit Error:", e);
        res.status(500).send({ error: "Internal server error during deposit." });
    }
});
// =========================
// 🔥 SOCKET.IO REALTIME LOBBY
// =========================
let waitingPlayer = null;
io.on("connection", (socket) => {
    console.log(`User connected: ${socket.id}`);
    // --- CREATE ROOM ---
    socket.on("create_room", (code) => {
        socket.join(code);
        io.to(socket.id).emit("room_created", code);
        console.log(`[ROOM] ${socket.id} created room ${code}`);
    });
    // --- JOIN ROOM ---
    socket.on("join_room", (code) => {
        const room = io.sockets.adapter.rooms.get(code);
        if (room && room.size === 1) {
            socket.join(code);
            io.to(socket.id).emit("joined_room", code);
            io.to(code).emit("match_ready", code);
            console.log(`[ROOM] ${socket.id} joined room ${code}`);
        }
        else {
            io.to(socket.id).emit("error_message", "Room not found or full.");
        }
    });
    // --- QUICK MATCH (auto pair players) ---
    socket.on("quick_match", () => {
        if (!waitingPlayer) {
            waitingPlayer = socket.id;
            io.to(socket.id).emit("status", "Waiting for opponent...");
            console.log(`[QUEUE] ${socket.id} waiting for quick match...`);
        }
        else {
            const matchCode = Math.random().toString(36).substring(2, 7).toUpperCase();
            const playerA = waitingPlayer;
            const playerB = socket.id;
            waitingPlayer = null;
            io.sockets.sockets.get(playerA)?.join(matchCode);
            io.sockets.sockets.get(playerB)?.join(matchCode);
            io.to(playerA).emit("match_found", matchCode);
            io.to(playerB).emit("match_found", matchCode);
            console.log(`[QUEUE] Match found between ${playerA} and ${playerB} -> ${matchCode}`);
        }
    });
    // --- JOIN MATCH (game logic) ---
    socket.on("join_match", async (data) => {
        const { matchId, playerId, seat } = data;
        try {
            let match = matchManager.getMatch(matchId);
            if (!match)
                match = matchManager.createMatch(matchId, 20);
            match = await matchManager.joinMatch(matchId, seat, playerId);
            socket.join(matchId);
            console.log(`${playerId} joined match ${matchId} as ${seat}. Status: ${match.status}`);
            io.to(matchId).emit("match_update", match);
        }
        catch (error) {
            socket.emit("error", { message: error.message });
        }
    });
    // --- MAKE MOVE ---
    socket.on("make_move", async (data) => {
        const { matchId, playerId, playerSide, move } = data;
        try {
            const result = await matchManager.submitMove(matchId, playerId, playerSide, move);
            if (result.success) {
                const updatedMatch = matchManager.getMatch(matchId);
                io.to(matchId).emit("match_update", updatedMatch);
                if (result.matchEnd) {
                    io.to(matchId).emit("game_over", {
                        winner: result.matchEnd.winner,
                        finalState: updatedMatch?.state,
                        pot: updatedMatch?.pot,
                    });
                }
            }
            else {
                socket.emit("move_error", { error: result.error, suggestion: result.suggestion });
            }
        }
        catch (error) {
            socket.emit("error", { message: "Server error processing move." });
        }
    });
    socket.on("disconnect", () => {
        console.log(`User disconnected: ${socket.id}`);
        if (waitingPlayer === socket.id)
            waitingPlayer = null;
    });
});
// --- Start server ---
httpServer.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
});
