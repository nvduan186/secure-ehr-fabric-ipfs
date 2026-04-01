#!/usr/bin/env bash
# =============================================================================
# network-up.sh — Khởi động EHR Fabric Network
# Usage: ./network-up.sh [up|down|restart|status]
# =============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── Cấu hình ──────────────────────────────────────────────────────────────────
CHANNEL_NAME="ehr-channel"
DELAY=3
MAX_RETRY=10
FABRIC_BIN="${FABRIC_BIN_PATH:-$HOME/fabric-samples/bin}"
export PATH="$FABRIC_BIN:$PATH"
export FABRIC_CFG_PATH="${FABRIC_CFG_PATH:-$HOME/fabric-samples/config}"

# Màu terminal
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERR]${NC} $1"; exit 1; }

# ── Kiểm tra dependencies ─────────────────────────────────────────────────────
check_deps() {
    for cmd in docker peer cryptogen configtxgen; do
        command -v "$cmd" &>/dev/null || err "$cmd không tìm thấy. Kiểm tra PATH và cài đặt Fabric binaries."
    done
    info "Dependencies OK"
}

# ── Tạo crypto material ───────────────────────────────────────────────────────
generate_crypto() {
    if [ -d "./organizations/peerOrganizations" ]; then
        warn "Crypto material đã tồn tại, bỏ qua bước generate."
        return
    fi
    info "Generating crypto material..."
    cryptogen generate --config=./crypto-config.yaml --output=./organizations
    info "Crypto material generated."
}

# ── Tạo genesis block và channel tx ──────────────────────────────────────────
generate_artifacts() {
    mkdir -p ./channel-artifacts
    if [ -f "./channel-artifacts/genesis.block" ]; then
        warn "Genesis block đã tồn tại, bỏ qua."
        return
    fi

    info "Generating channel artifacts..."

    # Genesis block
    configtxgen -profile EHRGenesis \
        -outputBlock ./channel-artifacts/genesis.block \
        -channelID system-channel

    # Channel creation tx
    configtxgen -profile EHRGenesis \
        -outputCreateChannelTx ./channel-artifacts/ehr-channel.tx \
        -channelID "$CHANNEL_NAME"

    # Anchor peer updates
    configtxgen -profile EHRGenesis \
        -outputAnchorPeersUpdate ./channel-artifacts/HospitalAMSPanchors.tx \
        -channelID "$CHANNEL_NAME" -asOrg HospitalAMSP

    configtxgen -profile EHRGenesis \
        -outputAnchorPeersUpdate ./channel-artifacts/HospitalBMSPanchors.tx \
        -channelID "$CHANNEL_NAME" -asOrg HospitalBMSP

    info "Channel artifacts generated."
}

# ── Biến môi trường cho peer HospitalA ───────────────────────────────────────
setEnvHospitalA() {
    export CORE_PEER_TLS_ENABLED=true
    export CORE_PEER_LOCALMSPID="HospitalAMSP"
    export CORE_PEER_TLS_ROOTCERT_FILE="$SCRIPT_DIR/organizations/peerOrganizations/hospitala.ehr.com/peers/peer0.hospitala.ehr.com/tls/ca.crt"
    export CORE_PEER_MSPCONFIGPATH="$SCRIPT_DIR/organizations/peerOrganizations/hospitala.ehr.com/users/Admin@hospitala.ehr.com/msp"
    export CORE_PEER_ADDRESS="localhost:7051"
    export ORDERER_CA="$SCRIPT_DIR/organizations/ordererOrganizations/ehr.com/orderers/orderer.ehr.com/msp/tlscacerts/tlsca.ehr.com-cert.pem"
}

# ── Biến môi trường cho peer HospitalB ───────────────────────────────────────
setEnvHospitalB() {
    export CORE_PEER_TLS_ENABLED=true
    export CORE_PEER_LOCALMSPID="HospitalBMSP"
    export CORE_PEER_TLS_ROOTCERT_FILE="$SCRIPT_DIR/organizations/peerOrganizations/hospitalb.ehr.com/peers/peer0.hospitalb.ehr.com/tls/ca.crt"
    export CORE_PEER_MSPCONFIGPATH="$SCRIPT_DIR/organizations/peerOrganizations/hospitalb.ehr.com/users/Admin@hospitalb.ehr.com/msp"
    export CORE_PEER_ADDRESS="localhost:9051"
    export ORDERER_CA="$SCRIPT_DIR/organizations/ordererOrganizations/ehr.com/orderers/orderer.ehr.com/msp/tlscacerts/tlsca.ehr.com-cert.pem"
}

# ── Tạo và join channel ───────────────────────────────────────────────────────
create_channel() {
    info "Creating channel: $CHANNEL_NAME..."
    setEnvHospitalA

    peer channel create \
        -o localhost:7050 \
        --ordererTLSHostnameOverride orderer.ehr.com \
        -c "$CHANNEL_NAME" \
        -f ./channel-artifacts/ehr-channel.tx \
        --outputBlock ./channel-artifacts/ehr-channel.block \
        --tls --cafile "$ORDERER_CA" \
        --connTimeout 10s

    info "Channel $CHANNEL_NAME created."
}

join_channel() {
    info "HospitalA joining channel..."
    setEnvHospitalA
    peer channel join -b ./channel-artifacts/ehr-channel.block
    peer channel update -o localhost:7050 --ordererTLSHostnameOverride orderer.ehr.com \
        -c "$CHANNEL_NAME" -f ./channel-artifacts/HospitalAMSPanchors.tx \
        --tls --cafile "$ORDERER_CA" 

    info "HospitalB joining channel..."
    setEnvHospitalB
    peer channel join -b ./channel-artifacts/ehr-channel.block
    peer channel update -o localhost:7050 --ordererTLSHostnameOverride orderer.ehr.com \
        -c "$CHANNEL_NAME" -f ./channel-artifacts/HospitalBMSPanchors.tx \
        --tls --cafile "$ORDERER_CA" 

    info "Both orgs joined channel $CHANNEL_NAME."
}

# ── Main ──────────────────────────────────────────────────────────────────────
case "${1:-up}" in
  up)
    check_deps
    generate_crypto
    generate_artifacts
    info "Starting Docker containers..."
    docker compose -f ./docker-compose.yaml up -d
    sleep "$DELAY"
    create_channel
    join_channel
    info "✅ Network is up. Channel: $CHANNEL_NAME"
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    ;;
  down)
    info "Stopping network..."
    docker compose -f ./docker-compose.yaml down -v --remove-orphans
    rm -rf ./organizations/peerOrganizations ./organizations/ordererOrganizations
    rm -rf ./channel-artifacts
    info "✅ Network stopped and cleaned."
    ;;
  restart)
    $0 down && $0 up
    ;;
  status)
    docker compose -f ./docker-compose.yaml ps
    ;;
  *)
    echo "Usage: $0 [up|down|restart|status]"
    exit 1
    ;;
esac
