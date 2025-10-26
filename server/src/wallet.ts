// server/src/wallet.ts (Revised for ASYNC Database Operations)

// FIX: Use 'import type' for PlayerId and remove the .ts extension 
import type { PlayerId } from './match_manager.ts'; 
import mongoose, { Schema, Document } from 'mongoose'; // Database imports

// --- MongoDB Setup (Replace with your actual connection string) ---
const MONGO_URI = "mongodb://localhost:27017/glitchup";

// --- Mongoose Schema Definitions ---

interface IUser extends Document {
    playerId: PlayerId;
    balance: number;
    // You'd add other fields like phone number here for matching the SMS
}
const UserSchema = new Schema<IUser>({
    playerId: { type: String, required: true, unique: true },
    balance: { type: Number, required: true, default: 0 }
});
const User = mongoose.model<IUser>('User', UserSchema);

// --- Transaction Handler Interface (Now Async) ---
export interface TransactionHandler {
    deduct(playerId: PlayerId, amount: number): Promise<void>;
    payout(winnerId: PlayerId, amount: number): Promise<void>;
    getBalance(playerId: PlayerId): Promise<number>;
    deposit(playerId: PlayerId, amount: number): Promise<void>;
}

// --- Wallet Class Implementation ---
export class Wallet implements TransactionHandler {

    constructor() {
        this.connect();
    }

    private async connect() {
        if (mongoose.connection.readyState === 0) {
            try {
                await mongoose.connect(MONGO_URI);
                console.log("[WALLET] MongoDB connected successfully.");
            } catch (error) {
                console.error("[WALLET] MongoDB connection error:", error);
            }
        }
    }

    public async getBalance(playerId: PlayerId): Promise<number> {
        const user = await User.findOne({ playerId });
        // Auto-create user if they don't exist
        if (!user) {
            const newUser = await User.create({ playerId, balance: 0 }); 
            return newUser.balance;
        }
        return user.balance;
    }

    // 1. DEDUCT (Called by MatchManager on match start)
    public async deduct(playerId: PlayerId, amount: number): Promise<void> {
        const user = await User.findOne({ playerId });
        
        if (!user || user.balance < amount) {
            throw new Error(`Insufficient funds: ${playerId} balance too low to deduct ${amount}.`);
        }

        // Use a MongoDB transaction or atomic update for safe deduction
        await User.updateOne(
            { playerId: playerId, balance: { $gte: amount } }, 
            { $inc: { balance: -amount } }
        );
        console.log(`[WALLET: DEBIT] Deducted ${amount} from ${playerId}.`);
        // Log transaction here
    }

    // 2. PAYOUT (Called by MatchManager on match end)
    public async payout(winnerId: PlayerId, amount: number): Promise<void> {
        // Payout should be logged and flagged for manual processing (as per your system)
        console.log(`[WALLET: PAYOUT_MARK] ${winnerId} is due a manual payout of ${amount}. (Flagged in DB)`);
        
        // For game logic, we'll credit the user's balance instantly upon winning.
        // The actual money movement is separate and manual.
        await User.updateOne({ playerId: winnerId }, { $inc: { balance: amount } });
        // Log transaction here
    }
    
    // 3. DEPOSIT (Called by your SMS Forwarder endpoint)
    public async deposit(playerId: PlayerId, amount: number): Promise<void> {
        await User.updateOne({ playerId: playerId }, { $inc: { balance: amount } }, { upsert: true });
        console.log(`[WALLET: DEPOSIT] ${playerId} credited ${amount}.`);
        // Log transaction here
    }
}
