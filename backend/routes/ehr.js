const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { submitTransaction, evaluateTransaction } = require('../services/fabric.service');
const { prepareEHRForUpload, decryptEHR, encryptDEK, decryptDEK } = require('../services/crypto.service');
const { uploadToIPFS, retrieveFromIPFS } = require('../services/ipfs.service');

/**
 * POST /api/v1/ehr
 * Create a new EHR record
 * Role: Doctor only
 */
router.post('/', authenticateToken, requireRole(['Doctor']), async (req, res, next) => {
    try {
        const { patientId, ehrType, ehrData, patientPublicKey } = req.body;

        if (!patientId || !ehrData || !patientPublicKey) {
            return res.status(400).json({ error: 'Missing required fields: patientId, ehrData, patientPublicKey' });
        }

        const ehrId = `EHR-${uuidv4()}`;

        // Step 1: Encrypt EHR and prepare for upload
        const { encryptedPackage, dataHash, encryptedDek } = prepareEHRForUpload(ehrData, patientPublicKey);

        // Step 2: Upload encrypted data to IPFS
        const ipfsCid = await uploadToIPFS(encryptedPackage);

        // Step 3: Store metadata on Fabric
        const result = await submitTransaction(
            req.user.userId,
            'ehr-chaincode',
            'EHRRegistry:createEHR',
            ehrId,
            patientId,
            ipfsCid,
            dataHash,
            encryptedDek,
            ehrType || 'CONSULTATION',
            req.user.userId  // doctorId for creator tracking
        );

        res.status(201).json({
            success: true,
            ehrId,
            ipfsCid,
            dataHash,
            message: 'EHR created successfully'
        });

    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/v1/ehr/:ehrId
 * Retrieve and decrypt an EHR record
 * Role: Doctor (with consent) or Patient (own records)
 */
router.get('/:ehrId', authenticateToken, async (req, res, next) => {
    try {
        const { ehrId } = req.params;
        const { privateKey } = req.body; // Doctor/Patient provides their private key

        // Step 1: Get EHR metadata from Fabric
        const ehrRecord = await evaluateTransaction(
            req.user.userId,
            'ehr-chaincode',
            'EHRRegistry:getEHR',
            ehrId
        );

        if (!ehrRecord) {
            return res.status(404).json({ error: 'EHR not found' });
        }

        // Step 2: For doctors, verify consent
        if (req.user.role === 'Doctor') {
            const accessResult = await evaluateTransaction(
                req.user.userId,
                'ehr-chaincode',
                'AccessControl:checkAccess',
                req.user.userId,
                ehrId,
                ehrRecord.patientId
            );

            if (!accessResult.hasAccess) {
                return res.status(403).json({
                    error: 'Access denied',
                    reason: accessResult.reason
                });
            }
        }

        // Step 3: Get encrypted DEK for this user
        let encryptedDek;
        if (req.user.role === 'Patient') {
            encryptedDek = ehrRecord.encryptedDek; // Patient's DEK copy
        } else {
            // Doctor: try doctor-specific DEK first, fallback to original DEK (demo mode)
            // In production, grantAccess would create a re-encrypted DEK per doctor
            encryptedDek = ehrRecord.accessGrants?.[req.user.userId] || ehrRecord.encryptedDek;
        }

        // Step 3b: Record token issuance on-chain (audit trail per thesis design)
        try {
            const tokenId = `TOKEN-${req.user.userId}-${ehrId}-${Date.now()}`;
            const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString(); // 1 hour
            await submitTransaction(
                req.user.userId,
                'ehr-chaincode',
                'AccessControl:recordTokenIssuance',
                tokenId,
                req.user.userId,
                ehrId,
                expiresAt
            );
        } catch (tokenErr) {
            // Non-fatal: log but don't block EHR retrieval
            console.warn('recordTokenIssuance failed (non-fatal):', tokenErr.message);
        }

        // Step 4: Retrieve encrypted data from IPFS
        const encryptedPackage = await retrieveFromIPFS(ehrRecord.ipfsCid);

        // Step 5: Decrypt (requires private key from client)
        if (privateKey) {
            const decryptedEHR = decryptEHR(encryptedPackage, encryptedDek, privateKey);
            return res.json({
                ehrId,
                metadata: {
                    ehrType: ehrRecord.ehrType,
                    createdBy: ehrRecord.createdBy,
                    createdAt: ehrRecord.createdAt,
                    hospitalId: ehrRecord.hospitalId
                },
                data: JSON.parse(decryptedEHR)
            });
        }

        // Without private key: return metadata + encrypted data only
        res.json({
            ehrId,
            metadata: {
                ehrType: ehrRecord.ehrType,
                createdBy: ehrRecord.createdBy,
                createdAt: ehrRecord.createdAt,
                hospitalId: ehrRecord.hospitalId,
                ipfsCid: ehrRecord.ipfsCid
            },
            encryptedDek,
            note: 'Provide your private key to decrypt the EHR data'
        });

    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/v1/ehr/patient/:patientId
 * Get list of EHRs for a patient
 */
router.get('/patient/:patientId', authenticateToken, async (req, res, next) => {
    try {
        const { patientId } = req.params;
        const { userId, role, orgMsp } = req.user;

        // Patient can always see their own records
        if (role === 'Patient' && userId !== patientId) {
            return res.status(403).json({ error: 'Patients can only view their own EHR list' });
        }

        // Doctor from a different org must have consent
        if (role === 'Doctor' && orgMsp !== 'HospitalAMSP') {
            try {
                const consents = await evaluateTransaction(
                    userId,
                    'ehr-chaincode',
                    'AccessControl:getConsentsByPatient',
                    patientId
                );
                const now = new Date();
                const activeConsent = Array.isArray(consents) && consents.find(c =>
                    c.grantedTo === userId &&
                    c.status === 'ACTIVE' &&
                    new Date(c.expiresAt) > now
                );
                if (!activeConsent) {
                    return res.status(403).json({
                        error: 'Access denied: no active consent from patient',
                        hint: 'Patient must grant consent before cross-hospital access'
                    });
                }

                // Fetch full EHR list then filter by allowed ehrIds
                const allEhrList = await evaluateTransaction(
                    userId, 'ehr-chaincode', 'EHRRegistry:getPatientEHRList', patientId
                );
                const allList = allEhrList || [];

                // If consent covers ALL, return full list; otherwise filter
                const allowedIds = activeConsent.ehrIds;
                const ehrList = (allowedIds === 'ALL')
                    ? allList
                    : allList.filter(e => allowedIds.includes(e.ehrId || e.id));

                return res.json({ patientId, ehrList, consentScope: allowedIds === 'ALL' ? 'ALL' : allowedIds });
            } catch (e) {
                return res.status(403).json({
                    error: 'Access denied: consent verification failed',
                    detail: e.message
                });
            }
        }

        const ehrList = await evaluateTransaction(
            userId,
            'ehr-chaincode',
            'EHRRegistry:getPatientEHRList',
            patientId
        );

        res.json({ patientId, ehrList: ehrList || [] });

    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/v1/ehr/:ehrId
 * Revoke an EHR (patient or admin only)
 */
router.delete('/:ehrId', authenticateToken, requireRole(['Patient', 'Admin']), async (req, res, next) => {
    try {
        const { ehrId } = req.params;

        await submitTransaction(
            req.user.userId,
            'ehr-chaincode',
            'EHRRegistry:revokeEHR',
            ehrId
        );

        res.json({ success: true, message: `EHR ${ehrId} revoked` });

    } catch (error) {
        next(error);
    }
});

module.exports = router;
