/**
 * Linera Client Adapter
 *
 * Uses the official @linera/client library to connect directly to the Linera network
 * from the browser, acting as a light client with its own microchain.
 */

import * as linera from '@linera/client';

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

const LINERA_APPLICATION_ID = (import.meta.env.VITE_LINERA_APPLICATION_ID as string) || '';
const FAUCET_URL = 'https://faucet.testnet-conway.linera.net';

export class LineraClient {
  private client: linera.Client | null = null;
  public applicationId: string;
  private initPromise: Promise<void> | null = null;
  public _chainId: string | null = null;

  constructor(config: { applicationId?: string } = {}) {
    this.applicationId = config.applicationId || LINERA_APPLICATION_ID;
  }

  get chainId(): string {
    return this._chainId || '';
  }

  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      // 1. Init Wasm
      try {
        // @ts-ignore
        await linera.initialize();
      } catch (e) {
        // Did it already init?
        console.log('Wasm init (maybe repeated)', e);
      }

      // 2. Setup Signer (Private Key)
      let savedKey = localStorage.getItem('linera_private_key');
      let signer: any; // PrivateKey type

      if (savedKey) {
        signer = new linera.signer.PrivateKey(savedKey);
      } else {
        // Generate random 32 bytes hex
        const bytes = new Uint8Array(32);
        crypto.getRandomValues(bytes);
        const hex = '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');

        localStorage.setItem('linera_private_key', hex);
        signer = new linera.signer.PrivateKey(hex);
        console.log('[LineraClient] Generated and saved new private key.');
      }
      const owner = await signer.address();

      // Auto-heal: Check if the stored chain belongs to this key
      const storedOwner = localStorage.getItem('linera_wallet_owner');
      if (storedOwner && storedOwner !== owner) {
        console.warn('[LineraClient] Key changed. Discarding old chain.');
        localStorage.removeItem('linera_chain_id');
      }
      localStorage.setItem('linera_wallet_owner', owner);

      // 3. Setup Wallet & Chain
      const faucet = new linera.Faucet(FAUCET_URL);
      const wallet = await faucet.createWallet(); // Creates generic wallet

      // Check if we have a chain
      let chainId = localStorage.getItem('linera_chain_id');

      if (chainId) {
        console.log('[LineraClient] Attempting to restore chain:', chainId);
        try {
          await wallet.setOwner(chainId, owner);
          console.log('[LineraClient] Restored ownership of chain.');
        } catch (e) {
          console.warn('[LineraClient] Failed to restore chain ownership (wallet empty?). claiming new chain.', e);
          chainId = null; // Force new claim
        }
      }

      if (!chainId) {
        console.log('[LineraClient] Claiming new chain...');
        try {
          chainId = await faucet.claimChain(wallet, owner);
          if (chainId) {
            localStorage.setItem('linera_chain_id', chainId);
            console.log('[LineraClient] Claimed new chain:', chainId);
          }
        } catch (e) {
          console.error('Failed to claim chain', e);
        }
      }

      this._chainId = chainId;

      console.log('Linera namespace:', linera);
      console.log('Client class:', linera.Client);

      // 4. Create Client
      // client_new(wallet, signer, skip_process_inbox)
      try {
        // @ts-ignore
        this.client = await new linera.Client(wallet, signer, null);
        console.log('Created client:', this.client);
        console.log('Client prototype:', Object.getPrototypeOf(this.client));
      } catch (e) {
        console.error('Error creating client:', e);
      }

      console.log('[LineraClient] Initialized.');
    })();

    return this.initPromise;
  }

  getOrInitIdentity(): string {
    return this.chainId || 'initializing...';
  }

  async waitUntilAppReady(): Promise<boolean> {
    await this.init();
    return true;
  }

  setEndpoint(chainId: string, applicationId: string): void {
    this.applicationId = applicationId;
  }



  async query<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    await this.init();
    if (!this.client) throw new Error('Client not initialized');

    try {
      const chain = await this.client.chain(this.chainId);
      const app = await chain.application(this.applicationId);
      const payload = JSON.stringify({ query, variables });
      // query(query, block_hash?)
      const responseStr = await app.query(payload, null);
      const response = JSON.parse(responseStr);

      if (response.errors) {
        throw new Error(response.errors.map((e: any) => e.message).join(', '));
      }

      return response.data as T;
    } catch (e) {
      console.error('Query failed:', e);
      throw e;
    }
  }

  async mutate(mutation: string, variables: Record<string, unknown> = {}): Promise<string> {
    return this.query<any>(mutation, variables).then(() => "submitted");
  }

  // Operations
  async createPoll(topic: string, votesPerVoter: number): Promise<boolean> {
    try {
      await this.mutate(`
        mutation CreatePoll($topic: String!, $votesPerVoter: Int!, $owner: String!) {
            createPoll(topic: $topic, votesPerVoter: $votesPerVoter, owner: $owner)
        }
       `, {
        topic,
        votesPerVoter,
        owner: this.chainId
      });
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }

  async join(name: string): Promise<boolean> {
    try {
      await this.mutate(`
            mutation Join($name: String!, $owner: String!) {
              join(name: $name, owner: $owner)
            }
          `, { name, owner: this.chainId });
      return true;
    } catch (e) {
      return false;
    }
  }

  async nominate(text: string): Promise<boolean> {
    try {
      await this.mutate(`
            mutation Nominate($text: String!, $owner: String!) {
              nominate(text: $text, owner: $owner)
            }
          `, { text, owner: this.chainId });
      return true;
    } catch (e) {
      return false;
    }
  }

  async vote(rankings: string[]): Promise<boolean> {
    try {
      await this.mutate(`
            mutation Vote($rankings: [String!]!, $owner: String!) {
              vote(rankings: $rankings, owner: $owner)
            }
          `, { rankings, owner: this.chainId });
      return true;
    } catch (e) {
      return false;
    }
  }

  async startVote(): Promise<boolean> {
    try {
      await this.mutate(`
            mutation StartVote($owner: String!) {
              startVote(owner: $owner)
            }
          `, { owner: this.chainId });
      return true;
    } catch (e) {
      return false;
    }
  }

  async closePoll(): Promise<boolean> {
    try {
      await this.mutate(`
            mutation ClosePoll($owner: String!) {
              closePoll(owner: $owner)
            }
          `, { owner: this.chainId });
      return true;
    } catch (e) {
      return false;
    }
  }

  async getCreatedPolls(userId: string): Promise<string[]> {
    try {
      const result = await this.query<{ createdPolls: string[] }>(`
          query GetCreatedPolls($userId: String!) {
            createdPolls(userId: $userId)
          }
        `, { userId });
      return result.createdPolls || [];
    } catch (e) {
      console.error('Failed to get created polls', e);
      return [];
    }
  }

  async getPollState(): Promise<PollStateResponse> {
    // Note: createdPolls requires userId, so we don't fetch it here in the generic state
    return this.query<PollStateResponse>(`
      query GetPollState {
        topic
        adminId
        votesPerVoter
        hasStarted
        isClosed
        participants {
          userId
          name
        }
        nominations {
          nominationId
          userId
          text
        }
        rankings {
          userId
          nominationIds
        }
        results {
          nominationId
          score
        }
      }
    `);
  }
}

let clientInstance: LineraClient | null = null;
export function getLineraClient(chainId?: string, applicationId?: string): LineraClient {
  if (!clientInstance) {
    clientInstance = new LineraClient({ applicationId });
  }
  return clientInstance;
}
