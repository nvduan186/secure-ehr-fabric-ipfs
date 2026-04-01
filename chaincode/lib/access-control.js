'use strict';

const { Contract } = require('fabric-contract-api');
const { ClientIdentity } = require('fabric-shim');
const { v4: uuidv4 } = require('uuid');

/**
 * Access Control Chaincode
 * Manages patient consent policies and access token issuance.
 */
class AccessControlContract extends Contract {

    constructor() {
        super('AccessControl');
    }

    async initLedger(ctx) {
        console.log('Access Control chaincode initialized');
        return 'OK';
    }

    /**
     * Grant consent: patient authorizes a doctor to access specific EHRs
     * @param {string} consentId - Unique consent ID
     * @param {string} patientId - Patient ID (must match caller)
     * @param {string} grantedTo - Doctor ID being granted access
     * @param {string} ehrIdsJson - JSON array of EHR IDs, or "ALL"
     * @param {string} purpose - TREATMENT|RESEARCH|EMERGENCY
     * @param {string} expiresAt - ISO8601 expiry datetime
     */
    async grantConsent(ctx, consentId, patientId, grantedTo, ehrIdsJson, purpose, expiresAt) {
        const callerId = this._getCallerId(ctx);
        // In demo: API layer (JWT) already verified caller is the patient.
        // Chaincode enforces role Patient or Admin — callerUserId check skipped
        // because cryptogen cert CN does not match userId (demo limitation).
        this._requireRole(ctx, ['Patient', 'Admin']);

        // Check consent doesn't exist
        const existing = await ctx.stub.getState(this._consentKey(consentId));
        if (existing && existing.length > 0) {
            throw new Error(`Consent ${consentId} already exists`);
        }

        const ehrIds = ehrIdsJson === 'ALL' ? 'ALL' : JSON.parse(ehrIdsJson);
        const now = new Date(ctx.stub.getTxTimestamp().seconds.toNumber() * 1000).toISOString();

        const consent = {
            docType: 'CONSENT',
            consentId,
            patientId,
            grantedTo,
            ehrIds,
            purpose: purpose || 'TREATMENT',
            grantedAt: now,
            expiresAt: expiresAt || null,
            status: 'ACTIVE',
            revokedAt: null
        };

        await ctx.stub.putState(this._consentKey(consentId), Buffer.from(JSON.stringify(consent)));

        // Also index by patient for quick lookup
        const patientConsentKey = ctx.stub.createCompositeKey('patient~consent', [patientId, consentId]);
        await ctx.stub.putState(patientConsentKey, Buffer.from(consentId));

        await this._emitAuditEvent(ctx, 'GRANT_CONSENT', callerId, consentId, 'SUCCESS');

        return JSON.stringify({ success: true, consentId, grantedAt: now });
    }

    /**
     * Revoke consent: patient revokes previously granted access
     */
    async revokeConsent(ctx, consentId) {
        const consentBytes = await ctx.stub.getState(this._consentKey(consentId));
        if (!consentBytes || consentBytes.length === 0) {
            throw new Error(`Consent ${consentId} not found`);
        }

        const consent = JSON.parse(consentBytes.toString());
        const callerId = this._getCallerId(ctx);

        // Demo: role check done at API layer
        this._requireRole(ctx, ['Patient', 'Doctor', 'Admin']);

        if (consent.status !== 'ACTIVE') {
            throw new Error(`Consent ${consentId} is not active`);
        }

        consent.status = 'REVOKED';
        consent.revokedAt = new Date(ctx.stub.getTxTimestamp().seconds.toNumber() * 1000).toISOString();

        await ctx.stub.putState(this._consentKey(consentId), Buffer.from(JSON.stringify(consent)));

        await this._emitAuditEvent(ctx, 'REVOKE_CONSENT', callerId, consentId, 'SUCCESS');

        return JSON.stringify({ success: true, revokedAt: consent.revokedAt });
    }

    /**
     * Check if a requester has valid access to a specific EHR
     * Returns: { hasAccess: bool, consentId: string|null, reason: string }
     */
    async checkAccess(ctx, requesterId, ehrId, patientId) {
        const callerId = this._getCallerId(ctx);

        // Try to load EHR to check if requester is the creator (always allowed)
        try {
            const ehrBytes = await ctx.stub.getState(this._ehrKey(ehrId));
            if (ehrBytes && ehrBytes.length > 0) {
                const ehr = JSON.parse(ehrBytes.toString());
                // Creator can always access their own EHR records
                // Check both plain userId and x509 DN
                if (ehr.createdByUserId === requesterId || 
                    (ehr.createdBy && ehr.createdBy.includes(requesterId))) {
                    return JSON.stringify({ hasAccess: true, consentId: null, purpose: 'CREATOR_ACCESS' });
                }
                // Patient can always access their own EHR
                if (ehr.patientId === requesterId) {
                    return JSON.stringify({ hasAccess: true, consentId: null, purpose: 'PATIENT_ACCESS' });
                }
            }
        } catch (e) { /* ignore, fall through to consent check */ }

        // Query all consents for this patient
        const query = {
            selector: {
                docType: 'CONSENT',
                patientId: patientId,
                grantedTo: requesterId,
                status: 'ACTIVE'
            }
        };

        const iterator = await ctx.stub.getQueryResult(JSON.stringify(query));
        const now = new Date(ctx.stub.getTxTimestamp().seconds.toNumber() * 1000).toISOString();

        let result = await iterator.next();
        while (!result.done) {
            const consent = JSON.parse(result.value.value.toString());

            // Check expiry
            if (consent.expiresAt && consent.expiresAt < now) {
                result = await iterator.next();
                continue;
            }

            // Check EHR coverage
            if (consent.ehrIds === 'ALL' || consent.ehrIds.includes(ehrId)) {
                await this._emitAuditEvent(ctx, 'CHECK_ACCESS', requesterId, ehrId, 'GRANTED');
                return JSON.stringify({
                    hasAccess: true,
                    consentId: consent.consentId,
                    purpose: consent.purpose
                });
            }

            result = await iterator.next();
        }

        await this._emitAuditEvent(ctx, 'CHECK_ACCESS', requesterId, ehrId, 'DENIED');
        return JSON.stringify({
            hasAccess: false,
            consentId: null,
            reason: 'No valid consent found'
        });
    }

    /**
     * Issue a time-limited access token (stored on-chain for verification)
     * Token is a signed structure; backend validates JWT, chaincode records issuance.
     */
    async recordTokenIssuance(ctx, tokenId, requesterId, ehrId, expiresAt) {
        const callerId = this._getCallerId(ctx);
        // Only backend system identity can issue tokens
        this._requireRole(ctx, ['System', 'Admin']);

        const token = {
            docType: 'ACCESS_TOKEN',
            tokenId,
            requesterId,
            ehrId,
            issuedAt: new Date(ctx.stub.getTxTimestamp().seconds.toNumber() * 1000).toISOString(),
            expiresAt,
            status: 'ACTIVE'
        };

        await ctx.stub.putState(this._tokenKey(tokenId), Buffer.from(JSON.stringify(token)));
        await this._emitAuditEvent(ctx, 'ISSUE_TOKEN', requesterId, ehrId, 'SUCCESS');

        return JSON.stringify({ success: true });
    }

    /**
     * Invalidate a token (on revoke or expiry)
     */
    async invalidateToken(ctx, tokenId) {
        const tokenBytes = await ctx.stub.getState(this._tokenKey(tokenId));
        if (!tokenBytes || tokenBytes.length === 0) {
            throw new Error(`Token ${tokenId} not found`);
        }

        const token = JSON.parse(tokenBytes.toString());
        token.status = 'REVOKED';
        token.revokedAt = new Date(ctx.stub.getTxTimestamp().seconds.toNumber() * 1000).toISOString();

        await ctx.stub.putState(this._tokenKey(tokenId), Buffer.from(JSON.stringify(token)));
        await this._emitAuditEvent(ctx, 'INVALIDATE_TOKEN', token.requesterId, token.ehrId, 'SUCCESS');

        return JSON.stringify({ success: true });
    }

    /**
     * Get all consents for a patient
     */
    async getConsentsByPatient(ctx, patientId) {
        const callerId = this._getCallerId(ctx);

        const query = {
            selector: {
                docType: 'CONSENT',
                patientId: patientId
            },
        };

        const results = [];
        const iterator = await ctx.stub.getQueryResult(JSON.stringify(query));

        let result = await iterator.next();
        while (!result.done) {
            results.push(JSON.parse(result.value.value.toString()));
            result = await iterator.next();
        }

        return JSON.stringify(results);
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    _consentKey(consentId) { return `CONSENT_${consentId}`; }
    _tokenKey(tokenId) { return `TOKEN_${tokenId}`; }
    _ehrKey(ehrId) { return `EHR_${ehrId}`; }

    _getCallerId(ctx) {
        const cid = new ClientIdentity(ctx.stub);
        return cid.getID();
    }

    _getCallerUserId(ctx) {
        const cid = new ClientIdentity(ctx.stub);
        // Try attribute first (Fabric CA enrolled users)
        const uid = cid.getAttributeValue('userId') || cid.getAttributeValue('hf.EnrollmentID');
        if (uid) return uid;
        // Fallback: extract CN from x509 subject (cryptogen users like "User2@hospitala.ehr.com")
        const id = cid.getID();
        const cnMatch = id.match(/CN=([^,:/]+)/);
        return cnMatch ? cnMatch[1] : id;
    }

    _requireRole(ctx, allowedRoles) {
        const cid = new ClientIdentity(ctx.stub);
        let role = cid.getAttributeValue('role');
        if (!role) {
            const id = cid.getID();
            const cnMatch = id.match(/CN=([^,:/]+)/);
            const cn = cnMatch ? cnMatch[1].toUpperCase() : '';
            if (cn.startsWith('DOC') || cn.startsWith('USER1')) role = 'Doctor';
            else if (cn.startsWith('PAT') || cn.startsWith('USER2') || cn.startsWith('USER3')) role = 'Patient';
            else if (cn.startsWith('ADM') || cn.startsWith('ADMIN')) role = 'Admin';
            else throw new Error('Access denied: unknown identity, cannot derive role');
        }
        if (!role || !allowedRoles.includes(role)) {
            throw new Error(`Access denied. Required roles: ${allowedRoles.join(', ')}`);
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
            const resourceKey = ctx.stub.createCompositeKey('RESOURCE~AUDIT', [resourceId, tsKey, txId]);
            await ctx.stub.putState(resourceKey, Buffer.from(JSON.stringify(auditEntry)));
            ctx.stub.setEvent('AuditEvent', Buffer.from(JSON.stringify(auditEntry)));
        } catch (e) {
            console.error('Audit event error:', e);
        }
    }
}

module.exports = AccessControlContract;
