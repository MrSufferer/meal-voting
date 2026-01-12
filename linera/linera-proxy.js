/**
 * Linera Proxy API
 * 
 * A simple Express server that wraps linera CLI commands to create
 * new microchains with application instances for each poll.
 * 
 * Usage:
 *   node linera-proxy.js
 *   
 * Endpoints:
 *   POST /create-poll - Creates a new microchain and deploys the app
 *   GET /health - Health check
 */

const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

// Path to compiled contract and service bytecode
const CONTRACT_PATH = './meal_voting/target/wasm32-unknown-unknown/release/meal_voting_contract.wasm';
const SERVICE_PATH = './meal_voting/target/wasm32-unknown-unknown/release/meal_voting_service.wasm';

// Store published bytecode ID (set after first publish)
let BYTECODE_ID = process.env.LINERA_BYTECODE_ID || null;

/**
 * Execute a linera CLI command and return the output.
 */
async function runLineraCommand(command) {
    console.log(`[linera-proxy] Running: linera ${command}`);
    try {
        const { stdout, stderr } = await execAsync(`linera ${command}`, {
            timeout: 60000, // 60 second timeout
        });
        if (stderr) {
            console.warn(`[linera-proxy] stderr: ${stderr}`);
        }
        return stdout.trim();
    } catch (error) {
        console.error(`[linera-proxy] Command failed:`, error.message);
        throw error;
    }
}

/**
 * Publish bytecode if not already published.
 * Returns the bytecode ID.
 */
async function ensureBytecodePublished() {
    if (BYTECODE_ID) {
        console.log(`[linera-proxy] Using existing bytecode: ${BYTECODE_ID}`);
        return BYTECODE_ID;
    }

    console.log('[linera-proxy] Publishing bytecode...');
    const output = await runLineraCommand(
        `publish-bytecode ${CONTRACT_PATH} ${SERVICE_PATH}`
    );

    // Extract bytecode ID from output (format: "Bytecode ID: <id>")
    const match = output.match(/([a-f0-9]{64})/i);
    if (!match) {
        throw new Error(`Failed to parse bytecode ID from: ${output}`);
    }

    BYTECODE_ID = match[1];
    console.log(`[linera-proxy] Published bytecode: ${BYTECODE_ID}`);
    return BYTECODE_ID;
}

/**
 * Create a new microchain for a poll.
 * Returns the chain ID.
 */
async function createMicrochain() {
    console.log('[linera-proxy] Creating new microchain...');
    const output = await runLineraCommand('open-chain');

    // Extract chain ID from output
    const match = output.match(/([a-f0-9]{64})/i);
    if (!match) {
        throw new Error(`Failed to parse chain ID from: ${output}`);
    }

    const chainId = match[1];
    console.log(`[linera-proxy] Created chain: ${chainId}`);
    return chainId;
}

/**
 * Create an application instance on a chain.
 * Returns the application ID.
 */
async function createApplication(chainId, bytecodeId, initArgs = '{}') {
    console.log(`[linera-proxy] Creating application on chain ${chainId}...`);

    // Create application on the specified chain
    const output = await runLineraCommand(
        `create-application ${bytecodeId} --json-argument '${initArgs}'`
    );

    // Extract application ID from output
    const match = output.match(/([a-f0-9]{64})/i);
    if (!match) {
        throw new Error(`Failed to parse application ID from: ${output}`);
    }

    const appId = match[1];
    console.log(`[linera-proxy] Created application: ${appId}`);
    return appId;
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', bytecodeId: BYTECODE_ID });
});

// Create poll endpoint
app.post('/create-poll', async (req, res) => {
    try {
        console.log('[linera-proxy] Creating new poll...');

        // 1. Ensure bytecode is published
        const bytecodeId = await ensureBytecodePublished();

        // 2. Create a new microchain
        const chainId = await createMicrochain();

        // 3. Create application instance on that chain
        const appId = await createApplication(chainId, bytecodeId);

        // 4. Generate a short poll code (first 6 chars of chain ID)
        const pollCode = chainId.substring(0, 6).toUpperCase();

        res.json({
            success: true,
            pollCode,
            chainId,
            appId,
            graphqlEndpoint: `http://localhost:8081/chains/${chainId}/applications/${appId}`,
        });
    } catch (error) {
        console.error('[linera-proxy] Error creating poll:', error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

// Lookup poll by code (maps short code to full chain/app IDs)
// For now, we require the full chain ID - could add a database for short codes later
app.get('/lookup/:pollCode', async (req, res) => {
    const { pollCode } = req.params;

    // For MVP, pollCode is the chainId
    // In production, you'd use a database to map short codes to chain IDs
    res.json({
        success: true,
        message: 'For MVP, use the full chain ID as the poll code',
        pollCode,
    });
});

app.listen(PORT, () => {
    console.log(`[linera-proxy] Server running on http://localhost:${PORT}`);
    console.log(`[linera-proxy] Bytecode ID: ${BYTECODE_ID || 'Not yet published'}`);
});
