/**
 * Linera State Adapter
 *
 * This module provides an adapter layer that maps the existing valtio state
 * actions to Linera GraphQL operations. It allows for a gradual migration
 * from Socket.IO to Linera while maintaining UI compatibility.
 */

import { Poll } from 'shared/poll-types';
import { LineraClient, PollStateResponse, ResultEntry } from './linera-client';

// Polling interval for state updates (since we don't have WebSocket push yet)
const POLL_INTERVAL_MS = 2000;

let pollingInterval: ReturnType<typeof setInterval> | null = null;
let currentClient: LineraClient | null = null;

/**
 * Convert Linera poll state response to the existing Poll format.
 */
function mapLineraStateToPoll(lineraState: PollStateResponse, existingPoll?: Poll): Poll {
    // Preserve existing poll data that Linera doesn't track (participants, nominations as objects)
    // For now, we only get the basic state from Linera
    const participantsObj: Record<string, string> = {};
    if (lineraState.participants) {
        lineraState.participants.forEach(p => {
            participantsObj[p.userId] = p.name;
        });
    }

    const nominationsObj: Record<string, { userID: string; text: string }> = {};
    if (lineraState.nominations) {
        lineraState.nominations.forEach(n => {
            nominationsObj[n.nominationId] = {
                userID: n.userId,
                text: n.text
            };
        });
    }

    const rankingsObj: Record<string, string[]> = {};
    if (lineraState.rankings) {
        lineraState.rankings.forEach(r => {
            rankingsObj[r.userId] = r.nominationIds;
        });
    }

    return {
        id: existingPoll?.id || '',
        topic: lineraState.topic,
        votesPerVoter: lineraState.votesPerVoter,
        participants: participantsObj,
        adminID: lineraState.adminId,
        nominations: nominationsObj,
        rankings: rankingsObj,
        results: lineraState.results.map((r: ResultEntry) => ({
            nominationID: r.nominationId,
            nominationText: r.nominationText,
            score: r.score,
        })),
        hasStarted: lineraState.hasStarted,
    };
}

/**
 * Get or create a Linera client with optional configuration.
 */
export function getLineraClient(chainId?: string, applicationId?: string): LineraClient {
    if (!currentClient || (chainId && applicationId)) {
        currentClient = new LineraClient({ chainId, applicationId });
    }
    return currentClient;
}

/**
 * Set the current Linera client (for when connecting to a new poll).
 */
export function setLineraClient(client: LineraClient): void {
    currentClient = client;
}

/**
 * Start polling the Linera service for state updates.
 */
export function startLineraPolling(
    onPollUpdate: (poll: Poll) => void,
    existingPoll?: Poll,
    client?: LineraClient
): void {
    if (pollingInterval) {
        clearInterval(pollingInterval);
    }

    const pollClient = client || currentClient || getLineraClient();

    const fetchState = async () => {
        try {
            const lineraState = await pollClient.getPollState();
            const poll = mapLineraStateToPoll(lineraState, existingPoll);
            onPollUpdate(poll);
        } catch (error) {
            console.error('Failed to fetch Linera state:', error);
        }
    };

    // Initial fetch
    fetchState();

    // Set up polling
    pollingInterval = setInterval(fetchState, POLL_INTERVAL_MS);
}

/**
 * Stop polling the Linera service.
 */
export function stopLineraPolling(): void {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
}

/**
 * Linera-compatible actions that can replace Socket.IO actions.
 */
export const lineraActions = {
    async createPoll(topic: string, votesPerVoter: number): Promise<boolean> {
        const client = getLineraClient();
        return client.createPoll(topic, votesPerVoter);
    },

    async nominate(text: string): Promise<boolean> {
        const client = getLineraClient();
        return client.nominate(text);
    },

    async vote(rankings: string[]): Promise<boolean> {
        const client = getLineraClient();
        return client.vote(rankings);
    },

    async startVote(): Promise<boolean> {
        const client = getLineraClient();
        return client.startVote();
    },

    async closePoll(): Promise<boolean> {
        const client = getLineraClient();
        return client.closePoll();
    },
};

export { LineraClient };

