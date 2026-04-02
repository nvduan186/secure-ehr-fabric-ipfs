# Checklist Xây Dựng Demo Hyperledger Fabric + IPFS
> Luận văn thạc sĩ — Hệ thống quản lý dữ liệu y tế phi tập trung  
> Cập nhật: 2026-03-22

---

## Bước 1: Cài đặt môi trường

Cài đặt tất cả các công cụ và dependency cần thiết trước khi khởi động hệ thống.
Đảm bảo các phiên bản tương thích: Docker ≥ 24, Go ≥ 1.21, Node.js ≥ 18, Python ≥ 3.10.

- [ ] Cài Docker và Docker Compose
- [ ] Cài Go (dùng cho chaincode)
- [ ] Cài Node.js và npm (dùng cho backend API)
- [ ] Cài Python 3 và pip (dùng cho script tiện ích nếu có)
- [ ] Cài `jq`, `curl`, `git`
- [ ] Clone repository demo về máy

```bash
# Kiểm tra phiên bản
docker --version && docker compose version
go version
node --version && npm --version

# Clone repo
git clone https://github.com/<your-repo>/thesis-demo.git
cd thesis-demo
```

---

## Bước 2: Tải binary và Docker image Hyperledger Fabric

Tải về các binary Fabric (`peer`, `orderer`, `configtxgen`, ...) và các Docker image chính thức.
Bước này cần kết nối Internet; các image có thể nặng ~2–3 GB.

- [ ] Chạy script `bootstrap.sh` của Fabric để tải binary
- [ ] Xác nhận các image `hyperledger/fabric-*` đã có trong Docker
- [ ] Thêm thư mục `bin/` vào `PATH`

```bash
# Tải Fabric 2.5 LTS + CA 1.5
curl -sSL https://bit.ly/2ysbOFE | bash -s -- 2.5.0 1.5.7

# Kiểm tra
export PATH=$PWD/fabric-samples/bin:$PATH
peer version

# Xác nhận image
docker images | grep hyperledger
```

---

## Bước 3: Khởi tạo Fabric Network (fabric-network)

Khởi động mạng Fabric cục bộ gồm 1 orderer và 2 peer (HospitalA, HospitalB).
Tạo channel `ehr-channel` để chaincode sẽ được deploy lên đó.

- [ ] Vào thư mục `fabric-network` (hoặc thư mục network tùy chỉnh)
- [ ] Khởi động network với Certificate Authority
- [ ] Tạo channel `ehr-channel`
- [ ] Xác nhận các container đang chạy

```bash
cd fabric-samples/fabric-network

# Khởi động network + CA
./network.sh up createChannel -c ehr-channel -ca

# Kiểm tra container
docker ps --format "table {{.Names}}\t{{.Status}}"
```

---

## Bước 4: Deploy Chaincode lên Fabric

Đóng gói, cài đặt và commit chaincode (smart contract) quản lý metadata hồ sơ y tế lên channel.
Chaincode được viết bằng Go, chứa logic: lưu metadata, kiểm tra quyền truy cập, ghi log sự kiện.

- [ ] Vào thư mục `chaincode/`
- [ ] Build thử chaincode (kiểm tra lỗi Go)
- [ ] Package chaincode
- [ ] Cài chaincode lên Org1 và Org2
- [ ] Approve chaincode cho từng org
- [ ] Commit chaincode lên channel
- [ ] Kiểm tra chaincode đã committed

```bash
# Từ thư mục fabric-network
export FABRIC_CFG_PATH=$PWD/../config/

# Deploy chaincode tên "ehr-registry" từ thư mục chaincode/go
./network.sh deployCC -ccn ehr-registry -ccp ../chaincode/go -ccl go -c ehr-channel

# Kiểm tra
peer chaincode list --installed
peer chaincode list --instantiated -C ehr-channel
```

---

## Bước 5: Chạy IPFS Node (local daemon)

Khởi động IPFS daemon cục bộ để lưu trữ file hồ sơ y tế đã mã hóa.
IPFS đóng vai trò tầng lưu trữ phi tập trung; Fabric chỉ lưu CID (hash) và metadata.

- [ ] Cài IPFS CLI (`kubo`)
- [ ] Khởi tạo IPFS repo lần đầu (`ipfs init`)
- [ ] Cấu hình CORS để backend API có thể gọi
- [ ] Khởi động IPFS daemon ở background
- [ ] Kiểm tra daemon đang lắng nghe trên cổng 5001

```bash
# Cài Kubo (IPFS implementation chính thức)
wget https://dist.ipfs.tech/kubo/v0.27.0/kubo_v0.27.0_linux-amd64.tar.gz
tar -xvzf kubo_*.tar.gz && sudo bash kubo/install.sh

# Khởi tạo và cấu hình
ipfs init
ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin '["*"]'

# Chạy daemon
ipfs daemon &

# Kiểm tra
curl http://127.0.0.1:5001/api/v0/id
```

---

## Bước 6: Cài đặt và cấu hình Backend API

Backend API (Node.js/Express) là cầu nối giữa client, Fabric network và IPFS.
Cấu hình connection profile, ví (wallet), và biến môi trường trước khi chạy.

- [ ] Vào thư mục `backend/`
- [ ] Chạy `npm install` để cài dependency
- [ ] Sao chép file `.env.example` thành `.env` và điền giá trị
- [ ] Copy crypto material từ `fabric-network` vào thư mục `wallet/`
- [ ] Enroll admin identity vào wallet
- [ ] Kiểm tra kết nối đến Fabric peer

```bash
cd backend/
npm install

# Cấu hình môi trường
cp .env.example .env
# Chỉnh sửa: FABRIC_CHANNEL, CHAINCODE_NAME, IPFS_API_URL, PORT, ...

# Enroll admin
node scripts/enrollAdmin.js

# Kiểm tra kết nối Fabric
node scripts/testConnection.js
```

---

## Bước 7: Chạy Backend API Server

Khởi động server API và xác nhận các endpoint hoạt động đúng.
Server cần kết nối thành công đến cả Fabric peer và IPFS daemon trước khi phục vụ request.

- [ ] Khởi động server ở chế độ development
- [ ] Kiểm tra health check endpoint
- [ ] Kiểm tra endpoint upload hồ sơ (POST `/api/records`)
- [ ] Kiểm tra endpoint truy xuất hồ sơ (GET `/api/records/:id`)
- [ ] Kiểm tra endpoint cấp quyền (POST `/api/consent`)

```bash
cd backend/

# Chạy server
npm run dev
# hoặc: node src/index.js

# Kiểm tra health
curl http://localhost:3000/api/health

# Test upload (mẫu)
curl -X POST http://localhost:3000/api/records \
  -H "Content-Type: application/json" \
  -d '{"patientId":"P001","data":"<encrypted_payload>"}'
```

---

## Bước 8: Chạy Frontend / Demo Client

Khởi động giao diện demo (React hoặc script CLI) để minh họa luồng nghiệp vụ.
Giao diện cần kết nối đến backend API; không giao tiếp trực tiếp với Fabric hay IPFS.

- [ ] Vào thư mục `frontend/` (hoặc `client/`)
- [ ] Chạy `npm install`
- [ ] Cấu hình `REACT_APP_API_URL` (hoặc tương đương)
- [ ] Khởi động frontend dev server
- [ ] Mở trình duyệt và kiểm tra giao diện

```bash
cd frontend/
npm install

# Cấu hình
echo "REACT_APP_API_URL=http://localhost:3000" > .env

# Chạy
npm start
# Mở: http://localhost:3001
```

---

## Bước 9: Chạy luồng demo end-to-end

Thực thi toàn bộ luồng nghiệp vụ cốt lõi để xác nhận hệ thống hoạt động đúng đắn.
Luồng: đăng ký danh tính → tạo hồ sơ → mã hóa → lưu IPFS → lưu metadata Fabric → yêu cầu truy cập → kiểm tra chính sách → giải mã và đọc.

- [ ] Đăng ký bệnh nhân (patient identity)
- [ ] Tải lên hồ sơ y tế (upload + mã hóa)
- [ ] Xác nhận CID được ghi lên Fabric
- [ ] Đăng ký bác sĩ và gửi yêu cầu truy cập
- [ ] Bệnh nhân cấp quyền (consent)
- [ ] Bác sĩ truy xuất và giải mã hồ sơ thành công
- [ ] Kiểm tra log sự kiện trên Fabric

```bash
# Chạy script demo tự động (nếu có)
cd demo/scripts/
node run_demo_flow.js

# Hoặc kiểm tra thủ công qua Fabric peer
peer chaincode query -C ehr-channel -n ehr-registry \
  -c '{"Args":["GetRecord","P001"]}'
```

---

## Bước 10: Kiểm thử và ghi nhận kết quả

Chạy bộ test kiểm thử và thu thập số liệu để đưa vào phần đánh giá của luận văn.
Ghi lại thời gian giao dịch, tỷ lệ thành công, và kết quả kiểm tra bảo mật.

- [ ] Chạy unit test chaincode (`go test`)
- [ ] Chạy integration test backend (`npm test`)
- [ ] Đo thời gian phản hồi trung bình của từng API endpoint
- [ ] Kiểm tra phân quyền: truy cập không hợp lệ bị từ chối
- [ ] Ghi nhận kết quả vào file `demo/results/test_results.md`
- [ ] Chụp màn hình / export log để đưa vào phụ lục luận văn

```bash
# Unit test chaincode
cd chaincode/go && go test ./... -v

# Integration test backend
cd backend && npm test

# Đo latency đơn giản
time curl -X POST http://localhost:3000/api/records \
  -H "Content-Type: application/json" \
  -d '{"patientId":"P002","data":"test_payload"}'

# Xem log Fabric
docker logs peer0.hospitala.ehr.com --tail 50
```

---

## Ghi chú

| Thành phần | Cổng mặc định |
|---|---|
| Fabric peer (Org1) | 7051 |
| Fabric orderer | 7050 |
| IPFS API | 5001 |
| IPFS Gateway | 8080 |
| Backend API | 3000 |
| Frontend | 3001 |

> **Lưu ý:** Khi gặp lỗi kết nối Fabric, kiểm tra biến môi trường `CORE_PEER_*` và đảm bảo crypto material khớp với network đang chạy.
