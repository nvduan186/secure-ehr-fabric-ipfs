const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { authenticateToken } = require('../middleware/auth');
const { evaluateTransaction } = require('../services/fabric.service');

const JWT_SECRET = process.env.JWT_SECRET || 'ehr-demo-secret-change-in-production';

/**
 * POST /api/v1/auth/login
 * Login with Fabric identity credentials
 */
router.post('/login', async (req, res, next) => {
    try {
        const { userId, password, orgMsp } = req.body;

        if (!userId || !password) {
            return res.status(400).json({ error: 'Missing userId or password' });
        }

        // In real system: enroll with Fabric CA and get certificate
        // For demo: use pre-enrolled identities from wallet
        const role = userId.startsWith('PAT') ? 'Patient' :
                     userId.startsWith('DOC') ? 'Doctor' :
                     userId.startsWith('ADM') ? 'Admin' : 'Unknown';

        // Detect orgMsp from wallet file
        const path = require('path');
        const fs = require('fs');
        let detectedOrg = orgMsp || 'HospitalAMSP';
        const walletDirs = ['hospitala', 'hospitalb'];
        for (const dir of walletDirs) {
            const wf = path.join(__dirname, '../wallet', dir, `${userId}.id`);
            if (fs.existsSync(wf)) {
                try {
                    const w = JSON.parse(fs.readFileSync(wf, 'utf8'));
                    detectedOrg = w.mspId || detectedOrg;
                } catch(_) {}
                break;
            }
        }

        const token = jwt.sign(
            { userId, role, orgMsp: detectedOrg },
            JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.json({
            success: true,
            token,
            user: { userId, role, orgMsp: detectedOrg },
            expiresIn: '8h'
        });

    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/v1/auth/me
 * Get current user info
 */
router.get('/me', authenticateToken, (req, res) => {
    res.json({ user: req.user });
});

/**
 * GET /api/v1/auth/public-key/:patientId
 * Get patient's RSA public key for EHR encryption
 */
router.get('/public-key/:patientId', authenticateToken, (req, res) => {
    const fs = require('fs');
    const path = require('path');
    const { patientId } = req.params;
    // Look for key in keys directory or tmp
    const keyPaths = [
        path.join(__dirname, `../../keys/${patientId}-public.pem`),
        `/tmp/${patientId.toLowerCase()}-public.pem`,
    ];
    for (const kp of keyPaths) {
        if (fs.existsSync(kp)) {
            const publicKey = fs.readFileSync(kp, 'utf8');
            return res.json({ patientId, publicKey });
        }
    }
    res.status(404).json({ error: `Public key not found for patient ${patientId}` });
});

module.exports = router;
