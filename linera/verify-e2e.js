const fetch = require('node-fetch'); // Assuming node-fetch or native fetch in newer node

const SERVICE_URL = 'http://localhost:8081';
const CHAIN_ID = '56be8f7df6a0b3bb34137fdd5f69a2e9a504d3d798bf56e6086b770ea244fe34';
const APP_ID = '6e8e90445363b85427fab2754b7ab3aca77944d5488fc871907caf1432092a91';
const ENDPOINT = `${SERVICE_URL}/chains/${CHAIN_ID}/applications/${APP_ID}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function query(authorization, q, variables) {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }, // In a real scenario, we might need auth headers
    body: JSON.stringify({ query: q, variables })
  });
  const json = await response.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2));
  return json.data;
}

async function main() {
  console.log('🚀 Starting Linera E2E Verification...');

  // 1. Create Poll
  console.log('\n1. Creating Poll "Team Lunch"...');
  await query(null, `
    mutation {
      createPoll(topic: "Team Lunch", votesPerVoter: 3)
    }
  `);

  await sleep(1000);

  // 2. Verify State
  console.log('2. Verifying Poll State...');
  const state = await query(null, `
    query {
      topic
      votesPerVoter
      hasStarted
      isClosed
    }
  `);
  console.log('   State:', state);
  if (state.topic !== "Team Lunch") throw new Error("Topic mismatch");

  // 3. Nominate
  console.log('\n3. Nominating options...');
  await query(null, `mutation { nominate(text: "Pizza") }`);
  await query(null, `mutation { nominate(text: "Sushi") }`);
  await query(null, `mutation { nominate(text: "Burgers") }`);
  console.log('   Nominated 3 options.');
  await sleep(1000);

  // 4. Start Vote
  console.log('\n4. Starting Vote...');
  await query(null, `mutation { startVote }`);
  await sleep(1000);
  const startedState = await query(null, `query { hasStarted }`);
  if (!startedState.hasStarted) throw new Error("Voting failed to start");
  console.log('   Voting started.');

  // 5. Vote
  console.log('\n5. Fetching nominations for voting...');
  const nominations = await query(null, `
    query {
      nominations {
        nominationId
        text
      }
    }
  `);
  console.log('   Nominations:', nominations);

  if (nominations.nominations.length < 3) throw new Error("Expected at least 3 nominations");
  console.log(`   Found ${nominations.nominations.length} nominations.`);

  // Rank them: Pizza, Sushi, Burgers
  const getNomId = (text) => nominations.nominations.find(n => n.text === text).nominationId;
  const rankings = [getNomId("Pizza"), getNomId("Sushi"), getNomId("Burgers")];

  console.log('\n6. Voting with rankings:', rankings);
  await query(null, `mutation Vote($rankings: [String!]!) { vote(rankings: $rankings) }`, { rankings });
  console.log('   Vote submitted.');
  await sleep(1000);

  // 6.5 Debug: Check Rankings
  console.log('\n6.5 Debug: Checking allRankings...');
  const rankingsDebug = await query(null, `
    query {
      allRankings {
        userId
        rankings
      }
    }
  `);
  console.log('   Stored Rankings:', JSON.stringify(rankingsDebug, null, 2));

  // 7. Close Poll
  console.log('\n7. Closing Poll...');
  await query(null, `mutation { closePoll }`);
  await sleep(1000);

  // 8. Verify Results
  console.log('8. Verifying Results...');
  const finalState = await query(null, `
    query {
      isClosed
      results {
        nominationText
        score
      }
    }
  `);

  console.log('   Results:', finalState.results);

  // Expected scores:
  // Pizza: 2 points (rank 0, max 2: 2-0=2)
  // Sushi: 1 point (rank 1, max 2: 2-1=1)
  // Burgers: 0 points (rank 2, max 2: 2-2=0)

  const pizza = finalState.results.find(r => r.nominationText === "Pizza");
  if (pizza.score !== 2) throw new Error("Incorrect score for Pizza");

  console.log('✅ E2E Verification Passed!');
}

main().catch(console.error);
