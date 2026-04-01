'use strict';

const { Contract } = require('fabric-contract-api');

/**
 * Audit Log Chaincode
 * Immutable audit trail for all EHR access events.
 * Uses composite keys for append-only writes (no updates allowed).
 */
class AuditLogContract extends Contract {

    constructor() {
        super('AuditLog');
    }

    async initLedger(ctx) {
        console.log('Audit Log chaincode initialized');
        return 'OK';
    }

    /**
     * Log an audit event (called by other chaincodes or backend)
     * @param {string} action - Event type
     * @param {string} actorId - Who performed the action
     * @param {string} resourceId - EHR/Consent ID affected
     * @param {string} result - SUCCESS|DENIED|ERROR
     * @param {string} metadataJson - Additional context (optional)
     */
    async logEvent(ctx, action, actorId, resourceId, result, metadataJson) {
        const timestamp = ctx.stub.getTxTimestamp();
        const txId = ctx.stub.getTxID();

        // Pad timestamp for lexicographic ordering
        const ts = new Date(timestamp.seconds * 1000).toISOString();
        const tsKey = ts.replace(/[^0-9]/g, ''); // yyyyMMddHHmmssSSS

        // Composite key: ACTION~timestamp~txId (ensures uniqueness and ordering)
        const compositeKey = ctx.stub.createCompositeKey('AUDIT', [action, tsKey, txId]);

        const auditEntry = {
            docType: 'AUDIT_LOG',
            auditId: `${action}_${tsKey}_${txId.substring(0, 8)}`,
            action,
            actorId,
            resourceId,
            result,
            timestamp: ts,
            txId,
            metadata: metadataJson ? JSON.parse(metadataJson) : {}
        };

        await ctx.stub.putState(compositeKey, Buffer.from(JSON.stringify(auditEntry)));

        // Also index by resourceId for quick lookup
        const resourceKey = ctx.stub.createCompositeKey('RESOURCE~AUDIT', [resourceId, tsKey, txId]);
        await ctx.stub.putState(resourceKey, Buffer.from(JSON.stringify(auditEntry)));

        return JSON.stringify({ success: true, auditId: auditEntry.auditId });
    }

    /**
     * Get full audit trail for a resource (EHR or Consent)
     */
    async getAuditTrail(ctx, resourceId) {
        const prefix = ctx.stub.createCompositeKey('RESOURCE~AUDIT', [resourceId]);
        const iterator = await ctx.stub.getStateByPartialCompositeKey('RESOURCE~AUDIT', [resourceId]);

        const results = [];
        let result = await iterator.next();
        while (!result.done) {
            const entry = JSON.parse(result.value.value.toString());
            results.push(entry);
            result = await iterator.next();
        }

        // Sort by timestamp ascending
        results.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
        return JSON.stringify(results);
    }

    /**
     * Get audit events by actor within a time range
     */
    async getAuditByActor(ctx, actorId, startDate, endDate) {
        const query = {
            selector: {
                docType: 'AUDIT_LOG',
                actorId,
                timestamp: {
                    '$gte': startDate,
                    '$lte': endDate
                }
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

    /**
     * Get audit events for a specific action type
     */
    async getAuditByAction(ctx, action, startDate, endDate) {
        const query = {
            selector: {
                docType: 'AUDIT_LOG',
                action,
                timestamp: {
                    '$gte': startDate || '2000-01-01T00:00:00Z',
                    '$lte': endDate || new Date(ctx.stub.getTxTimestamp().seconds.toNumber() * 1000).toISOString()
                }
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

    /**
     * Get history of state changes for an audit record (Fabric native history)
     */
    async getAuditHistory(ctx, compositeKeyStr) {
        const history = [];
        const iterator = await ctx.stub.getHistoryForKey(compositeKeyStr);

        let result = await iterator.next();
        while (!result.done) {
            history.push({
                txId: result.value.txId,
                timestamp: new Date(result.value.timestamp.seconds * 1000).toISOString(),
                isDelete: result.value.isDelete,
                value: result.value.value ? JSON.parse(result.value.value.toString()) : null
            });
            result = await iterator.next();
        }

        return JSON.stringify(history);
    }
}

module.exports = AuditLogContract;
