## Tổng quan

Prototype minh họa framework chia sẻ hồ sơ bệnh án điện tử (EHR) an toàn giữa các bệnh viện, sử dụng:

- **Hyperledger Fabric v2.5** — Quản lý metadata, chính sách truy cập (consent), audit log bất biến on-chain
- **IPFS (Kubo)** — Lưu trữ EHR đã mã hóa off-chain
- **AES-256-GCM + RSA-OAEP** — Envelope encryption đảm bảo chỉ người được phép mới giải mã được
- **Node.js/Express Backend API** — Orchestrate toàn bộ luồng nghiệp vụ

### Luồng cốt lõi

```
identity → consent → encrypt(AES-256-GCM) → IPFS
       → metadata/hash/policy on Fabric
       → request access → verify consent policy
       → retrieve from IPFS → decrypt
```

---

## Cấu trúc thư mục

```
demo/
├── fabric-network/
│   ├── docker-compose.yaml     # 2 org (HospitalA, HospitalB) + Orderer + CA + CouchDB
│   └── configtx.yaml           # Channel & endorsement config
├── chaincode/
│   ├── index.js                # Entry point: 3 contracts
│   ├── lib/
│   │   ├── ehr-registry.js     # EHR metadata on-chain
│   │   ├── access-control.js   # Consent policy + token
│   │   └── audit-log.js        # Immutable audit trail
│   └── package.json
├── backend/
│   ├── server.js
│   ├── routes/                 # auth, ehr, consent, audit
│   ├── services/               # fabric.service, ipfs.service, crypto.service
│   └── middleware/auth.js
├── scripts/
│   ├── demo.sh                 # CLI demo end-to-end
│   └── SETUP_CHECKLIST.md      # Checklist 10 bước cài đặt
└── data-samples/
    └── sample-data.json        # Dữ liệu mẫu (bệnh nhân, bác sĩ, EHR)
```

---

## Yêu cầu môi trường

| Công cụ | Phiên bản |
|---------|----------|
| Docker + Docker Compose | ≥ 24.0 |
| Node.js | ≥ 20 LTS |
| Hyperledger Fabric | 2.5.x |
| Fabric CA | 1.5.x |
| IPFS Kubo | ≥ 0.22 |
| CouchDB | 3.3.x (via Docker) |

---

## Cài đặt nhanh

### 1. Clone & setup
```bash
git clone <repo-url>
cd thesis-demo/demo
```

### 2. Khởi động Fabric network
```bash
cd fabric-network

# Generate crypto material
export PATH=$PATH:$FABRIC_BIN_PATH
cryptogen generate --config=./crypto-config.yaml --output=./organizations

# Generate genesis block
configtxgen -profile EHRGenesis -outputBlock ./channel-artifacts/genesis.block \
  -channelID system-channel

# Start containers
docker-compose up -d

# Create & join channel
export FABRIC_CFG_PATH=$PWD
peer channel create -o orderer.ehr.com:7050 -c ehr-channel \
  -f ./channel-artifacts/ehr-channel.tx \
  --tls --cafile ${ORDERER_CA}

peer channel join -b ehr-channel.block
```

### 3. Deploy Chaincode
```bash
# Package
peer lifecycle chaincode package ehr-cc.tar.gz \
  --path ../chaincode --lang node --label ehr_1.0

# Install (cả 2 org)
peer lifecycle chaincode install ehr-cc.tar.gz

# Approve
peer lifecycle chaincode approveformyorg \
  -o orderer.ehr.com:7050 --channelID ehr-channel \
  --name ehr-registry --version 1.0 --sequence 1 --tls --cafile ${ORDERER_CA}

# Commit
peer lifecycle chaincode commit \
  -o orderer.ehr.com:7050 --channelID ehr-channel \
  --name ehr-registry --version 1.0 --sequence 1 --tls --cafile ${ORDERER_CA}
```

### 4. Chạy IPFS
```bash
ipfs init
ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin '["*"]'
ipfs daemon &
```

### 5. Chạy Backend API
```bash
cd backend
npm install
cp .env.example .env   # Điền FABRIC_PEER_ENDPOINT, JWT_SECRET, etc.
npm start
# API: http://localhost:3000
```

### 6. Chạy Demo
```bash
cd scripts
chmod +x demo.sh
./demo.sh
```

---

## API Endpoints

| Method | Path | Mô tả | Role |
|--------|------|-------|------|
| POST | `/api/v1/auth/login` | Đăng nhập | All |
| POST | `/api/v1/ehr` | Tạo EHR mới | Doctor |
| GET | `/api/v1/ehr/:ehrId` | Xem EHR | Doctor/Patient |
| GET | `/api/v1/ehr/patient/:patientId` | Danh sách EHR | Doctor/Patient |
| DELETE | `/api/v1/ehr/:ehrId` | Thu hồi EHR | Patient/Admin |
| POST | `/api/v1/consent` | Cấp consent | Patient |
| DELETE | `/api/v1/consent/:consentId` | Thu hồi consent | Patient |
| GET | `/api/v1/consent/patient/:patientId` | Danh sách consent | Patient/Doctor |
| GET | `/api/v1/audit/:resourceId` | Audit trail | All |

---

## Cổng mặc định

| Dịch vụ | Cổng |
|---------|-----|
| Backend API | 3000 |
| Fabric peer HospitalA | 7051 |
| Fabric peer HospitalB | 9051 |
| Fabric orderer | 7050 |
| CA HospitalA | 7054 |
| CA HospitalB | 8054 |
| CouchDB HospitalA | 5984 |
| CouchDB HospitalB | 7984 |
| IPFS API | 5001 |
| IPFS Gateway | 8080 |

---

## Thành phần On-chain vs Off-chain

| Thành phần | Nơi lưu | Lý do |
|-----------|---------|-------|
| EHR content (encrypted) | IPFS | Kích thước lớn, không cần blockchain |
| EHR metadata (CID, hash, type) | Fabric ledger | Cần toàn vẹn & truy vết |
| Encrypted DEK | Fabric ledger | Gắn liền với metadata EHR |
| Consent policy | Fabric ledger | Cần bất biến & kiểm chứng |
| Audit log | Fabric ledger | Bất biến, không thể xóa |
| Private keys | Client/KMS | Không bao giờ lên blockchain |

---

## Checklist cài đặt đầy đủ

Xem [`scripts/SETUP_CHECKLIST.md`](scripts/SETUP_CHECKLIST.md) để hướng dẫn 10 bước chi tiết.
