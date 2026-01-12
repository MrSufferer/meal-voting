// Copyright (c) Kyler
// SPDX-License-Identifier: Apache-2.0

#![cfg_attr(target_arch = "wasm32", no_main)]

mod state;

use std::sync::Arc;

use async_graphql::{EmptySubscription, Object, Request, Response, Schema};
use linera_sdk::{
    linera_base_types::{ChainId, WithServiceAbi},
    views::View,
    Service, ServiceRuntime,
};
use meal_voting::Operation;

use self::state::PollState;

pub struct MealVotingService {
    state: Arc<PollState>,
    runtime: Arc<ServiceRuntime<Self>>,
}

linera_sdk::service!(MealVotingService);

impl WithServiceAbi for MealVotingService {
    type Abi = meal_voting::MealVotingAbi;
}

impl Service for MealVotingService {
    type Parameters = ();

    async fn new(runtime: ServiceRuntime<Self>) -> Self {
        let state = PollState::load(runtime.root_view_storage_context())
            .await
            .expect("Failed to load state");
        println!("SERVICE: Loaded state");
        MealVotingService {
            state: Arc::new(state),
            runtime: Arc::new(runtime),
        }
    }

    async fn handle_query(&self, request: Request) -> Response {
        let schema = Schema::build(
            QueryRoot {
                state: self.state.clone(),
            },
            MutationRoot {
                runtime: self.runtime.clone(),
            },
            EmptySubscription,
        )
        .finish();
        schema.execute(request).await
    }
}

struct QueryRoot {
    state: Arc<PollState>,
}

#[Object]
impl QueryRoot {
    /// Get the poll topic.
    async fn topic(&self) -> String {
        self.state.topic.get().clone()
    }

    /// Get the admin ID.
    async fn admin_id(&self) -> String {
        self.state.admin_id.get().clone()
    }

    /// Get votes per voter.
    async fn votes_per_voter(&self) -> u32 {
        *self.state.votes_per_voter.get()
    }

    /// Check if voting has started.
    async fn has_started(&self) -> bool {
        *self.state.has_started.get()
    }

    /// Check if poll is closed.
    async fn is_closed(&self) -> bool {
        *self.state.is_closed.get()
    }

    /// Get the computed results (available after close).
    async fn results(&self) -> Vec<state::ResultEntry> {
        self.state.results.get().clone()
    }

    /// Get all nominations.
    async fn nominations(&self) -> Vec<state::NominationEntry> {
        let mut nominations = Vec::new();
        let indices = self.state.nominations.indices().await.expect("indices failed");
        for id in indices {
            if let Some(nomination) = self.state.nominations.get(&id).await.expect("get failed") {
                nominations.push(state::NominationEntry {
                    nomination_id: id,
                    user_id: nomination.user_id,
                    text: nomination.text,
                });
            }
        }
        nominations
    }

    /// Get all participants.
    async fn participants(&self) -> Vec<state::ParticipantEntry> {
        let mut participants = Vec::new();
        let indices = self.state.participants.indices().await.expect("indices failed");
        for user_id in indices {
            if let Some(name) = self.state.participants.get(&user_id).await.expect("get failed") {
                participants.push(state::ParticipantEntry {
                    user_id,
                    name,
                });
            }
        }
        participants
    }

    /// Get the participant count.
    async fn participant_count(&self) -> u32 {
        self.state.participants.count().await.unwrap_or(0) as u32
    }

    /// Get valid chain IDs created by a user.
    async fn created_polls(&self, user_id: String) -> Vec<ChainId> {
        self.state
            .created_polls
            .get(&user_id)
            .await
            .expect("get failed")
            .unwrap_or_default()
    }

    /// Get all rankings (votes).
    async fn rankings(&self) -> Vec<state::RankingEntry> {
        let mut rankings = Vec::new();
        let indices = self.state.rankings.indices().await.expect("indices failed");
        for user_id in indices {
            if let Some(nomination_ids) = self.state.rankings.get(&user_id).await.expect("get failed") {
                rankings.push(state::RankingEntry {
                    user_id,
                    nomination_ids,
                });
            }
        }
        rankings
    }
}

struct MutationRoot {
    runtime: Arc<ServiceRuntime<MealVotingService>>,
}

#[Object]
impl MutationRoot {
    /// Create a new poll.
    async fn create_poll(&self, topic: String, votes_per_voter: u32, owner: String) -> bool {
        println!("SERVICE: create_poll");
        let operation = Operation::CreatePoll { topic, votes_per_voter, owner };
        self.runtime.schedule_operation(&operation);
        true
    }


    /// Join the poll as a participant.
    async fn join(&self, name: String, owner: String) -> bool {
        println!("SERVICE: join name={} owner={}", name, owner);
        let operation = Operation::Join { name, owner };
        self.runtime.schedule_operation(&operation);
        println!("SERVICE: join scheduled");
        true
    }

    /// Add a nomination.
    async fn nominate(&self, text: String, owner: String) -> bool {
        let operation = Operation::Nominate { text, owner };
        self.runtime.schedule_operation(&operation);
        true
    }

    /// Submit vote rankings.
    async fn vote(&self, rankings: Vec<String>, owner: String) -> bool {
        let operation = Operation::Vote { rankings, owner };
        self.runtime.schedule_operation(&operation);
        true
    }

    /// Start the voting phase (admin only).
    async fn start_vote(&self, owner: String) -> bool {
        let operation = Operation::StartVote { owner };
        self.runtime.schedule_operation(&operation);
        true
    }

    /// Close the poll and compute results (admin only).
    async fn close_poll(&self, owner: String) -> bool {
        let operation = Operation::ClosePoll { owner };
        self.runtime.schedule_operation(&operation);
        true
    }
}
