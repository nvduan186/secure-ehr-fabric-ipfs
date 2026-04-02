#!/bin/bash
# start-demo.sh - Start all demo services
set -e

DEMO_DIR="$(cd "$(dirname "$0")" && pwd)"
CHAINCODE_ID="ehr-chaincode_1.0:4e4fff9814e5be58fd8768f95fa8d97b07a0d2edd3c50caa56354e73c294bee8"

echo "=== EHR Demo Startup ==="

# 1. Check Fabric network
echo "[1] Checking Fabric network..."
if ! docker ps | grep -q "orderer.ehr.com"; then
  echo "  Starting Fabric network..."
  cd "$DEMO_DIR/fabric-network" && docker compose up -d
  sleep 10
else
  echo "  ✅ Fabric network running"
fi

# 2. Check IPFS
echo "[2] Checking IPFS..."
if ! curl -s http://localhost:5001/api/v0/id > /dev/null 2>&1; then
  echo "  Starting IPFS..."
  ipfs daemon --init > /tmp/ipfs.log 2>&1 &
  sleep 5
else
  echo "  ✅ IPFS running"
fi

# 3. Kill existing chaincode server and backend
pkill -f "fabric-chaincode-node server" 2>/dev/null || true
pkill -f "node server.js" 2>/dev/null || true
sleep 2

# 4. Start chaincode server
echo "[4] Starting chaincode server..."
export CHAINCODE_SERVER_ADDRESS=0.0.0.0:7052
export CORE_CHAINCODE_ID_NAME="$CHAINCODE_ID"
cd "$DEMO_DIR/chaincode"
nohup ./node_modules/.bin/fabric-chaincode-node server \
  --chaincode-address $CHAINCODE_SERVER_ADDRESS \
  --chaincode-id $CORE_CHAINCODE_ID_NAME > /tmp/chaincode.log 2>&1 &
CC_PID=$!
disown $CC_PID
sleep 3
if ss -tlnp | grep -q 7052; then
  echo "  ✅ Chaincode server running (PID=$CC_PID)"
else
  echo "  ❌ Chaincode server failed! Check /tmp/chaincode.log"
  exit 1
fi

# 5. Start backend
echo "[5] Starting backend API..."
cd "$DEMO_DIR/backend"
nohup node server.js > /tmp/backend.log 2>&1 &
BE_PID=$!
disown $BE_PID
sleep 4
if curl -s http://localhost:3001/health > /dev/null 2>&1; then
  echo "  ✅ Backend running (PID=$BE_PID)"
else
  echo "  ❌ Backend failed! Check /tmp/backend.log"
  exit 1
fi

echo ""
echo "=== All services started ==="
echo "  Backend API:       http://localhost:3001"
echo "  IPFS API:          http://localhost:5001"
echo "  Fabric Peer:       localhost:7051"
echo ""
echo "Test with:"
echo "  curl http://localhost:3001/health"
echo "  curl -X POST http://localhost:3001/api/v1/auth/login -H 'Content-Type: application/json' -d '{\"userId\":\"DOC001\",\"password\":\"demo\",\"orgMsp\":\"HospitalAMSP\"}'"
