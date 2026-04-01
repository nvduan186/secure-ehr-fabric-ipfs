'use strict';

/**
 * enrollAdmin.js
 * Enroll the admin user for HospitalA with Fabric CA
 * and store identity in local wallet (JSON files).
 *
 * Usage: node scripts/enrollAdmin.js [hospitala|hospitalb]
 */

const FabricCAServices = require('fabric-ca-client');
const { Wallets } = require('@hyperledger/fabric-gateway');
const fs = require('fs');
const path = require('path');

const ORG_CONFIGS = {
    hospitala: {
        caUrl: 'https://localhost:7054',
        caName: 'ca-hospitala',
        mspId: 'HospitalAMSP',
        caTlsCert: path.resolve(__dirname, '../../fabric-network/organizations/fabric-ca/hospitala/tls-cert.pem'),
        walletPath: path.resolve(__dirname, '../wallet/hospitala'),
        adminId: 'admin',
        adminPwd: 'adminpw'
    },
    hospitalb: {
        caUrl: 'https://localhost:8054',
        caName: 'ca-hospitalb',
        mspId: 'HospitalBMSP',
        caTlsCert: path.resolve(__dirname, '../../fabric-network/organizations/fabric-ca/hospitalb/tls-cert.pem'),
        walletPath: path.resolve(__dirname, '../wallet/hospitalb'),
        adminId: 'admin',
        adminPwd: 'adminpw'
    }
};

async function enrollAdmin(orgName) {
    const config = ORG_CONFIGS[orgName];
    if (!config) {
        throw new Error(`Unknown org: ${orgName}. Use 'hospitala' or 'hospitalb'`);
    }

    // Ensure wallet directory exists
    fs.mkdirSync(config.walletPath, { recursive: true });
    const walletFile = path.join(config.walletPath, 'admin.id');

    if (fs.existsSync(walletFile)) {
        console.log(`Admin identity already exists for ${orgName}. Skipping enrollment.`);
        return;
    }

    const tlsCert = fs.readFileSync(config.caTlsCert).toString();
    const ca = new FabricCAServices(config.caUrl, {
        trustedRoots: tlsCert,
        verify: false
    }, config.caName);

    // Enroll admin
    const enrollment = await ca.enroll({
        enrollmentID: config.adminId,
        enrollmentSecret: config.adminPwd
    });

    const identity = {
        credentials: {
            certificate: enrollment.certificate,
            privateKey: enrollment.key.toBytes()
        },
        mspId: config.mspId,
        type: 'X.509'
    };

    fs.writeFileSync(walletFile, JSON.stringify(identity, null, 2));
    console.log(`✅ Admin enrolled for ${orgName}. Identity saved to ${walletFile}`);
}

// Register a new user (Doctor, Patient, etc.)
async function registerUser(orgName, userId, role, affiliation = '') {
    const config = ORG_CONFIGS[orgName];
    const walletPath = config.walletPath;
    const adminFile = path.join(walletPath, 'admin.id');

    if (!fs.existsSync(adminFile)) {
        throw new Error(`Admin not enrolled for ${orgName}. Run enrollAdmin first.`);
    }

    const userFile = path.join(walletPath, `${userId}.id`);
    if (fs.existsSync(userFile)) {
        console.log(`User ${userId} already registered.`);
        return;
    }

    const adminIdentity = JSON.parse(fs.readFileSync(adminFile));
    const tlsCert = fs.readFileSync(config.caTlsCert).toString();
    const ca = new FabricCAServices(config.caUrl, {
        trustedRoots: tlsCert,
        verify: false
    }, config.caName);

    // Register
    const secret = await ca.register({
        affiliation: affiliation || `${orgName}.department1`,
        enrollmentID: userId,
        role: 'client',
        attrs: [{ name: 'role', value: role, ecert: true }]
    }, { type: 'X.509', credentials: adminIdentity.credentials });

    // Enroll
    const enrollment = await ca.enroll({
        enrollmentID: userId,
        enrollmentSecret: secret,
        attr_reqs: [{ name: 'role', optional: false }]
    });

    const identity = {
        credentials: {
            certificate: enrollment.certificate,
            privateKey: enrollment.key.toBytes()
        },
        mspId: config.mspId,
        type: 'X.509',
        role,
        userId
    };

    fs.writeFileSync(userFile, JSON.stringify(identity, null, 2));
    console.log(`✅ User ${userId} (${role}) registered for ${orgName}.`);
    return secret;
}

// ── CLI Entry ─────────────────────────────────────────────────────────────────
async function main() {
    const org = process.argv[2] || 'hospitala';
    try {
        await enrollAdmin(org);

        // Pre-register sample users for demo
        if (org === 'hospitala') {
            await registerUser(org, 'DOC-001', 'Doctor');
            await registerUser(org, 'PAT-001', 'Patient');
            await registerUser(org, 'ADM-001', 'Admin');
        } else {
            await registerUser(org, 'DOC-002', 'Doctor');
            await registerUser(org, 'PAT-002', 'Patient');
        }

        console.log('\n✅ Enrollment complete. Wallet ready.');
    } catch (err) {
        console.error('Enrollment failed:', err.message);
        process.exit(1);
    }
}

main();

module.exports = { enrollAdmin, registerUser };
