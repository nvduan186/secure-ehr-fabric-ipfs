#!/usr/bin/env bash
# =============================================================================
# deploy-chaincode.sh — Package, install, approve, commit chaincode
# Phải chạy sau network-up.sh
# Usage: ./deploy-chaincode.sh [install|upgrade]
# =============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHAINCODE_DIR="$SCRIPT_DIR/../chaincode"
CHANNEL_NAME="ehr-channel"
CC_NAME="ehr-chaincode"
CC_VERSION="${CC_VERSION:-1.0}"
CC_SEQUENCE="${CC_SEQUENCE:-1}"
FABRIC_BIN="${FABRIC_BIN_PATH:-$HOME/fabric-samples/bin}"
export PATH="$FABRIC_BIN:$PATH"
export FABRIC_CFG_PATH="${FABRIC_CFG_PATH:-$HOME/fabric-samples/config}"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERR]${NC} $1"; exit 1; }

ORDERER_CA="$SCRIPT_DIR/organizations/ordererOrganizations/ehr.com/orderers/orderer.ehr.com/msp/tlscacerts/tlsca.ehr.com-cert.pem"

setEnvHospitalA() {
    export CORE_PEER_TLS_ENABLED=true
    export CORE_PEER_LOCALMSPID="HospitalAMSP"
    export CORE_PEER_TLS_ROOTCERT_FILE="$SCRIPT_DIR/organizations/peerOrganizations/hospitala.ehr.com/peers/peer0.hospitala.ehr.com/tls/ca.crt"
    export CORE_PEER_MSPCONFIGPATH="$SCRIPT_DIR/organizations/peerOrganizations/hospitala.ehr.com/users/Admin@hospitala.ehr.com/msp"
    export CORE_PEER_ADDRESS="localhost:7051"
}

setEnvHospitalB() {
    export CORE_PEER_TLS_ENABLED=true
    export CORE_PEER_LOCALMSPID="HospitalBMSP"
    export CORE_PEER_TLS_ROOTCERT_FILE="$SCRIPT_DIR/organizations/peerOrganizations/hospitalb.ehr.com/peers/peer0.hospitalb.ehr.com/tls/ca.crt"
    export CORE_PEER_MSPCONFIGPATH="$SCRIPT_DIR/organizations/peerOrganizations/hospitalb.ehr.com/users/Admin@hospitalb.ehr.com/msp"
    export CORE_PEER_ADDRESS="localhost:9051"
}

# ── Step 1: npm install trong chaincode dir ───────────────────────────────────
step_npm_install() {
    info "Running npm install in chaincode directory..."
    cd "$CHAINCODE_DIR"
    npm install --silent
    cd "$SCRIPT_DIR"
}

# ── Step 2: Package chaincode ─────────────────────────────────────────────────
step_package() {
    info "Packaging chaincode: $CC_NAME v$CC_VERSION..."
    peer lifecycle chaincode package "$CC_NAME.tar.gz" \
        --path "$CHAINCODE_DIR" \
        --lang node \
        --label "${CC_NAME}_${CC_VERSION}"
    info "Package created: $CC_NAME.tar.gz"
}

# ── Step 3: Install trên cả 2 peer ───────────────────────────────────────────
step_install() {
    info "Installing on peer0.hospitala.ehr.com..."
    setEnvHospitalA
    peer lifecycle chaincode install "$CC_NAME.tar.gz"

    info "Installing on peer0.hospitalb.ehr.com..."
    setEnvHospitalB
    peer lifecycle chaincode install "$CC_NAME.tar.gz"

    # Lấy package ID
    setEnvHospitalA
    CC_PACKAGE_ID=$(peer lifecycle chaincode queryinstalled \
        | grep "${CC_NAME}_${CC_VERSION}" \
        | awk '{print $3}' | tr -d ',')
    export CC_PACKAGE_ID
    info "Package ID: $CC_PACKAGE_ID"
}

# ── Step 4: Approve cho từng org ─────────────────────────────────────────────
step_approve() {
    info "Approving for HospitalA..."
    setEnvHospitalA
    peer lifecycle chaincode approveformyorg \
        -o localhost:7050 \
        --ordererTLSHostnameOverride orderer.ehr.com \
        --tls --cafile "$ORDERER_CA" \
        --channelID "$CHANNEL_NAME" \
        --name "$CC_NAME" \
        --version "$CC_VERSION" \
        --package-id "$CC_PACKAGE_ID" \
        --sequence "$CC_SEQUENCE" \
       

    info "Approving for HospitalB..."
    setEnvHospitalB
    peer lifecycle chaincode approveformyorg \
        -o localhost:7050 \
        --ordererTLSHostnameOverride orderer.ehr.com \
        --tls --cafile "$ORDERER_CA" \
        --channelID "$CHANNEL_NAME" \
        --name "$CC_NAME" \
        --version "$CC_VERSION" \
        --package-id "$CC_PACKAGE_ID" \
        --sequence "$CC_SEQUENCE" \
       
}

# ── Step 5: Check readiness ───────────────────────────────────────────────────
step_check_readiness() {
    info "Checking commit readiness..."
    setEnvHospitalA
    peer lifecycle chaincode checkcommitreadiness \
        --channelID "$CHANNEL_NAME" \
        --name "$CC_NAME" \
        --version "$CC_VERSION" \
        --sequence "$CC_SEQUENCE" \
        \
        --output json
}

# ── Step 6: Commit ────────────────────────────────────────────────────────────
step_commit() {
    info "Committing chaincode definition..."
    setEnvHospitalA

    PEER_A_TLS="$SCRIPT_DIR/organizations/peerOrganizations/hospitala.ehr.com/peers/peer0.hospitala.ehr.com/tls/ca.crt"
    PEER_B_TLS="$SCRIPT_DIR/organizations/peerOrganizations/hospitalb.ehr.com/peers/peer0.hospitalb.ehr.com/tls/ca.crt"

    peer lifecycle chaincode commit \
        -o localhost:7050 \
        --ordererTLSHostnameOverride orderer.ehr.com \
        --tls --cafile "$ORDERER_CA" \
        --channelID "$CHANNEL_NAME" \
        --name "$CC_NAME" \
        --version "$CC_VERSION" \
        --sequence "$CC_SEQUENCE" \
        \
        --peerAddresses localhost:7051 \
        --peerAddresses localhost:9051

    info "✅ Chaincode $CC_NAME committed on $CHANNEL_NAME"
}

# ── Step 7: Verify ────────────────────────────────────────────────────────────
step_verify() {
    info "Verifying committed chaincode..."
    setEnvHospitalA
    peer lifecycle chaincode querycommitted \
        --channelID "$CHANNEL_NAME" \
        --name "$CC_NAME" \
       
}

# ── Main ──────────────────────────────────────────────────────────────────────
case "${1:-install}" in
  install)
    step_npm_install
    step_package
    step_install
    step_approve
    step_check_readiness
    step_commit
    step_verify
    info "🎉 Chaincode deployment complete!"
    ;;
  upgrade)
    CC_VERSION="${2:-2.0}"
    CC_SEQUENCE="${3:-2}"
    warn "Upgrading chaincode to v$CC_VERSION (sequence $CC_SEQUENCE)..."
    step_npm_install
    step_package
    step_install
    step_approve
    step_check_readiness
    step_commit
    step_verify
    info "🎉 Chaincode upgraded to v$CC_VERSION"
    ;;
  *)
    echo "Usage: $0 [install|upgrade <version> <sequence>]"
    exit 1
    ;;
esac
