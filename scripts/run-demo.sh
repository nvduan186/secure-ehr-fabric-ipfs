#!/bin/bash
# run-demo.sh — Chạy full demo EHR Framework
# Chạy: bash run-demo.sh
# Dừng: bash run-demo.sh stop

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEMO_DIR="$(dirname "$SCRIPT_DIR")"
FABRIC_DIR="$DEMO_DIR/fabric-network"
BACKEND_DIR="$DEMO_DIR/backend"
FRONTEND_DIR="$DEMO_DIR/frontend"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${BLUE}[$(date +%H:%M:%S)]${NC} $1"; }
ok()   { echo -e "${GREEN}✅ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
fail() { echo -e "${RED}❌ $1${NC}"; exit 1; }

BACKEND_PID_FILE="/tmp/ehr-backend.pid"
FRONTEND_PID_FILE="/tmp/ehr-frontend.pid"
IPFS_PID_FILE="/tmp/ehr-ipfs.pid"

stop_all() {
    echo ""
    log "Dừng tất cả services..."
    [ -f "$BACKEND_PID_FILE" ]  && kill $(cat $BACKEND_PID_FILE)  2>/dev/null && ok "Backend stopped"
    [ -f "$FRONTEND_PID_FILE" ] && kill $(cat $FRONTEND_PID_FILE) 2>/dev/null && ok "Frontend stopped"
    [ -f "$IPFS_PID_FILE" ]     && kill $(cat $IPFS_PID_FILE)     2>/dev/null && ok "IPFS stopped"
    cd "$FABRIC_DIR" && docker compose down 2>/dev/null && ok "Fabric network stopped"
    rm -f $BACKEND_PID_FILE $FRONTEND_PID_FILE $IPFS_PID_FILE
    log "Done."
    exit 0
}

if [ "${1:-}" = "stop" ]; then
    stop_all
fi

trap 'echo ""; warn "Đang dừng... chạy bash run-demo.sh stop để dọn dẹp hoàn toàn"' INT TERM

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║     EHR Framework Demo — Full Stack      ║${NC}"
echo -e "${CYAN}║   Hyperledger Fabric + IPFS + Backend    ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
echo ""

# ── BƯỚC 1: Fabric Network ──────────────────────────────────────────────────
log "Bước 1/5: Khởi động Hyperledger Fabric network..."
cd "$FABRIC_DIR"

if docker compose ps 2>/dev/null | grep -q "Up"; then
    warn "Fabric network đang chạy rồi, bỏ qua..."
else
    if [ ! -f "./scripts/network-up.sh" ]; then
        fail "Không tìm thấy scripts/network-up.sh"
    fi
    bash ./scripts/network-up.sh || fail "Khởi động Fabric network thất bại"
fi
ok "Fabric network đang chạy"

# ── BƯỚC 2: Deploy Chaincode ────────────────────────────────────────────────
log "Bước 2/5: Deploy chaincode..."
if bash ./scripts/deploy-chaincode.sh 2>&1 | tee /tmp/deploy.log | grep -q "committed"; then
    ok "Chaincode deployed thành công"
else
    warn "Chaincode có thể đã deploy rồi — kiểm tra /tmp/deploy.log"
fi

# ── BƯỚC 3: IPFS ────────────────────────────────────────────────────────────
log "Bước 3/5: Khởi động IPFS daemon..."
if ipfs swarm peers &>/dev/null; then
    warn "IPFS đang chạy rồi"
else
    ipfs daemon --routing=dhtclient &>/tmp/ipfs.log 2>&1 &
    echo $! > "$IPFS_PID_FILE"
    sleep 3
    if ipfs id &>/dev/null; then
        ok "IPFS daemon đang chạy (PID: $(cat $IPFS_PID_FILE))"
    else
        fail "IPFS daemon không khởi động được — xem /tmp/ipfs.log"
    fi
fi

# ── BƯỚC 4: Backend ─────────────────────────────────────────────────────────
log "Bước 4/5: Khởi động Backend API (port 3001)..."
cd "$BACKEND_DIR"

if [ ! -f ".env" ]; then
    cp .env.example .env
    warn ".env tạo từ example — kiểm tra config nếu cần"
fi

if [ ! -d "node_modules" ]; then
    log "  Cài npm packages..."
    npm install --silent
fi

# Enroll admin nếu chưa có wallet
if [ ! -d "wallet" ]; then
    log "  Enroll admin Fabric..."
    node -e "require('./services/fabric.service').enrollAdmin().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)})" \
        || warn "enrollAdmin thất bại — có thể cần Fabric đã chạy đủ"
fi

node server.js &>/tmp/backend.log 2>&1 &
echo $! > "$BACKEND_PID_FILE"
sleep 2

if curl -sf http://localhost:3001/health &>/dev/null; then
    ok "Backend API đang chạy tại http://localhost:3001"
else
    warn "Backend chưa sẵn sàng — xem /tmp/backend.log"
fi

# ── BƯỚC 5: Frontend ────────────────────────────────────────────────────────
log "Bước 5/5: Khởi động Frontend React (port 3000)..."
cd "$FRONTEND_DIR"

if [ ! -d "node_modules" ]; then
    log "  Cài npm packages..."
    npm install --silent
fi

BROWSER=none npm start &>/tmp/frontend.log 2>&1 &
echo $! > "$FRONTEND_PID_FILE"
sleep 5

ok "Frontend đang chạy tại http://localhost:3000"

# ── KIỂM TRA NHANH ──────────────────────────────────────────────────────────
echo ""
log "Chạy smoke test API..."

HEALTH=$(curl -sf http://localhost:3001/health 2>/dev/null || echo "FAIL")
if echo "$HEALTH" | grep -q "ok\|healthy\|running" 2>/dev/null; then
    ok "Health check: $HEALTH"
else
    warn "Health check không phản hồi đúng — xem log"
fi

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║              Demo đang chạy!             ║${NC}"
echo -e "${CYAN}╠══════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║  Frontend:  http://localhost:3000        ║${NC}"
echo -e "${CYAN}║  Backend:   http://localhost:3001        ║${NC}"
echo -e "${CYAN}║  IPFS API:  http://localhost:5001        ║${NC}"
echo -e "${CYAN}╠══════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║  Logs:                                   ║${NC}"
echo -e "${CYAN}║    tail -f /tmp/backend.log              ║${NC}"
echo -e "${CYAN}║    tail -f /tmp/frontend.log             ║${NC}"
echo -e "${CYAN}║    tail -f /tmp/ipfs.log                 ║${NC}"
echo -e "${CYAN}╠══════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║  Để dừng: bash run-demo.sh stop          ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}Luồng demo (mở http://localhost:3000):${NC}"
echo "  1. Tab Doctor → Tạo EHR mới cho bệnh nhân patient001"
echo "  2. Copy ehrId từ response"
echo "  3. Tab Patient → Cấp consent cho doctor002, duration 24h"
echo "  4. Tab Doctor (đổi sang doctor002) → Xem EHR bằng ehrId"
echo "  5. Tab Patient → Thu hồi consent"
echo "  6. Tab Doctor → Thử xem lại → Nhận lỗi 403 Forbidden"
echo ""
