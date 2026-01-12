import React, { useState } from 'react';
import { Poll } from 'shared/poll-types';
import { makeRequest } from '../api';
import CountSelector from '../components/ui/CountSelector';
import { actions, AppPage } from '../state';
import { lineraActions, startLineraPolling, getLineraClient, LineraClient } from '../linera-state-adapter';

// Feature flag: use Linera if proxy URL is configured
const USE_LINERA = !!import.meta.env.VITE_LINERA_APPLICATION_ID;

const Create: React.FC = () => {
  const [pollTopic, setPollTopic] = useState('');
  const [maxVotes, setMaxVotes] = useState(3);
  const [name, setName] = useState('');
  const [apiError, setApiError] = useState('');

  const areFieldsValid = (): boolean => {
    if (pollTopic.length < 1 || pollTopic.length > 100) {
      return false;
    }

    if (maxVotes < 1 || maxVotes > 5) {
      return false;
    }

    if (name.length < 1 || name.length > 25) {
      return false;
    }

    return true;
  };

  const handleCreatePoll = async () => {
    actions.startLoading();
    setApiError('');

    if (USE_LINERA) {
      try {
        console.log('[Create] Creating poll on Linera chain...');

        // Use the client connected to the configured chain/app
        const client = getLineraClient();
        console.log('[Create] Using client with chain:', client.chainId);

        const createSuccess = await client.createPoll(pollTopic, maxVotes);

        if (!createSuccess) {
          throw new Error('Failed to create poll on chain');
        }

        // With direct Linera, we need to find the new chain ID
        // The contract now spawns a new chain for the poll
        const adminId = client.getOrInitIdentity();
        // Persist name and update state for isAdmin check
        localStorage.setItem('linera_user_name', name);
        actions.setLineraUser(adminId, name);

        console.log('[Create] Poll created. Fetching new Chain ID...');

        // Poll for the new chain ID (it might take a moment to appear in state)
        let newPollId = '';
        const maxRetries = 10;

        for (let i = 0; i < maxRetries; i++) {
          const pools = await client.getCreatedPolls(adminId);
          if (pools && pools.length > 0) {
            // Assuming the last one is the new one
            newPollId = pools[pools.length - 1];
            break;
          }
          await new Promise(r => setTimeout(r, 1000));
        }

        if (!newPollId) {
          console.warn('Failed to retrieve new poll Chain ID, falling back to current chain');
          newPollId = client.chainId;
        }

        console.log('[Create] Found new poll chain:', newPollId);

        // Switch client to the new microchain
        client.setEndpoint(newPollId, client.applicationId);

        console.log('[Create] Waiting for app to be ready on new chain...');
        await client.waitUntilAppReady();

        // Join the poll on the new chain (this sets the proper name instead of "Admin")
        console.log('[Create] Joining poll as admin...');
        const joinSuccess = await client.join(name);
        if (!joinSuccess) {
          console.warn('Failed to join poll as admin');
        }

        const pollId = newPollId;

        // Step 3: Create local poll object for UI
        const localPoll: Poll = {
          id: pollId,
          topic: pollTopic,
          votesPerVoter: maxVotes,
          participants: { [name]: name },
          adminID: name,
          nominations: {},
          rankings: {},
          results: [],
          hasStarted: false,
        };

        actions.initializePoll(localPoll);

        // Step 4: Start polling for state updates
        // Note: client is already updated to the new endpoint
        startLineraPolling((updatedPoll) => {
          actions.updatePoll(updatedPoll);
        }, localPoll, client);

        actions.setPage(AppPage.WaitingRoom);
      } catch (error) {
        console.error('[Create] Error:', error);
        setApiError('Failed to create poll: ' + (error as Error).message);
      }
    } else {
      const { data, error } = await makeRequest<{
        poll: Poll;
        accessToken: string;
      }>('/polls', {
        method: 'POST',
        body: JSON.stringify({
          topic: pollTopic,
          votesPerVoter: maxVotes,
          name,
        }),
      });

      console.log(data, error);

      if (error && error.statusCode === 400) {
        console.log('400 error', error);
        setApiError('Name and poll topic are both required!');
      } else if (error && error.statusCode !== 400) {
        setApiError(error.messages[0]);
      } else {
        actions.initializePoll(data.poll);
        actions.setPollAccessToken(data.accessToken);
        actions.setPage(AppPage.WaitingRoom);
      }
    }

    actions.stopLoading();
  };

  return (
    <div className="flex flex-col w-full justify-around items-stretch h-full mx-auto max-w-sm">
      <div className="mb-12">
        <h3 className="text-center">Enter Poll Topic</h3>
        <div className="text-center w-full">
          <input
            maxLength={100}
            onChange={(e) => setPollTopic(e.target.value)}
            className="box info w-full"
          />
        </div>
        <h3 className="text-center mt-4 mb-2">Votes Per Participant</h3>
        <div className="w-48 mx-auto my-4">
          <CountSelector
            min={1}
            max={5}
            initial={3}
            step={1}
            onChange={(val) => setMaxVotes(val)}
          />
        </div>
        <div className="mb-12">
          <h3 className="text-center">Enter Name</h3>
          <div className="text-center w-full">
            <input
              maxLength={25}
              onChange={(e) => setName(e.target.value)}
              className="box info w-full"
            />
          </div>
        </div>
        {apiError && (
          <p className="text-center text-red-600 font-light mt-8">{apiError}</p>
        )}
      </div>
      <div className="flex flex-col justify-center items-center">
        <button
          className="box btn-orange w-32 my-2"
          onClick={handleCreatePoll}
          disabled={!areFieldsValid()}
        >
          Create
        </button>
        <button
          className="box btn-purple w-32 my-2"
          onClick={() => actions.startOver()}
        >
          Start Over
        </button>
      </div>
    </div>
  );
};

export default Create;
