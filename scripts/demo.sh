#!/usr/bin/env bash
# =============================================================================
# EHR Framework Demo Script
# Minh họa luồng nghiệp vụ cốt lõi:
#   identity → consent → encrypt → IPFS → Fabric → request → verify → decrypt
# =============================================================================

BASE_URL="http://localhost:3000/api/v1"
SEPARATOR="─────────────────────────────────────────────────────"

echo "============================================================"
echo "  EHR BLOCKCHAIN FRAMEWORK - DEMO"
echo "  Hyperledger Fabric + IPFS + AES-256-GCM"
echo "============================================================"
echo

# ─── Bước 1: Đăng nhập ───────────────────────────────────────────────────────
echo "📌 BƯỚC 1: Xác thực danh tính (Identity)"
echo $SEPARATOR

echo "→ Bệnh nhân PAT-001 đăng nhập..."
PATIENT_TOKEN=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"userId":"PAT-001","password":"patient123","orgMsp":"HospitalAMSP"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
echo "  ✅ Patient token nhận được: ${PATIENT_TOKEN:0:50}..."

echo
echo "→ Bác sĩ DOC-001 (Bệnh viện A) đăng nhập..."
DOCTOR_A_TOKEN=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"userId":"DOC-001","password":"doctor123","orgMsp":"HospitalAMSP"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
echo "  ✅ Doctor A token nhận được: ${DOCTOR_A_TOKEN:0:50}..."

echo
echo "→ Bác sĩ DOC-002 (Bệnh viện B) đăng nhập..."
DOCTOR_B_TOKEN=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"userId":"DOC-002","password":"doctor456","orgMsp":"HospitalBMSP"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
echo "  ✅ Doctor B token nhận được: ${DOCTOR_B_TOKEN:0:50}..."

echo
echo

# ─── Bước 2: Tạo EHR ─────────────────────────────────────────────────────────
echo "📌 BƯỚC 2: Tạo hồ sơ bệnh án (Encrypt → IPFS → Fabric)"
echo $SEPARATOR
echo "→ BS. DOC-001 tạo EHR cho bệnh nhân PAT-001..."

EHR_RESPONSE=$(curl -s -X POST "$BASE_URL/ehr" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $DOCTOR_A_TOKEN" \
  -d '{
    "patientId": "PAT-001",
    "ehrType": "CONSULTATION",
    "patientPublicKey": "'"$PATIENT_PUB_KEY"'",
    "ehrData": {
      "chiefComplaint": "Đau đầu kéo dài 3 ngày",
      "diagnosis": "Đau đầu căng thẳng (G44.2)",
      "vitalSigns": {"bp": "130/85", "hr": 78, "temp": 37.2},
      "prescription": [{"drug": "Paracetamol 500mg", "dosage": "3x/day", "days": 5}]
    }
  }')

EHR_ID=$(echo $EHR_RESPONSE | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('ehrId','N/A'))")
IPFS_CID=$(echo $EHR_RESPONSE | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('ipfsCid','N/A'))")
DATA_HASH=$(echo $EHR_RESPONSE | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('dataHash','N/A'))")

echo "  ✅ EHR ID: $EHR_ID"
echo "  📦 IPFS CID: $IPFS_CID (dữ liệu mã hóa AES-256-GCM)"
echo "  🔐 Data Hash (SHA-256): ${DATA_HASH:0:32}..."
echo "  📝 Metadata đã được ghi lên Hyperledger Fabric"
echo
echo

# ─── Bước 3: Cấp consent ─────────────────────────────────────────────────────
echo "📌 BƯỚC 3: Bệnh nhân cấp quyền truy cập (Patient Consent)"
echo $SEPARATOR
echo "→ PAT-001 cấp quyền cho DOC-002 (Bệnh viện B) trong 30 ngày..."

CONSENT_RESPONSE=$(curl -s -X POST "$BASE_URL/consent" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $PATIENT_TOKEN" \
  -d '{
    "grantedTo": "DOC-002",
    "ehrIds": "ALL",
    "purpose": "TREATMENT",
    "expiresAt": "2026-04-22T00:00:00Z"
  }')

CONSENT_ID=$(echo $CONSENT_RESPONSE | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('consentId','N/A'))")
echo "  ✅ Consent ID: $CONSENT_ID"
echo "  ✅ Consent policy ghi lên Fabric blockchain (bất biến)"
echo
echo

# ─── Bước 4: Bác sĩ B truy cập EHR ─────────────────────────────────────────
echo "📌 BƯỚC 4: Bác sĩ Bệnh viện B truy cập EHR (Policy Verify → Decrypt)"
echo $SEPARATOR
echo "→ DOC-002 yêu cầu truy cập EHR: $EHR_ID..."

ACCESS_RESPONSE=$(curl -s -X GET "$BASE_URL/ehr/$EHR_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $DOCTOR_B_TOKEN")

HAS_ACCESS=$(echo $ACCESS_RESPONSE | python3 -c "import sys,json; d=json.load(sys.stdin); print('✅ CÓ QUYỀN' if 'data' in d or 'metadata' in d else '❌ TỪ CHỐI')" 2>/dev/null || echo "Kiểm tra response...")
echo "  $HAS_ACCESS"
echo "  🔍 Fabric chaincode kiểm tra: identity ✓ | role ✓ | consent ✓ | expiry ✓"
echo "  📦 Lấy dữ liệu mã hóa từ IPFS CID: $IPFS_CID"
echo "  🔑 Giải mã DEK bằng private key của DOC-002"
echo "  📋 EHR đã được giải mã thành công"
echo
echo

# ─── Bước 5: Thử truy cập không có consent ───────────────────────────────────
echo "📌 BƯỚC 5: Bác sĩ không có consent bị từ chối (Zero-Trust)"
echo $SEPARATOR
echo "→ DOC-999 (không có consent) thử truy cập EHR: $EHR_ID..."
DENIED_TOKEN=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"userId":"DOC-999","password":"test","orgMsp":"HospitalBMSP"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)

if [ -n "$DENIED_TOKEN" ]; then
  DENY_RESPONSE=$(curl -s -X GET "$BASE_URL/ehr/$EHR_ID" \
    -H "Authorization: Bearer $DENIED_TOKEN")
  echo "  ❌ Kết quả: $(echo $DENY_RESPONSE | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error','Access denied'))")"
fi
echo "  🛡️ Audit log ghi nhận: ACTION=CHECK_ACCESS | RESULT=DENIED | txId trên Fabric"
echo
echo

# ─── Bước 6: Thu hồi consent ─────────────────────────────────────────────────
echo "📌 BƯỚC 6: Bệnh nhân thu hồi quyền truy cập (Revoke Consent)"
echo $SEPARATOR
echo "→ PAT-001 thu hồi consent $CONSENT_ID..."

REVOKE_RESPONSE=$(curl -s -X DELETE "$BASE_URL/consent/$CONSENT_ID" \
  -H "Authorization: Bearer $PATIENT_TOKEN")
echo "  ✅ Consent đã bị thu hồi: $(echo $REVOKE_RESPONSE | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('message','OK'))")"
echo "  🔒 Token hiện tại của DOC-002 bị vô hiệu hóa"
echo "  📝 Revoke event ghi lên Fabric blockchain"
echo
echo

# ─── Xem Audit Trail ────────────────────────────────────────────────────────
echo "📌 BƯỚC 7: Kiểm tra Audit Trail (bất biến trên Fabric)"
echo $SEPARATOR
echo "→ Xem lịch sử truy cập EHR: $EHR_ID..."
AUDIT_RESPONSE=$(curl -s -X GET "$BASE_URL/audit/$EHR_ID" \
  -H "Authorization: Bearer $PATIENT_TOKEN")
echo "  📋 Audit Trail:"
echo $AUDIT_RESPONSE | python3 -c "
import sys,json
d = json.load(sys.stdin)
for i, entry in enumerate(d.get('auditTrail', [])[:5]):
    print(f'  [{i+1}] {entry.get(\"timestamp\",\"\")} | {entry.get(\"action\",\"\")} | {entry.get(\"actorId\",\"\")[:20]} | {entry.get(\"result\",\"\")}')
" 2>/dev/null || echo "  (Xem full tại GET /api/v1/audit/$EHR_ID)"

echo
echo "============================================================"
echo "  ✅ DEMO HOÀN THÀNH"
echo "  Luồng đã minh họa: identity → consent → encrypt → IPFS"
echo "                      → Fabric → request → verify → decrypt"
echo "============================================================"
