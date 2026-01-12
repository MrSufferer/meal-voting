// Copyright (c) Kyler
// SPDX-License-Identifier: Apache-2.0

#![cfg_attr(target_arch = "wasm32", no_main)]

mod state;

use linera_sdk::{
    linera_base_types::{WithContractAbi, ChainOwnership, ApplicationPermissions, Amount},
    views::{RootView, View},
    Contract, ContractRuntime,
};
use meal_voting::{MealVotingAbi, Message, Operation};

use self::state::{Nomination, PollState, ResultEntry};

pub struct MealVotingContract {
    state: PollState,
    runtime: ContractRuntime<Self>,
}

linera_sdk::contract!(MealVotingContract);

impl WithContractAbi for MealVotingContract {
    type Abi = MealVotingAbi;
}

impl Contract for MealVotingContract {
    type Message = Message;
    type InstantiationArgument = ();
    type Parameters = ();
    type EventValue = ();

    async fn load(runtime: ContractRuntime<Self>) -> Self {
        let state = PollState::load(runtime.root_view_storage_context())
            .await
            .expect("Failed to load state");
        MealVotingContract { state, runtime }
    }

    async fn instantiate(&mut self, _argument: ()) {
        // Initialization is handled by CreatePoll operation.
        // State starts empty.
    }

    async fn execute_operation(&mut self, operation: Operation) -> Self::Response {
        let signer = self.runtime.authenticated_signer();
        println!("EXECUTE_OPERATION: {:?}", operation);

        match operation {
            Operation::CreatePoll { topic, votes_per_voter, owner } => {
                let user_id = owner;
                
                let owner_id = signer.expect("Needs authenticated signer to create poll");
                
                // Spawn a new microchain
                let new_chain_id = self.runtime.open_chain(
                    ChainOwnership::single(owner_id),
                    ApplicationPermissions::default(),
                    Amount::from_tokens(10),
                );

                // Send initialization message to the new chain
                let msg = Message::InitializePoll {
                    topic,
                    votes_per_voter,
                    admin_id: user_id.clone(),
                };
                self.runtime.prepare_message(msg).send_to(new_chain_id);

                // Track created poll for the user
                let mut polls = self.state.created_polls.get(&user_id).await.expect("get failed").unwrap_or_default();
                polls.push(new_chain_id);
                self.state.created_polls.insert(&user_id, polls).expect("insert failed");
            }
            Operation::Join { name, owner } => {
                println!("JOIN: User={}, Name={}", owner, name);
                let user_id = owner;
                if *self.state.is_closed.get() {
                    panic!("Poll is closed");
                }
                match self.state.participants.insert(&user_id, name) {
                    Ok(_) => println!("JOIN SUCESS"),
                    Err(e) => panic!("JOIN FAILED: {:?}", e),
                }
            }
            Operation::Nominate { text, owner } => {
                let user_id = owner;
                if *self.state.has_started.get() {
                    panic!("Cannot nominate after voting has started");
                }
                if !self.state.participants.contains_key(&user_id).await.expect("contains failed") {
                    panic!("User not in poll");
                }
                let nomination_id = format!("nom_{}", self.state.nominations.count().await.unwrap_or(0));
                let nomination = Nomination {
                    user_id: user_id.clone(),
                    text,
                };
                self.state.nominations.insert(&nomination_id, nomination).expect("insert failed");
            }
            Operation::Vote { rankings, owner } => {
                let user_id = owner;
                if !*self.state.has_started.get() {
                    panic!("Voting has not started yet");
                }
                if *self.state.is_closed.get() {
                    panic!("Poll is already closed");
                }
                let max_votes = *self.state.votes_per_voter.get() as usize;
                if rankings.len() > max_votes {
                    panic!("Too many rankings. Max allowed: {}", max_votes);
                }
                if !self.state.participants.contains_key(&user_id).await.expect("contains failed") {
                    panic!("User not in poll");
                }
                self.state.rankings.insert(&user_id, rankings).expect("insert failed");
            }
            Operation::StartVote { owner } => {
                let user_id = owner;
                if user_id != *self.state.admin_id.get() {
                    panic!("Only admin can start voting");
                }
                self.state.has_started.set(true);
            }
            Operation::ClosePoll { owner } => {
                let user_id = owner;
                if user_id != *self.state.admin_id.get() {
                    panic!("Only admin can close the poll");
                }
                if *self.state.is_closed.get() {
                    panic!("Poll is already closed");
                }
                self.state.is_closed.set(true);
                self.compute_results().await;
            }
        }
    }

    async fn execute_message(&mut self, message: Message) {
        // Handle cross-chain messages from other chains
        // Handle cross-chain messages
        match message {
            Message::InitializePoll { topic, votes_per_voter, admin_id } => {
                self.state.topic.set(topic);
                self.state.votes_per_voter.set(votes_per_voter);
                self.state.admin_id.set(admin_id.clone());
                self.state.has_started.set(false);
                self.state.is_closed.set(false);
                self.state.results.set(Vec::new());

                self.state.participants.insert(&admin_id, "Admin".to_string()).expect("insert failed");
            }
            Message::Nominate { user_id, text } => {
                if *self.state.has_started.get() {
                    panic!("Cannot nominate after voting has started");
                }
                let nomination_id = format!("nom_{}", self.state.nominations.count().await.unwrap_or(0));
                let nomination = Nomination {
                    user_id: user_id.clone(),
                    text,
                };
                self.state.nominations.insert(&nomination_id, nomination).expect("insert failed");
            }
            Message::Vote { user_id, rankings } => {
                if !*self.state.has_started.get() {
                    panic!("Voting has not started yet");
                }
                if *self.state.is_closed.get() {
                    panic!("Poll is already closed");
                }
                let max_votes = *self.state.votes_per_voter.get() as usize;
                if rankings.len() > max_votes {
                    panic!("Too many rankings. Max allowed: {}", max_votes);
                }
                self.state.rankings.insert(&user_id, rankings).expect("insert failed");
            }
            Message::StartVote { user_id } => {
                if user_id != *self.state.admin_id.get() {
                    panic!("Only admin can start voting");
                }
                self.state.has_started.set(true);
            }
            Message::ClosePoll { user_id } => {
                if user_id != *self.state.admin_id.get() {
                    panic!("Only admin can close the poll");
                }
                if *self.state.is_closed.get() {
                    panic!("Poll is already closed");
                }
                self.state.is_closed.set(true);
                self.compute_results().await;
            }
        }
    }

    async fn store(mut self) {
        self.state.save().await.expect("Failed to save state");
    }
}

impl MealVotingContract {
    /// Compute results using a simple Borda-like scoring.
    async fn compute_results(&mut self) {
        use std::collections::BTreeMap;

        let mut scores: BTreeMap<String, u64> = BTreeMap::new();
        let max_votes = *self.state.votes_per_voter.get() as u64;

        let rankings_keys = self.state.rankings.indices().await.expect("indices failed");
        
        for user_id in rankings_keys {
            if let Some(user_rankings) = self.state.rankings.get(&user_id).await.expect("get failed") {
                for (i, nomination_id) in user_rankings.iter().enumerate() {
                    let points = max_votes.saturating_sub(i as u64);
                    *scores.entry(nomination_id.clone()).or_insert(0) += points;
                }
            }
        }

        let mut results: Vec<ResultEntry> = Vec::new();
        for (nomination_id, score) in scores {
            let text = self
                .state
                .nominations
                .get(&nomination_id)
                .await
                .expect("get failed")
                .map(|n| n.text.clone())
                .unwrap_or_else(|| "Unknown".to_string());
            results.push(ResultEntry {
                nomination_id,
                nomination_text: text,
                score,
            });
        }

        results.sort_by(|a, b| b.score.cmp(&a.score));

        self.state.results.set(results);
    }
}
