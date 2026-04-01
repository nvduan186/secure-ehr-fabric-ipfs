require('dotenv').config();
const { connect } = require('@hyperledger/fabric-gateway');
const grpc = require('@grpc/grpc-js');
const { promises: fs } = require('fs');
const path = require('path');
const crypto = require('crypto');

const CHANNEL_NAME = process.env.FABRIC_CHANNEL || 'ehr-channel';
const PEER_ENDPOINT = process.env.FABRIC_PEER_ENDPOINT || 'localhost:7051';
const PEER_HOST_ALIAS = process.env.FABRIC_PEER_HOST || 'peer0.hospitala.ehr.com';
const CRYPTO_PATH = process.env.FABRIC_CRYPTO_PATH
    ? path.resolve(process.env.FABRIC_CRYPTO_PATH)
    : path.resolve(__dirname, '../../fabric-network/organizations/peerOrganizations/hospitala.ehr.com');
const WALLET_PATH = process.env.FABRIC_WALLET_PATH
    ? path.resolve(process.env.FABRIC_WALLET_PATH)
    : path.resolve(__dirname, '../wallet/hospitala');

/**
 * Load identity from wallet file
 * @param {string} userId
 * @returns {{ certificate: string, privateKey: string, mspId: string }}
 */
async function loadIdentity(userId, orgMsp) {
    // Determine wallet sub-folder from orgMsp or userId prefix
    let orgFolder = 'hospitala';
    if (orgMsp === 'HospitalBMSP' || userId.endsWith('-B') || userId === 'DOC002' || userId === 'PAT002') {
        orgFolder = 'hospitalb';
    }
    const baseWallet = path.resolve(__dirname, '../wallet');
    const walletFile = path.join(baseWallet, orgFolder, `${userId}.id`);
    try {
        const raw = await fs.readFile(walletFile, 'utf8');
        return JSON.parse(raw);
    } catch (e) {
        // fallback: try other org wallet
        const fallbackFile = path.join(baseWallet, orgFolder === 'hospitala' ? 'hospitalb' : 'hospitala', `${userId}.id`);
        try {
            const raw = await fs.readFile(fallbackFile, 'utf8');
            return JSON.parse(raw);
        } catch (_) {
            throw new Error(`Identity not found for ${userId}. Run scripts/enrollAdmin.js first. (${walletFile})`);
        }
    }
}

/**
 * Create a gRPC client to Fabric peer (TLS enabled)
 */
async function newGrpcClient() {
    const tlsCertPath = path.resolve(
        CRYPTO_PATH,
        'peers/peer0.hospitala.ehr.com/tls/ca.crt'
    );
    const tlsRootCert = await fs.readFile(tlsCertPath);
    const credentials = grpc.credentials.createSsl(tlsRootCert);
    return new grpc.Client(PEER_ENDPOINT, credentials, {
        'grpc.ssl_target_name_override': PEER_HOST_ALIAS,
        'grpc.max_receive_message_length': 10 * 1024 * 1024,
        'grpc.max_send_message_length': 10 * 1024 * 1024
    });
}

/**
 * Create a Fabric Gateway connection for a given user
 * @param {string} userId - identity to use from wallet
 */
async function newGateway(userId, orgMsp) {
    const identity = await loadIdentity(userId, orgMsp);
    const client = await newGrpcClient();

    const privateKey = crypto.createPrivateKey(identity.credentials.privateKey);
    const signer = require('@hyperledger/fabric-gateway').signers.newPrivateKeySigner(privateKey);

    const gateway = connect({
        client,
        identity: {
            mspId: identity.mspId,
            credentials: Buffer.from(identity.credentials.certificate)
        },
        signer,
        evaluateOptions: () => ({ deadline: Date.now() + 10000 }),
        endorseOptions: () => ({ deadline: Date.now() + 60000 }),
        submitOptions: () => ({ deadline: Date.now() + 30000 }),
        commitStatusOptions: () => ({ deadline: Date.now() + 120000 })
    });

    return { gateway, client };
}

/**
 * Submit a transaction (write operation)
 * @param {string} userId - Fabric identity to use
 * @param {string} chaincodeName
 * @param {string} functionName
 * @param  {...string} args
 */
async function submitTransaction(userId, chaincodeName, functionName, ...args) {
    // Last arg may be orgMsp if passed as options object - extract it
    let orgMsp = 'HospitalAMSP';
    if (args.length > 0 && typeof args[args.length-1] === 'object' && args[args.length-1]?.__orgMsp) {
        orgMsp = args.pop().__orgMsp;
    }
    const { gateway, client } = await newGateway(userId, orgMsp);
    try {
        const network = gateway.getNetwork(CHANNEL_NAME);
        const contract = network.getContract(chaincodeName);
        // submitAsync: endorse + submit to orderer, then wait commit with timeout
        const submit = await contract.submitAsync(functionName, { arguments: args });
        const resultBytes = submit.getResult();
        // wait for commit (best-effort, ignore timeout — tx already submitted)
        try {
            await submit.getStatus();
        } catch (commitErr) {
            // CommitStatus timeout is non-fatal: tx was submitted to orderer
            console.warn('CommitStatus wait timed out (tx submitted):', commitErr.message?.slice(0, 80));
        }
        return resultBytes.length > 0 ? JSON.parse(Buffer.from(resultBytes).toString()) : null;
    } finally {
        gateway.close();
        client.close();
    }
}

/**
 * Evaluate a transaction (read-only query)
 */
async function evaluateTransaction(userId, chaincodeName, functionName, ...args) {
    let orgMsp = 'HospitalAMSP';
    if (args.length > 0 && typeof args[args.length-1] === 'object' && args[args.length-1]?.__orgMsp) {
        orgMsp = args.pop().__orgMsp;
    }
    const { gateway, client } = await newGateway(userId, orgMsp);
    try {
        const network = gateway.getNetwork(CHANNEL_NAME);
        const contract = network.getContract(chaincodeName);
        const resultBytes = await contract.evaluateTransaction(functionName, ...args);
        return resultBytes.length > 0 ? JSON.parse(Buffer.from(resultBytes).toString()) : null;
    } finally {
        gateway.close();
        client.close();
    }
}

module.exports = { submitTransaction, evaluateTransaction, loadIdentity };
