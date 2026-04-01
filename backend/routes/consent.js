const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { submitTransaction, evaluateTransaction } = require('../services/fabric.service');

/**
 * POST /api/v1/consent
 * Patient grants consent to a doctor
 */
router.post('/', authenticateToken, requireRole(['Patient', 'Admin']), async (req, res, next) => {
    try {
        // Support both field naming conventions
        const grantedTo = req.body.grantedTo || req.body.doctorId;
        const ehrIds = req.body.ehrIds || (req.body.ehrId ? [req.body.ehrId] : null);
        const purpose = req.body.purpose;
        let expiresAt = req.body.expiresAt;
        if (!expiresAt && req.body.durationHours) {
            expiresAt = new Date(Date.now() + req.body.durationHours * 3600 * 1000).toISOString();
        }
        if (!expiresAt && req.body.durationDays) {
            expiresAt = new Date(Date.now() + req.body.durationDays * 24 * 3600 * 1000).toISOString();
        }

        if (!grantedTo) {
            return res.status(400).json({ error: 'Missing required field: grantedTo or doctorId' });
        }

        const consentId = `CONSENT-${uuidv4()}`;
        const patientId = req.user.userId;
        const ehrIdsArg = ehrIds ? JSON.stringify(ehrIds) : 'ALL';
        const expiry = expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days default

        const result = await submitTransaction(
            req.user.userId,
            'ehr-chaincode',
            'AccessControl:grantConsent',
            consentId,
            patientId,
            grantedTo,
            ehrIdsArg,
            purpose || 'TREATMENT',
            expiry
        );

        res.status(201).json({
            success: true,
            consentId,
            grantedTo,
            expiresAt: expiry,
            message: 'Consent granted successfully'
        });

    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/v1/consent/:consentId
 * Patient revokes a consent
 */
router.delete('/:consentId', authenticateToken, requireRole(['Patient', 'Admin']), async (req, res, next) => {
    try {
        const { consentId } = req.params;

        await submitTransaction(
            req.user.userId,
            'ehr-chaincode',
            'AccessControl:revokeConsent',
            consentId
        );

        res.json({ success: true, message: `Consent ${consentId} revoked` });

    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/v1/consent/patient/:patientId
 * Get all consents for a patient
 */
router.get('/patient/:patientId', authenticateToken, async (req, res, next) => {
    try {
        const { patientId } = req.params;

        // Patients can only see their own consents
        if (req.user.role === 'Patient' && req.user.userId !== patientId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const consents = await evaluateTransaction(
            req.user.userId,
            'ehr-chaincode',
            'AccessControl:getConsentsByPatient',
            patientId
        );

        res.json({ patientId, consents: consents || [] });

    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/v1/consent/check
 * Check if a doctor has access to a specific EHR
 */
router.get('/check', authenticateToken, async (req, res, next) => {
    try {
        const { requesterId, ehrId, patientId } = req.query;

        if (!requesterId || !ehrId || !patientId) {
            return res.status(400).json({ error: 'Missing query params: requesterId, ehrId, patientId' });
        }

        const result = await evaluateTransaction(
            req.user.userId,
            'ehr-chaincode',
            'AccessControl:checkAccess',
            requesterId,
            ehrId,
            patientId
        );

        res.json(result);

    } catch (error) {
        next(error);
    }
});

module.exports = router;
