import React, { useState } from 'react';
import { Poll } from 'shared/poll-types';
import { makeRequest } from '../api';
import { actions, AppPage } from '../state';
import { getLineraClient, startLineraPolling } from '../linera-state-adapter';

// Feature flag: set to true to use Linera instead of Socket.IO
const LINERA_APPLICATION_ID = import.meta.env.VITE_LINERA_APPLICATION_ID;
const USE_LINERA = !!LINERA_APPLICATION_ID;

const Join: React.FC = () => {
  const [pollID, setPollID] = useState('');
  const [name, setName] = useState('');
  const [apiError, setApiError] = useState('');

  const areFieldsValid = (): boolean => {
    // In Linera mode, we don't need a poll ID (there's only one poll per app)
    if (!USE_LINERA && (pollID.length < 6 || pollID.length > 6)) {
      return false;
    }

    // In Linera mode, we need a valid chain ID (usually hex string, quite long)
    if (USE_LINERA && pollID.length < 10) {
      return false;
    }

    if (name.length < 1 || name.length > 25) {
      return false;
    }

    return true;
  };

  const handleJoinPoll = async () => {
    actions.startLoading();
    setApiError('');

    if (USE_LINERA) {
      try {
        // In Linera mode, pollID is the chainId
        // For MVP, we also need appId - we'll retrieve it or use a default
        // In production, you'd look this up from a database
        console.log('[Join] Connecting to chain:', pollID);

        // The pollID contains both chainId and appId separated by ':'
        // Format: chainId:appId or just chainId (will try to get appId)
        let chainId = pollID;
        let appId = LINERA_APPLICATION_ID;

        if (pollID.includes(':')) {
          [chainId, appId] = pollID.split(':');
        }

        // Create client connected to the specific chain
        const client = getLineraClient(chainId, appId);

        // Join the poll on-chain
        console.log('[Join] Connecting to chain:', client.chainId);
        console.log('[Join] Waiting for app to be ready on chain...');

        // Update state and localStorage
        const userId = client.getOrInitIdentity();
        localStorage.setItem('linera_user_name', name);
        actions.setLineraUser(userId, name);

        const ready = await client.waitUntilAppReady();
        if (!ready) {
          throw new Error('Application not ready on this chain. Please try again in a moment.');
        }

        console.log('[Join] Joining poll on-chain...');
        const joinSuccess = await client.join(name);
        if (!joinSuccess) {
          throw new Error('Failed to join poll on chain');
        }

        const pollState = await client.getPollState();

        // Create a local poll object for the UI
        const localPoll: Poll = {
          id: chainId,
          topic: pollState.topic,
          votesPerVoter: pollState.votesPerVoter,
          participants: { [name]: name },
          adminID: 'chain-owner',
          nominations: {},
          rankings: {},
          results: pollState.results.map(r => ({
            nominationID: r.nominationId,
            nominationText: r.nominationText,
            score: r.score,
          })),
          hasStarted: pollState.hasStarted,
        };

        actions.initializePoll(localPoll);
        // Start polling for state updates using the same client
        startLineraPolling((updatedPoll) => {
          actions.updatePoll(updatedPoll);
        }, localPoll, client);
        actions.setPage(AppPage.WaitingRoom);
      } catch (error) {
        console.error('Failed to join Linera poll:', error);
        setApiError('Failed to join poll: ' + (error as Error).message);
      }
    } else {
      const { data, error } = await makeRequest<{
        poll: Poll;
        accessToken: string;
      }>('/polls/join', {
        method: 'POST',
        body: JSON.stringify({
          pollID,
          name,
        }),
      });

      if (error && error.statusCode === 400) {
        setApiError('Please make sure to include a poll topic!');
      } else if (error && !error.statusCode) {
        setApiError('Unknown API error');
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
        <div className="my-4">
          <h3 className="text-center">
            {USE_LINERA ? 'Enter Poll Chain ID' : 'Enter Code Provided by "Friend"'}
          </h3>
          <div className="text-center w-full">
            <input
              maxLength={USE_LINERA ? 128 : 6}
              onChange={(e) => setPollID(USE_LINERA ? e.target.value : e.target.value.toUpperCase())}
              className="box info w-full"
              autoCapitalize={USE_LINERA ? "none" : "characters"}
              style={USE_LINERA ? {} : { textTransform: 'uppercase' }}
              placeholder={USE_LINERA ? "e.g. e421e1..." : ""}
            />
          </div>
        </div>
        <div className="my-4">
          <h3 className="text-center">Your Name</h3>
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
      <div className="my-12 flex flex-col justify-center items-center">
        <button
          disabled={!areFieldsValid()}
          className="box btn-orange w-32 my-2"
          onClick={handleJoinPoll}
        >
          Join
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

export default Join;
