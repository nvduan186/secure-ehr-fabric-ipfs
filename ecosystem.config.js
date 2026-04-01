const DEMO = '/home/nguye/.openclaw/workspace-thesis-lead/demo';
const PKGID = 'ehr-chaincode_1.0:9f2b2a0c8ec69fb28f748bf6162929e8b85cbf68a37b24bafc7d31b9ded1ef53';

module.exports = {
  apps: [
    {
      name: 'ehr-chaincode',
      cwd: `${DEMO}/chaincode`,
      script: 'node_modules/.bin/fabric-chaincode-node',
      args: `server --chaincode-address=0.0.0.0:7055 --chaincode-id=${PKGID}`,
      interpreter: 'node',
      out_file: '/tmp/cc-ccaas.log',
      error_file: '/tmp/cc-ccaas-err.log',
      autorestart: true,
      restart_delay: 3000,
      max_restarts: 20,
    },
    {
      name: 'ehr-backend',
      cwd: `${DEMO}/backend`,
      script: 'server.js',
      interpreter: 'node',
      out_file: '/tmp/backend.log',
      error_file: '/tmp/backend-err.log',
      autorestart: true,
      restart_delay: 3000,
      max_restarts: 20,
    }
  ]
};
