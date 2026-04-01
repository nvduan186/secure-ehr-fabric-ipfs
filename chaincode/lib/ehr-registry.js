'use strict';

const { Contract } = require('fabric-contract-api');
const { ClientIdentity } = require('fabric-shim');
const crypto = require('crypto');

/**
 * EHR Registry Chaincode
 * Manages EHR metadata on-chain. Actual EHR data is stored encrypted on IPFS.
 */
class EHRRegistryContract extends Contract {

    constructor() {
        super('EHRRegistry');
    }

    async initLedger(ctx) {
        console.log('EHR Registry chaincode initialized');
        return 'OK';
    }

    /**
     * Create a new EHR record (Doctor only)
     * @param {Context} ctx
     * @param {string} ehrId - Unique EHR ID
     * @param {string} patientId - Patient pseudonymized ID
     * @param {string} ipfsCid - IPFS Content Identifier of encrypted EHR
     * @param {string} dataHash - SHA-256 hash of encrypted data for integrity check
     * @param {string} encryptedDek - DEK encrypted with patient's public key (base64)
     * @param {string} ehrType - CONSULTATION|LAB|IMAGING|PRESCRIPTION
     */
    async createEHR(ctx, ehrId, patientId, ipfsCid, dataHash, encryptedDek, ehrType, doctorId) {
        // Verify caller role is Doctor
        this._requireRole(ctx, ['Doctor', 'Admin']);

        // Check EHR doesn't already exist
        const existing = await ctx.stub.getState(this._ehrKey(ehrId));
        if (existing && existing.length > 0) {
            throw new Error(`EHR ${ehrId} already exists`);
        }

        const callerId = this._getCallerId(ctx);
        const timestamp = new Date(ctx.stub.getTxTimestamp().seconds.toNumber() * 1000).toISOString();

        const ehrRecord = {
            docType: 'EHR',
            ehrId,
            patientId,
            createdBy: callerId,
            createdByUserId: doctorId || callerId,  // store plain userId for access check
            hospitalId: this._getCallerOrg(ctx),
            ipfsCid,
            dataHash,
            encryptedDek,
            ehrType: ehrType || 'CONSULTATION',
            createdAt: timestamp,
            updatedAt: timestamp,
            status: 'ACTIVE',
            accessGrants: {}
        };

        await ctx.stub.putState(this._ehrKey(ehrId), Buffer.from(JSON.stringify(ehrRecord)));

        // Cross-chaincode call to audit log
        await this._emitAuditEvent(ctx, 'CREATE_EHR', callerId, ehrId, 'SUCCESS');

        return JSON.stringify({ success: true, ehrId, timestamp });
    }

    /**
     * Get EHR metadata (checks access policy)
     */
    async getEHR(ctx, ehrId) {
        const ehrBytes = await ctx.stub.getState(this._ehrKey(ehrId));
        if (!ehrBytes || ehrBytes.length === 0) {
            throw new Error(`EHR ${ehrId} not found`);
        }

        const ehr = JSON.parse(ehrBytes.toString());
        if (ehr.status !== 'ACTIVE') {
            throw new Error(`EHR ${ehrId} is not active`);
        }

        const callerId = this._getCallerId(ctx);
        // Patient can always see their own EHR
        if (ehr.patientId !== callerId) {
            // For doctors, access is verified by Access Control chaincode (called from backend)
            // Here we just return the record; backend enforces via CheckAccess before calling this
            this._requireRole(ctx, ['Doctor', 'Patient', 'Admin']);
        }

        await this._emitAuditEvent(ctx, 'READ_EHR', callerId, ehrId, 'SUCCESS');
        return ehrBytes.toString();
    }

    /**
     * Add access grant: store DEK encrypted with a specific doctor's public key
     */
    async addAccessGrant(ctx, ehrId, doctorId, encryptedDekForDoctor) {
        const ehrBytes = await ctx.stub.getState(this._ehrKey(ehrId));
        if (!ehrBytes || ehrBytes.length === 0) {
            throw new Error(`EHR ${ehrId} not found`);
        }

        const ehr = JSON.parse(ehrBytes.toString());
        const callerId = this._getCallerId(ctx);

        // Only patient or system (via Access Control chaincode) can add grants
        if (ehr.patientId !== callerId) {
            this._requireRole(ctx, ['Admin']);
        }

        ehr.accessGrants[doctorId] = encryptedDekForDoctor;
        ehr.updatedAt = new Date(ctx.stub.getTxTimestamp().seconds.toNumber() * 1000).toISOString();

        await ctx.stub.putState(this._ehrKey(ehrId), Buffer.from(JSON.stringify(ehr)));
        await this._emitAuditEvent(ctx, 'ADD_ACCESS_GRANT', callerId, ehrId, 'SUCCESS');

        return JSON.stringify({ success: true });
    }

    /**
     * Revoke access grant for a specific doctor
     */
    async revokeAccessGrant(ctx, ehrId, doctorId) {
        const ehrBytes = await ctx.stub.getState(this._ehrKey(ehrId));
        if (!ehrBytes || ehrBytes.length === 0) {
            throw new Error(`EHR ${ehrId} not found`);
        }

        const ehr = JSON.parse(ehrBytes.toString());
        const callerId = this._getCallerId(ctx);

        if (ehr.patientId !== callerId) {
            this._requireRole(ctx, ['Admin']);
        }

        delete ehr.accessGrants[doctorId];
        ehr.updatedAt = new Date(ctx.stub.getTxTimestamp().seconds.toNumber() * 1000).toISOString();

        await ctx.stub.putState(this._ehrKey(ehrId), Buffer.from(JSON.stringify(ehr)));
        await this._emitAuditEvent(ctx, 'REVOKE_ACCESS_GRANT', callerId, ehrId, 'SUCCESS');

        return JSON.stringify({ success: true });
    }

    /**
     * Get all EHR records for a patient (returns list of metadata)
     */
    async getPatientEHRList(ctx, patientId) {
        const callerId = this._getCallerId(ctx);
        // Patient views own records, doctors/admins can query
        this._requireRole(ctx, ['Doctor', 'Patient', 'Admin']);

        const query = {
            selector: {
                docType: 'EHR',
                patientId: patientId,
                status: 'ACTIVE'
            }
        };

        const results = [];
        const iterator = await ctx.stub.getQueryResult(JSON.stringify(query));

        let result = await iterator.next();
        while (!result.done) {
            const record = JSON.parse(result.value.value.toString());
            // Return metadata only, not the encryptedDek
            results.push({
                ehrId: record.ehrId,
                ehrType: record.ehrType,
                createdBy: record.createdBy,
                hospitalId: record.hospitalId,
                createdAt: record.createdAt,
                ipfsCid: record.ipfsCid
            });
            result = await iterator.next();
        }

        return JSON.stringify(results);
    }

    /**
     * Revoke (deactivate) an EHR record
     */
    async revokeEHR(ctx, ehrId) {
        const ehrBytes = await ctx.stub.getState(this._ehrKey(ehrId));
        if (!ehrBytes || ehrBytes.length === 0) {
            throw new Error(`EHR ${ehrId} not found`);
        }

        const ehr = JSON.parse(ehrBytes.toString());
        const callerId = this._getCallerId(ctx);

        if (ehr.patientId !== callerId) {
            this._requireRole(ctx, ['Admin']);
        }

        ehr.status = 'REVOKED';
        ehr.updatedAt = new Date(ctx.stub.getTxTimestamp().seconds.toNumber() * 1000).toISOString();

        await ctx.stub.putState(this._ehrKey(ehrId), Buffer.from(JSON.stringify(ehr)));
        await this._emitAuditEvent(ctx, 'REVOKE_EHR', callerId, ehrId, 'SUCCESS');

        return JSON.stringify({ success: true });
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    _ehrKey(ehrId) {
        return `EHR_${ehrId}`;
    }

    _getCallerId(ctx) {
        const cid = new ClientIdentity(ctx.stub);
        return cid.getID();
    }

    _getCallerOrg(ctx) {
        const cid = new ClientIdentity(ctx.stub);
        return cid.getMSPID();
    }

    _requireRole(ctx, allowedRoles) {
        const cid = new ClientIdentity(ctx.stub);
        let role = cid.getAttributeValue('role');
        // Fallback: derive role from userId CN prefix (DOC=Doctor, PAT=Patient, ADM=Admin)
        if (!role) {
            const id = cid.getID(); // full x509 subject
            const cnMatch = id.match(/CN=([^,:/]+)/);
            const cn = cnMatch ? cnMatch[1].toUpperCase() : '';
            if (cn.startsWith('DOC') || cn.startsWith('USER1')) role = 'Doctor';
            else if (cn.startsWith('PAT') || cn.startsWith('USER2') || cn.startsWith('USER3')) role = 'Patient';
            else if (cn.startsWith('ADM') || cn.startsWith('ADMIN')) role = 'Admin';
            else throw new Error('Access denied: unknown identity, cannot derive role');
        }
        if (!role || !allowedRoles.includes(role)) {
            throw new Error(`Access denied. Required roles: ${allowedRoles.join(', ')}. Current role: ${role}`);
        }
    }

    async _emitAuditEvent(ctx, action, actorId, resourceId, result) {
        try {
            const ts = new Date(ctx.stub.getTxTimestamp().seconds.toNumber() * 1000).toISOString();
            const txId = ctx.stub.getTxID();
            const tsKey = ts.replace(/[^0-9]/g, '');

            const auditEntry = {
                docType: 'AUDIT_LOG',
                auditId: `${action}_${tsKey}_${txId.substring(0, 8)}`,
                action, actorId, resourceId, result,
                timestamp: ts, txId, metadata: {}
            };

            // Store under resource composite key (matches AuditLog.getAuditTrail query)
            const resourceKey = ctx.stub.createCompositeKey('RESOURCE~AUDIT', [resourceId, tsKey, txId]);
            await ctx.stub.putState(resourceKey, Buffer.from(JSON.stringify(auditEntry)));

            // Also emit as chaincode event
            ctx.stub.setEvent('AuditEvent', Buffer.from(JSON.stringify(auditEntry)));
        } catch (e) {
            console.error('Audit event error:', e);
        }
    }
}

module.exports = EHRRegistryContract;
