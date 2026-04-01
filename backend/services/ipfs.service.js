const { create } = require('kubo-rpc-client');

const IPFS_API_URL = process.env.IPFS_API_URL || '/ip4/127.0.0.1/tcp/5001';

let ipfsClient = null;

function getClient() {
    if (!ipfsClient) {
        ipfsClient = create({ url: IPFS_API_URL });
    }
    return ipfsClient;
}

/**
 * Upload encrypted EHR data to IPFS
 * @param {string} encryptedData - JSON string of encrypted package
 * @returns {string} IPFS CID
 */
async function uploadToIPFS(encryptedData) {
    const client = getClient();
    const buffer = Buffer.from(encryptedData);
    const { cid } = await client.add(buffer, { pin: true });
    return cid.toString();
}

/**
 * Retrieve encrypted EHR data from IPFS
 * @param {string} cid - IPFS Content Identifier
 * @returns {string} encrypted data as string
 */
async function retrieveFromIPFS(cid) {
    const client = getClient();
    const chunks = [];
    for await (const chunk of client.cat(cid)) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString();
}

/**
 * Unpin data from IPFS (for data deletion/revocation)
 * @param {string} cid - IPFS Content Identifier
 */
async function unpinFromIPFS(cid) {
    const client = getClient();
    await client.pin.rm(cid);
}

module.exports = { uploadToIPFS, retrieveFromIPFS, unpinFromIPFS };
