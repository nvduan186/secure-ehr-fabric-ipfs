#!/bin/bash
# init-data-dirs.sh - Tạo thư mục data/ trước khi docker compose up
# Chạy 1 lần duy nhất: bash init-data-dirs.sh

DEMO_PATH="$(cd "$(dirname "$0")" && pwd)"
DATA="$DEMO_PATH/data"

echo "Creating data directories at: $DATA"

dirs=(
  "$DATA/orderer"
  "$DATA/peer-hospitala"
  "$DATA/peer-hospitalb"
  "$DATA/couchdb0"
  "$DATA/couchdb1"
  "$DATA/ipfs"
  "$DATA/postgres"
  "$DATA/explorer-wallet"
)

for d in "${dirs[@]}"; do
  mkdir -p "$d"
  echo "  ✓ $d"
done

echo ""
echo "Done. Now run:"
echo "  cd $DEMO_PATH"
echo "  DEMO_PATH=$DEMO_PATH docker compose -f docker-compose.all.yml up -d"
