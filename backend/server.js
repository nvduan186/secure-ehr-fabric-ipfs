require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const authRoutes = require('./routes/auth');
const ehrRoutes = require('./routes/ehr');
const consentRoutes = require('./routes/consent');
const auditRoutes = require('./routes/audit');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(morgan('combined'));

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/ehr', ehrRoutes);
app.use('/api/v1/consent', consentRoutes);
app.use('/api/v1/audit', auditRoutes);

// Serve React frontend static files
const path = require('path');
const frontendBuild = '/home/nguye/.openclaw/workspace-thesis-lead/demo/frontend/build';
app.use(express.static(frontendBuild));
app.get(/^(?!\/api\/|\/health).*$/, (req, res) => {
    res.sendFile(frontendBuild + '/index.html');
});

// Error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).json({
        error: err.message || 'Internal server error',
        timestamp: new Date().toISOString()
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`EHR Backend API running on port ${PORT}`);
});

module.exports = app;
