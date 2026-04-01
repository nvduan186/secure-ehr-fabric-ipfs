const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { evaluateTransaction } = require('../services/fabric.service');

/**
 * GET /api/v1/audit/:resourceId
 * Get audit trail for a specific EHR or Consent
 */
router.get('/:resourceId', authenticateToken, async (req, res, next) => {
    try {
        const { resourceId } = req.params;

        const auditTrail = await evaluateTransaction(
            req.user.userId,
            'ehr-chaincode',
            'AuditLog:getAuditTrail',
            resourceId
        );

        res.json({ resourceId, auditTrail: auditTrail || [] });

    } catch (error) {
        next(error);
    }
});

module.exports = router;
