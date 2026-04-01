const crypto = require('crypto');
const forge = require('node-forge');

/**
 * Encryption Service
 * Implements envelope encryption: AES-256-GCM for data, RSA-OAEP for key wrapping.
 */

const AES_KEY_LENGTH = 32; // 256 bits
const AES_IV_LENGTH = 12;  // 96 bits for GCM
const AES_AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * Generate a random Data Encryption Key (DEK)
 */
function generateDEK() {
    return crypto.randomBytes(AES_KEY_LENGTH);
}

/**
 * Encrypt data using AES-256-GCM
 * @param {Buffer|string} plaintext - Data to encrypt
 * @param {Buffer} dek - 32-byte data encryption key
 * @returns {{ ciphertext: string, iv: string, authTag: string }} base64-encoded components
 */
function encryptData(plaintext, dek) {
    const iv = crypto.randomBytes(AES_IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);

    const data = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext, 'utf8');
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
        ciphertext: encrypted.toString('base64'),
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64')
    };
}

/**
 * Decrypt data using AES-256-GCM
 * @param {string} ciphertext - base64-encoded ciphertext
 * @param {string} iv - base64-encoded IV
 * @param {string} authTag - base64-encoded auth tag
 * @param {Buffer} dek - 32-byte data encryption key
 * @returns {string} decrypted plaintext
 */
function decryptData(ciphertext, iv, authTag, dek) {
    const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        dek,
        Buffer.from(iv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(authTag, 'base64'));

    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(ciphertext, 'base64')),
        decipher.final()
    ]);

    return decrypted.toString('utf8');
}

/**
 * Encrypt a DEK using RSA-OAEP with a public key (PEM format)
 * @param {Buffer} dek - Data Encryption Key
 * @param {string} publicKeyPem - RSA public key in PEM format
 * @returns {string} base64-encoded encrypted DEK
 */
function encryptDEK(dek, publicKeyPem) {
    const publicKey = forge.pki.publicKeyFromPem(publicKeyPem);
    const encryptedDek = publicKey.encrypt(dek.toString('binary'), 'RSA-OAEP', {
        md: forge.md.sha256.create(),
        mgf1: { md: forge.md.sha256.create() }
    });
    return forge.util.encode64(encryptedDek);
}

/**
 * Decrypt an encrypted DEK using RSA private key
 * @param {string} encryptedDekB64 - base64-encoded encrypted DEK
 * @param {string} privateKeyPem - RSA private key in PEM format
 * @returns {Buffer} decrypted DEK
 */
function decryptDEK(encryptedDekB64, privateKeyPem) {
    const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
    const encryptedDekBinary = forge.util.decode64(encryptedDekB64);
    const decryptedBinary = privateKey.decrypt(encryptedDekBinary, 'RSA-OAEP', {
        md: forge.md.sha256.create(),
        mgf1: { md: forge.md.sha256.create() }
    });
    return Buffer.from(decryptedBinary, 'binary');
}

/**
 * Compute SHA-256 hash of data
 * @param {string|Buffer} data
 * @returns {string} hex hash
 */
function computeHash(data) {
    return crypto.createHash('sha256')
        .update(Buffer.isBuffer(data) ? data : Buffer.from(data))
        .digest('hex');
}

/**
 * Prepare EHR for upload: encrypt and return encrypted package
 */
function prepareEHRForUpload(ehrData, patientPublicKeyPem) {
    const plaintext = typeof ehrData === 'string' ? ehrData : JSON.stringify(ehrData);
    const dek = generateDEK();
    const { ciphertext, iv, authTag } = encryptData(plaintext, dek);
    const encryptedPackage = JSON.stringify({ ciphertext, iv, authTag });
    const dataHash = computeHash(encryptedPackage);
    const encryptedDek = encryptDEK(dek, patientPublicKeyPem);

    return {
        encryptedPackage,   // Upload this to IPFS
        dataHash,           // Store on-chain
        encryptedDek,       // Store on-chain (patient's copy)
        dek                 // Keep in memory only! Do not persist
    };
}

/**
 * Decrypt EHR retrieved from IPFS
 */
function decryptEHR(encryptedPackage, encryptedDek, privateKeyPem) {
    const dek = decryptDEK(encryptedDek, privateKeyPem);
    const { ciphertext, iv, authTag } = JSON.parse(encryptedPackage);
    return decryptData(ciphertext, iv, authTag, dek);
}

module.exports = {
    generateDEK,
    encryptData,
    decryptData,
    encryptDEK,
    decryptDEK,
    computeHash,
    prepareEHRForUpload,
    decryptEHR
};
