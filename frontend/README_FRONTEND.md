# Frontend — EHR Demo (React)

Giao diện người dùng cho hệ thống quản lý hồ sơ bệnh án điện tử sử dụng Hyperledger Fabric + IPFS.

## Yêu cầu

- Node.js ≥ 18
- Backend API đang chạy tại `http://localhost:3001`

## Cài đặt & Chạy

```bash
cd demo/frontend
npm install
npm start
```

Trình duyệt mở tại `http://localhost:3000`.

## Cấu trúc

```
demo/frontend/
├── public/
│   └── index.html
├── src/
│   ├── App.js        # Toàn bộ UI logic (2 tab: Doctor / Patient)
│   └── index.js      # React entry point
└── package.json
```

## Tính năng

### Tab Bác sĩ (Doctor)
| Chức năng | Endpoint |
|-----------|----------|
| Tạo EHR mới | `POST /api/ehr` |
| Xem EHR theo ID | `GET /api/ehr/:id` |

**Form tạo EHR**: patientId, ehrType (DIAGNOSIS / PRESCRIPTION / LAB_RESULT / IMAGING), diagnosis, prescription.

### Tab Bệnh nhân (Patient)
| Chức năng | Endpoint |
|-----------|----------|
| Cấp quyền truy cập | `POST /api/consent` |
| Thu hồi quyền truy cập | `DELETE /api/consent/:id` |
| Xem danh sách EHR của mình | `GET /api/ehr/my` |

**Form consent**: ehrId, doctorId, duration (1h / 24h / 7 ngày).

## Ghi chú

- Proxy tự động forward `/api/*` đến `http://localhost:3001` (cấu hình trong `package.json`).
- Response JSON hiển thị trực tiếp trên màn hình sau mỗi request.
- Loading state và error display được xử lý tại từng form.
- Không có authentication UI — demo giả định token được inject qua backend session.
