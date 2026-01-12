/**
 * Linera GraphQL Client
 *
 * This module provides a client for interacting with a Linera application
 * via its GraphQL service endpoint.
 *
 * Usage:
 *   const client = new LineraClient('http://localhost:8080', '<applicationId>');
 *   const poll = await client.query('{ topic hasStarted isClosed results { nominationId nominationText score } }');
 *   await client.mutate('nominate', { text: 'Pizza Place' });
 */

const LINERA_SERVICE_URL = (import.meta.env.VITE_LINERA_SERVICE_URL as string) || 'http://localhost:8081';
const LINERA_CHAIN_ID = (import.meta.env.VITE_LINERA_CHAIN_ID as string) || '';
const LINERA_APPLICATION_ID = (import.meta.env.VITE_LINERA_APPLICATION_ID as string) || '';

export interface LineraClientConfig {
  serviceUrl: string;
  chainId: string;
  applicationId: string;
}



export class LineraClient {
  private endpoint: string;
  public chainId: string;
  public applicationId: string;

  constructor(config: Partial<LineraClientConfig> = {}) {
    const serviceUrl = config.serviceUrl || LINERA_SERVICE_URL;
    this.chainId = config.chainId || LINERA_CHAIN_ID;
    this.applicationId = config.applicationId || LINERA_APPLICATION_ID;

    // The GraphQL endpoint for a Linera application
    this.endpoint = `${serviceUrl}/chains/${this.chainId}/applications/${this.applicationId}`;

    // Initialize simulated identity
    this.getOrInitIdentity();
  }

  /**
   * Get or create a persistent identity for this browser.
   */
  getOrInitIdentity(): string {
    let id = localStorage.getItem('linera_user_id');
    if (!id) {
      id = 'user_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('linera_user_id', id);
      console.log('[LineraClient] Generated new identity:', id);
    } else {
      console.log('[LineraClient] Restored identity:', id);
    }
    return id;
  }

  /**
   * Update the endpoint to connect to a different chain/application.
   */
  setEndpoint(chainId: string, applicationId: string): void {
    this.chainId = chainId;
    this.applicationId = applicationId;
    this.endpoint = `${LINERA_SERVICE_URL}/chains/${chainId}/applications/${applicationId}`;
    console.log(`[LineraClient] Endpoint updated: ${this.endpoint}`);
  }



  /**
   * Execute a GraphQL query against the Linera application.
   */
  async query<T = unknown>(queryString: string, variables?: Record<string, unknown>): Promise<T> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: queryString,
        variables,
      }),
    });

    const json = await response.json();

    if (json.errors) {
      throw new Error(json.errors.map((e: { message: string }) => e.message).join(', '));
    }

    return json.data as T;
  }

  /**
   * Execute a GraphQL mutation against the Linera application.
   * Note: Linera mutations return a transaction hash string, not structured data.
   */
  async mutate(mutationString: string, variables?: Record<string, unknown>): Promise<string> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: mutationString,
        variables,
      }),
    });

    const json = await response.json();

    if (json.errors) {
      throw new Error(json.errors.map((e: { message: string }) => e.message).join(', '));
    }

    // Linera returns { data: "<transaction_hash>" } for mutations
    // Check if data is a string (transaction hash) vs object (query result)
    if (typeof json.data === 'string') {
      return json.data;
    }

    throw new Error('Unexpected mutation response format');
  }

  /**
   * Waits until the application is reachable on the current chain.
   * Useful when switching to a newly spawned microchain.
   */
  async waitUntilAppReady(maxWaitMs = 10000, intervalMs = 500): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      try {
        // Simple introspection query to check availability
        await this.query('{ __schema { types { name } } }');
        return true;
      } catch (e) {
        // Ignore errors (like 404) and retry
        console.log('[LineraClient] Waiting for app to be ready...');
        await new Promise(r => setTimeout(r, intervalMs));
      }
    }
    return false;
  }

  // ============================================================
  // Convenience methods for Meal Voting operations
  // ============================================================

  async createPoll(topic: string, votesPerVoter: number): Promise<boolean> {
    try {
      const owner = this.getOrInitIdentity();
      const txHash = await this.mutate(`
              mutation CreatePoll($topic: String!, $votesPerVoter: Int!, $owner: String!) {
                createPoll(topic: $topic, votesPerVoter: $votesPerVoter, owner: $owner)
              }
            `, { topic, votesPerVoter, owner });
      console.log('createPoll transaction:', txHash);
      return !!txHash; // Success if we got a hash
    } catch (error) {
      console.error('createPoll failed:', error);
      return false;
    }
  }

  async join(name: String): Promise<boolean> {
    try {
      const owner = this.getOrInitIdentity();
      const txHash = await this.mutate(`
        mutation Join($name: String!, $owner: String!) {
          join(name: $name, owner: $owner)
        }
      `, { name, owner });
      console.log('join transaction:', txHash);
      return !!txHash;
    } catch (error) {
      console.error('join failed:', error);
      return false;
    }
  }

  async nominate(text: string): Promise<boolean> {
    try {
      const owner = this.getOrInitIdentity();
      const txHash = await this.mutate(`
        mutation Nominate($text: String!, $owner: String!) {
          nominate(text: $text, owner: $owner)
        }
      `, { text, owner });
      console.log('nominate transaction:', txHash);
      return !!txHash;
    } catch (error) {
      console.error('nominate failed:', error);
      return false;
    }
  }

  async vote(rankings: string[]): Promise<boolean> {
    try {
      const owner = this.getOrInitIdentity();
      const txHash = await this.mutate(`
        mutation Vote($rankings: [String!]!, $owner: String!) {
          vote(rankings: $rankings, owner: $owner)
        }
      `, { rankings, owner });
      console.log('vote transaction:', txHash);
      return !!txHash;
    } catch (error) {
      console.error('vote failed:', error);
      return false;
    }
  }

  async startVote(): Promise<boolean> {
    try {
      const owner = this.getOrInitIdentity();
      const txHash = await this.mutate(`
        mutation StartVote($owner: String!) {
          startVote(owner: $owner)
        }
      `, { owner });
      console.log('startVote transaction:', txHash);
      return !!txHash;
    } catch (error) {
      console.error('startVote failed:', error);
      return false;
    }
  }

  async closePoll(): Promise<boolean> {
    try {
      const owner = this.getOrInitIdentity();
      const txHash = await this.mutate(`
        mutation ClosePoll($owner: String!) {
          closePoll(owner: $owner)
        }
      `, { owner });
      console.log('closePoll transaction:', txHash);
      return !!txHash;
    } catch (error) {
      console.error('closePoll failed:', error);
      return false;
    }
  }

  async getPollState(): Promise<PollStateResponse> {
    return this.query<PollStateResponse>(`
      query GetPollState {
        topic
        adminId
        votesPerVoter
        hasStarted
        isClosed
        isClosed
        participants {
            userId
            name
        }
        nominations {
          nominationId
          text
          userId
        }
        rankings {
          userId
          nominationIds
        }
        results {
          nominationId
          nominationText
          score
        }
      }
    `);
  }
  async getCreatedPolls(userId: string): Promise<string[]> {
    const result = await this.query<{ createdPolls: string[] }>(`
      query GetCreatedPolls($userId: String!) {
  createdPolls(userId: $userId)
}
`, { userId });
    return result.createdPolls;
  }
}

// Types for Linera responses
export interface ResultEntry {
  nominationId: string;
  nominationText: string;
  score: number;
}

export interface ParticipantEntry {
  userId: string;
  name: string;
}

export interface NominationEntry {
  nominationId: string;
  text: string;
  userId: string;
}

export interface RankingEntry {
  userId: string;
  nominationIds: string[];
}

export interface PollStateResponse {
  topic: string;
  adminId: string;
  votesPerVoter: number;
  hasStarted: boolean;
  isClosed: boolean;
  participants: ParticipantEntry[];
  nominations: NominationEntry[];
  results: ResultEntry[];
  rankings: RankingEntry[];
  createdPolls?: string[];
}

// Singleton instance for convenience
let clientInstance: LineraClient | null = null;

export function getLineraClient(config?: Partial<LineraClientConfig>): LineraClient {
  if (!clientInstance) {
    clientInstance = new LineraClient(config);
  }
  return clientInstance;
}
