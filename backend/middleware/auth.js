const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'ehr-demo-secret-change-in-production';

/**
 * JWT authentication middleware
 */
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = decoded; // { userId, role, orgMsp, iat, exp }
        next();
    });
}

/**
 * Role-based access control middleware
 */
function requireRole(allowedRoles) {
    return (req, res, next) => {
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                error: `Access denied. Required roles: ${allowedRoles.join(', ')}`
            });
        }
        next();
    };
}

module.exports = { authenticateToken, requireRole };
