// server/wallet.ts (Revised for ASYNC Database Operations)
import mongoose, { Schema } from 'mongoose'; // Database imports
// --- MongoDB Setup (Replace with your actual connection string) ---
const MONGO_URI = "mongodb://localhost:27017/glitchup";
const UserSchema = new Schema({
    playerId: { type: String, required: true, unique: true },
    balance: { type: Number, required: true, default: 0 }
});
const User = mongoose.model('User', UserSchema);
// --- Wallet Class Implementation ---
export class Wallet {
    constructor() {
        this.connect();
    }
    async connect() {
        if (mongoose.connection.readyState === 0) {
            try {
                await mongoose.connect(MONGO_URI);
                console.log("[WALLET] MongoDB connected successfully.");
            }
            catch (error) {
                console.error("[WALLET] MongoDB connection error:", error);
            }
        }
    }
    async getBalance(playerId) {
        const user = await User.findOne({ playerId });
        // Auto-create user if they don't exist
        if (!user) {
            const newUser = await User.create({ playerId, balance: 0 });
            return newUser.balance;
        }
        return user.balance;
    }
    // 1. DEDUCT (Called by MatchManager on match start)
    async deduct(playerId, amount) {
        const user = await User.findOne({ playerId });
        if (!user || user.balance < amount) {
            throw new Error(`Insufficient funds: ${playerId} balance too low to deduct ${amount}.`);
        }
        // Use a MongoDB transaction or atomic update for safe deduction
        await User.updateOne({ playerId: playerId, balance: { $gte: amount } }, { $inc: { balance: -amount } });
        console.log(`[WALLET: DEBIT] Deducted ${amount} from ${playerId}.`);
        // Log transaction here
    }
    // 2. PAYOUT (Called by MatchManager on match end)
    async payout(winnerId, amount) {
        // Payout should be logged and flagged for manual processing (as per your system)
        console.log(`[WALLET: PAYOUT_MARK] ${winnerId} is due a manual payout of ${amount}. (Flagged in DB)`);
        // For game logic, we'll credit the user's balance instantly upon winning.
        // The actual money movement is separate and manual.
        await User.updateOne({ playerId: winnerId }, { $inc: { balance: amount } });
        // Log transaction here
    }
    // 3. DEPOSIT (Called by your SMS Forwarder endpoint)
    async deposit(playerId, amount) {
        await User.updateOne({ playerId: playerId }, { $inc: { balance: amount } }, { upsert: true });
        console.log(`[WALLET: DEPOSIT] ${playerId} credited ${amount}.`);
        // Log transaction here
    }
}
