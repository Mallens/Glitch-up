// server/src/test_match.ts
import { MatchManager } from './match_manager.ts';
import type { PlayerId } from './match_manager.ts';

interface MockWallet {
    deduct(playerId: PlayerId, amount: number): Promise<void>;
    payout(winnerId: PlayerId, amount: number): Promise<void>;
}

const mockWallet: MockWallet = {
    deduct: async (playerId, amount) => {
        console.log(`[MOCK WALLET] Deducting ${amount} from ${playerId}`);
    },
    payout: async (winnerId, amount) => {
        console.log(`[MOCK WALLET] Paying out ${amount} to ${winnerId}`);
    }
};

async function runTest() {
    const manager = new MatchManager(mockWallet);

    console.log("=== Creating Match ===");
    const match = manager.createMatch('test1', 100);
    console.log(match);

    console.log("\n=== Players Joining ===");
    await manager.joinMatch('test1', 'p1', 'Alice');
    await manager.joinMatch('test1', 'p2', 'Bob');
    console.log(manager.getMatch('test1'));

    console.log("\n=== Submitting Moves ===");
    // Example moves; adjust indices based on your board layout
    const move1 = { seq: [20, 16], captures: [] }; // p1 move
    const move2 = { seq: [11, 15], captures: [] }; // p2 move

    let result = await manager.submitMove('test1', 'Alice', 1, move1);
    console.log("After Alice's move:", result);

    result = await manager.submitMove('test1', 'Bob', -1, move2);
    console.log("After Bob's move:", result);

    console.log("\n=== Debug Board ===");
    console.log(manager.debugBoard('test1'));
}

runTest().catch(err => console.error(err));
