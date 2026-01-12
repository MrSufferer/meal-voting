# Meal Voting on Linera

A decentralized, multi-chain implementation of Ranked Choice Voting built on the [Linera](https://linera.dev) blockchain protocol.

This application allows users to create polls, nominate options, and vote using ranked choice preferences, all persisted securely on the Linera network. It utilizes Linera's microchain architecture to spawn a separate chain for each poll, ensuring scalability and parallel execution.

## Features

*   **Microchain Architecture**: Every new poll spawns its own microchain (Factory Pattern).
*   **Ranked Choice Voting**: Users rank their preferences; results are calculated on-chain.
*   **Real-time Updates**: Frontend polls the Linera GraphQL service for state changes.
*   **Multi-User Simulation**: Supports simulating multiple users (Admin + Participants) in a local browser environment.

## Prerequisites

1.  **Rust & Wasm**:
    *   Install Rust: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
    *   Add Wasm target: `rustup target add wasm32-unknown-unknown`
2.  **Linera SDK**:
    *   Install Linera CLI: `cargo install linera-service --features storage-service`
    *   (Or follow the [Linera Installation Guide](https://linera.dev/developers/getting_started/installation.html))
3.  **Node.js**:
    *   For the React frontend.

## Getting Started

### 1. Build the Contract

Compile the Linera contract and service into WebAssembly.

```bash
cd linera/meal_voting
cargo build --release --target wasm32-unknown-unknown
```

### 2. Start the Linera Service

Run a local Linera service to handle chain operations and GraphQL requests.

```bash
# In the linera directory (or root)
linera service --port 8081
```

### 3. Deploy the Application

Publish the bytecode and create the application on a chain.

```bash
# From the linera/ folder
linera publish-and-create \
  ./meal_voting/target/wasm32-unknown-unknown/release/meal_voting_contract.wasm \
  ./meal_voting/target/wasm32-unknown-unknown/release/meal_voting_service.wasm \
  --json-argument "null"
```

**Note the App ID**: The command will output a long hexadecimal string (e.g., `e421...`). Copy this ID.

### 4. Configure the Frontend

Update the client environment variables with your deployed App ID.

```bash
# client/.env
VITE_LINERA_SERVICE_URL=http://localhost:8081
VITE_LINERA_CHAIN_ID=<YOUR_DEFAULT_CHAIN_ID>  # Usually inferred or set automatically
VITE_LINERA_APPLICATION_ID=<YOUR_APP_ID_FROM_STEP_3>
```

### 5. Run the Client

```bash
cd client
npm install
npm run dev
```

Open your browser to `http://localhost:5173`.

## Architecture Details

*   **Factory Pattern**: The main application ID acts as a "factory". When a user clicks "Create Poll", the contract sends an `OpenChain` command to the runtime, spawning a *new* microchain specifically for that poll.
*   **State Management**:
    *   **Frontend**: Uses `Valtio` for reactive state, customized with a `LineraStateAdapter` to bridge GraphQL data to the UI.
    *   **Backend**: Rust contract manages `PollState`, including participants, nominations, and rankings using `MapView` for efficient storage.
*   **Identity**: Uses simulated local browser identity (`linera_user_id` in localStorage) to allow testing multi-user scenarios on a single node.

## Legacy (Socket.IO Version)

*To run the deprecated Node.js/Redis version:*
1.  Ensure Redis is running (`docker-compose up`).
2.  Run `npm run start` in root.
