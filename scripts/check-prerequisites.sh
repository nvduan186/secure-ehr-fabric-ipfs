#!/bin/bash
# check-prerequisites.sh — Kiểm tra môi trường trước khi chạy demo
# Chạy: bash check-prerequisites.sh

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

OK="${GREEN}✅ OK${NC}"
FAIL="${RED}❌ THIẾU${NC}"
WARN="${YELLOW}⚠️  CẢNH BÁO${NC}"

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}  EHR Demo — Kiểm tra Prerequisites${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

ERRORS=0

check() {
    local name="$1"
    local cmd="$2"
    local min_ver="$3"
    local install_hint="$4"

    if eval "$cmd" &>/dev/null; then
        local ver
        ver=$(eval "$cmd" 2>&1 | head -1)
        echo -e "  ${OK}  ${name}: ${ver}"
    else
        echo -e "  ${FAIL}  ${name} — Chưa cài. ${install_hint}"
        ERRORS=$((ERRORS + 1))
    fi
}

echo -e "${BLUE}[1] Kiểm tra công cụ bắt buộc${NC}"
echo ""

# Docker
if docker info &>/dev/null; then
    echo -e "  ${OK}  Docker: $(docker --version)"
    # Check Docker Compose
    if docker compose version &>/dev/null; then
        echo -e "  ${OK}  Docker Compose: $(docker compose version)"
    else
        echo -e "  ${FAIL}  Docker Compose plugin — Chạy: sudo apt install docker-compose-plugin"
        ERRORS=$((ERRORS + 1))
    fi
    # Check Docker daemon running
    if docker ps &>/dev/null; then
        echo -e "  ${OK}  Docker daemon đang chạy"
    else
        echo -e "  ${FAIL}  Docker daemon chưa chạy — Chạy: sudo service docker start"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo -e "  ${FAIL}  Docker — Xem hướng dẫn cài bên dưới"
    ERRORS=$((ERRORS + 1))
fi

# Go
if go version &>/dev/null; then
    GOVER=$(go version | awk '{print $3}' | sed 's/go//')
    MAJOR=$(echo $GOVER | cut -d. -f1)
    MINOR=$(echo $GOVER | cut -d. -f2)
    if [ "$MAJOR" -gt 1 ] || ([ "$MAJOR" -eq 1 ] && [ "$MINOR" -ge 20 ]); then
        echo -e "  ${OK}  Go: $(go version)"
    else
        echo -e "  ${WARN}  Go ${GOVER} — Cần >= 1.20. Cài: https://go.dev/dl/"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo -e "  ${FAIL}  Go — Cài: sudo apt install golang-go hoặc https://go.dev/dl/"
    ERRORS=$((ERRORS + 1))
fi

# Node.js
if node --version &>/dev/null; then
    NODEVER=$(node --version | sed 's/v//')
    MAJOR=$(echo $NODEVER | cut -d. -f1)
    if [ "$MAJOR" -ge 18 ]; then
        echo -e "  ${OK}  Node.js: $(node --version)"
    else
        echo -e "  ${WARN}  Node.js v${NODEVER} — Cần >= 18"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo -e "  ${FAIL}  Node.js — Cài: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install nodejs"
    ERRORS=$((ERRORS + 1))
fi

# npm
if npm --version &>/dev/null; then
    echo -e "  ${OK}  npm: $(npm --version)"
fi

# IPFS
if ipfs version &>/dev/null; then
    echo -e "  ${OK}  IPFS (kubo): $(ipfs version)"
else
    echo -e "  ${FAIL}  IPFS (kubo) — Cài: https://docs.ipfs.tech/install/command-line/"
    ERRORS=$((ERRORS + 1))
fi

# curl, jq
for tool in curl jq; do
    if command -v $tool &>/dev/null; then
        echo -e "  ${OK}  ${tool}"
    else
        echo -e "  ${WARN}  ${tool} chưa có — sudo apt install ${tool}"
    fi
done

echo ""
echo -e "${BLUE}[2] Kiểm tra ports${NC}"
echo ""

for port in 7050 7051 8080 4001 3000 3001; do
    if ss -tlnp 2>/dev/null | grep -q ":${port} " || netstat -tlnp 2>/dev/null | grep -q ":${port} "; then
        echo -e "  ${WARN}  Port ${port} đang bận — có thể gây conflict"
    else
        echo -e "  ${OK}  Port ${port} trống"
    fi
done

echo ""
echo -e "${BLUE}[3] Kiểm tra disk space${NC}"
echo ""

AVAIL=$(df -BG . | awk 'NR==2{print $4}' | sed 's/G//')
if [ "$AVAIL" -ge 10 ]; then
    echo -e "  ${OK}  Disk trống: ${AVAIL}GB (cần >= 10GB cho Docker images)"
else
    echo -e "  ${WARN}  Disk trống chỉ ${AVAIL}GB — Nên có ít nhất 10GB"
fi

echo ""
echo -e "${BLUE}================================================${NC}"
if [ "$ERRORS" -eq 0 ]; then
    echo -e "  ${GREEN}Tất cả OK — Sẵn sàng chạy demo!${NC}"
    echo -e "  Chạy tiếp: ${BLUE}bash run-demo.sh${NC}"
else
    echo -e "  ${RED}Còn ${ERRORS} vấn đề cần xử lý trước.${NC}"
    echo ""
    echo -e "${YELLOW}Xem hướng dẫn cài đặt bên dưới:${NC}"
    cat << 'INSTALL_HINT'

=== Cài Docker trên WSL2 (Ubuntu 24.04) ===

  sudo apt-get update
  sudo apt-get install -y ca-certificates curl gnupg
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
  sudo apt-get update
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  sudo usermod -aG docker $USER
  sudo service docker start
  newgrp docker   # hoặc logout/login lại

=== Cài Go 1.21 ===

  wget https://go.dev/dl/go1.21.0.linux-amd64.tar.gz
  sudo rm -rf /usr/local/go
  sudo tar -C /usr/local -xzf go1.21.0.linux-amd64.tar.gz
  echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.bashrc
  source ~/.bashrc

=== Cài IPFS (kubo) ===

  wget https://dist.ipfs.tech/kubo/v0.27.0/kubo_v0.27.0_linux-amd64.tar.gz
  tar -xzf kubo_v0.27.0_linux-amd64.tar.gz
  sudo bash kubo/install.sh
  ipfs init

INSTALL_HINT
fi
echo -e "${BLUE}================================================${NC}"
