'use strict';

/**
 * testConnection.js — Kiểm tra kết nối đến Fabric peer và IPFS
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const grpc = require('@grpc/grpc-js');
const { connect, signers } = require('@hyperledger/fabric-gateway');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PEER_ENDPOINT = process.env.FABRIC_PEER_ENDPOINT || 'localhost:7051';
const PEER_HOST = process.env.FABRIC_PEER_HOST || 'peer0.hospitala.ehr.com';
const CRYPTO_PATH = process.env.FABRIC_CRYPTO_PATH || path.resolve(__dirname, '../../fabric-network/organizations/peerOrganizations/hospitala.ehr.com');
const CHANNEL = process.env.FABRIC_CHANNEL || 'ehr-channel';

async function testFabricConnection() {
    console.log('\n🔗 Testing Fabric connection...');
    console.log(`   Peer: ${PEER_ENDPOINT} (${PEER_HOST})`);

    const tlsCertPath = path.join(CRYPTO_PATH, 'peers/peer0.hospitala.ehr.com/tls/ca.crt');
    if (!fs.existsSync(tlsCertPath)) {
        console.warn(`   ⚠️  TLS cert not found at: ${tlsCertPath}`);
        console.warn('   Make sure Fabric network is up (network-up.sh)');
        return false;
    }

    const tlsRootCert = fs.readFileSync(tlsCertPath);
    const credentials = grpc.credentials.createSsl(tlsRootCert);

    const client = new grpc.Client(PEER_ENDPOINT, credentials, {
        'grpc.ssl_target_name_override': PEER_HOST
    });

    return new Promise((resolve) => {
        client.waitForReady(Date.now() + 5000, (err) => {
            if (err) {
                console.error('   ❌ Fabric connection FAILED:', err.message);
                resolve(false);
            } else {
                console.log('   ✅ Fabric peer reachable');
                resolve(true);
            }
            client.close();
        });
    });
}

async function testIPFSConnection() {
    console.log('\n🔗 Testing IPFS connection...');
    const ipfsUrl = process.env.IPFS_API_URL || 'http://127.0.0.1:5001';
    const baseUrl = ipfsUrl.startsWith('/') ? 'http://127.0.0.1:5001' : ipfsUrl;

    try {
        const res = await fetch(`${baseUrl}/api/v0/id`, { method: 'POST', signal: AbortSignal.timeout(3000) });
        if (res.ok) {
            const data = await res.json();
            console.log(`   ✅ IPFS daemon reachable. Peer ID: ${data.ID?.substring(0, 20)}...`);
            return true;
        }
    } catch (e) {
        console.error('   ❌ IPFS connection FAILED:', e.message);
        console.warn('   Run: ipfs daemon &');
    }
    return false;
}

async function main() {
    console.log('=== EHR Backend Connection Test ===');

    const fabricOk = await testFabricConnection();
    const ipfsOk = await testIPFSConnection();

    console.log('\n=== Summary ===');
    console.log(`Fabric:  ${fabricOk ? '✅ OK' : '❌ FAIL'}`);
    console.log(`IPFS:    ${ipfsOk  ? '✅ OK' : '❌ FAIL'}`);

    if (!fabricOk || !ipfsOk) {
        console.log('\nFix issues above before running: npm start');
        process.exit(1);
    } else {
        console.log('\n✅ All systems ready. Run: npm start');
    }
}

main();
