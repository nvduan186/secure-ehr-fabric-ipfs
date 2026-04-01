import React, { useState } from 'react';
import axios from 'axios';

const API = '/api/v1';

const mau = {
  benhVienA: '#1d4ed8',
  benhVienB: '#059669',
  cam: '#f97316',
  do: '#dc2626',
  doNhat: '#fee2e2',
  xam: '#6b7280',
  xamNhat: '#f3f4f6',
};

const css = {
  trang: {
    fontFamily: 'system-ui, sans-serif',
    minHeight: '100vh',
    background: '#f8fafc',
    padding: '16px',
  },
  tieuDe: {
    textAlign: 'center',
    marginBottom: '24px',
  },
  h1: {
    fontSize: '22px',
    fontWeight: '700',
    color: '#1e293b',
    margin: '0 0 4px',
  },
  moTa: {
    color: mau.xam,
    fontSize: '14px',
  },
  luoi: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
    marginBottom: '24px',
  },
  khung: (mauVien) => ({
    border: `2px solid ${mauVien}`,
    borderRadius: '12px',
    overflow: 'hidden',
  }),
  dauKhung: (mauNen) => ({
    background: mauNen,
    color: '#fff',
    padding: '12px 16px',
    fontWeight: '700',
    fontSize: '15px',
  }),
  thanKhung: {
    padding: '16px',
    background: '#fff',
  },
  muc: {
    marginBottom: '16px',
  },
  tieuMuc: {
    fontSize: '12px',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: mau.xam,
    marginBottom: '8px',
  },
  input: {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '13px',
    marginBottom: '8px',
    boxSizing: 'border-box',
  },
  select: {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '13px',
    marginBottom: '8px',
    boxSizing: 'border-box',
    background: '#fff',
  },
  textarea: {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '13px',
    marginBottom: '8px',
    boxSizing: 'border-box',
    resize: 'vertical',
    minHeight: '60px',
    fontFamily: 'system-ui, sans-serif',
  },
  nut: (mauNen = '#374151') => ({
    background: mauNen,
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    padding: '8px 14px',
    fontSize: '13px',
    cursor: 'pointer',
    marginRight: '8px',
    marginBottom: '6px',
  }),
  nutVien: (mauVien = '#374151') => ({
    background: '#fff',
    color: mauVien,
    border: `1px solid ${mauVien}`,
    borderRadius: '6px',
    padding: '7px 14px',
    fontSize: '13px',
    cursor: 'pointer',
    marginRight: '8px',
    marginBottom: '6px',
  }),
  nhan: (mauChu, mauNen) => ({
    display: 'inline-block',
    background: mauNen,
    color: mauChu,
    borderRadius: '6px',
    padding: '4px 10px',
    fontSize: '12px',
    fontWeight: '600',
    marginBottom: '8px',
  }),
  danhSachHS: {
    marginTop: '8px',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    overflow: 'hidden',
    maxHeight: '220px',
    overflowY: 'auto',
  },
  dongHS: {
    padding: '8px 12px',
    borderBottom: '1px solid #f3f4f6',
    fontSize: '13px',
    display: 'flex',
    justifyContent: 'space-between',
    gap: '8px',
  },
  hopLoi: {
    background: mau.doNhat,
    border: `1px solid ${mau.do}`,
    borderRadius: '6px',
    padding: '8px 12px',
    color: mau.do,
    fontSize: '13px',
    marginTop: '8px',
  },
  hopOk: {
    background: '#d1fae5',
    border: '1px solid #059669',
    borderRadius: '6px',
    padding: '8px 12px',
    color: '#065f46',
    fontSize: '13px',
    marginTop: '8px',
  },
  duongNgang: {
    borderTop: '1px solid #e5e7eb',
    margin: '16px 0',
  },
  khungDemoFlow: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    padding: '16px',
    marginBottom: '24px',
  },
  tieuDemoFlow: {
    fontSize: '16px',
    fontWeight: '700',
    marginBottom: '16px',
    color: '#1e293b',
  },
  dongFlow: (trangThai) => ({
    display: 'flex',
    alignItems: 'center',
    padding: '10px 14px',
    borderRadius: '8px',
    marginBottom: '8px',
    background: trangThai === 'pass' ? '#d1fae5' : trangThai === 'fail' ? mau.doNhat : mau.xamNhat,
    border: `1px solid ${trangThai === 'pass' ? '#059669' : trangThai === 'fail' ? mau.do : '#e5e7eb'}`,
  }),
  noiDungFlow: {
    flex: 1,
    fontSize: '13px',
    color: '#374151',
  },
  bienHieuFlow: {
    fontSize: '14px',
    fontWeight: 'bold',
    marginRight: '10px',
    minWidth: '28px',
    textAlign: 'center',
  },
};

const LOAI_EHR = [
  { value: 'DIAGNOSIS', label: 'Chẩn đoán' },
  { value: 'PRESCRIPTION', label: 'Đơn thuốc' },
  { value: 'LAB_RESULT', label: 'Kết quả xét nghiệm' },
  { value: 'IMAGING', label: 'Hình ảnh y tế' },
  { value: 'VISIT_NOTE', label: 'Ghi chú thăm khám' },
];


// ─── Form đăng nhập ────────────────────────────────────────────────────────────
function FormDangNhap({ onDangNhap, macDinhUserId = '', mauSac }) {
  const [userId, setUserId] = useState(macDinhUserId);
  const [matKhau, setMatKhau] = useState('password123');
  const [loi, setLoi] = useState('');
  const [dangTai, setDangTai] = useState(false);

  const xuLyDangNhap = async () => {
    setLoi('');
    setDangTai(true);
    try {
      const res = await axios.post(`${API}/auth/login`, { userId, password: matKhau });
      onDangNhap(res.data);
    } catch (e) {
      setLoi(e.response?.data?.message || e.message || 'Đăng nhập thất bại');
    } finally {
      setDangTai(false);
    }
  };

  return (
    <div>
      <input style={css.input} placeholder="Mã người dùng" value={userId}
        onChange={e => setUserId(e.target.value)} />
      <input style={css.input} type="password" placeholder="Mật khẩu" value={matKhau}
        onChange={e => setMatKhau(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && xuLyDangNhap()} />
      <button style={css.nut(mauSac)} onClick={xuLyDangNhap} disabled={dangTai}>
        {dangTai ? 'Đang đăng nhập...' : 'Đăng nhập'}
      </button>
      {loi && <div style={css.hopLoi}>{loi}</div>}
    </div>
  );
}

// ─── Thẻ người dùng ────────────────────────────────────────────────────────────
function TheNguoiDung({ nguoiDung, mauSac, onDangXuat }) {
  const msp = nguoiDung.orgMsp || nguoiDung.hospitalId || '';
  const tenBenhVien = msp.includes('HospitalB') ? 'Bệnh viện B' : 'Bệnh viện A';
  const tenVaiTro = nguoiDung.role === 'Doctor' ? 'Bác sĩ' : nguoiDung.role === 'Patient' ? 'Bệnh nhân' : nguoiDung.role;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
      <span style={css.nhan(mauSac, mauSac + '18')}>
        {nguoiDung.userId} | {tenBenhVien} | {tenVaiTro}
      </span>
      <button style={css.nutVien(mauSac)} onClick={onDangXuat}>Đăng xuất</button>
    </div>
  );
}

// ─── Danh sách hồ sơ EHR ───────────────────────────────────────────────────────
function DanhSachHoSo({ hoSoList }) {
  if (!hoSoList || hoSoList.length === 0)
    return <div style={{ color: mau.xam, fontSize: '13px' }}>Chưa có hồ sơ nào.</div>;

  const tenLoai = (type) => LOAI_EHR.find(l => l.value === type)?.label || type || '-';
  const rutGon = (s, n = 16) => s ? (s.length > n ? s.slice(0, n) + '…' : s) : '-';

  return (
    <div style={css.danhSachHS}>
      <div style={{ ...css.dongHS, background: '#f8fafc', fontWeight: '600', fontSize: '12px', color: mau.xam }}>
        <span style={{ flex: 2 }}>Mã hồ sơ</span>
        <span style={{ flex: 1 }}>Loại</span>
        <span style={{ flex: 2 }}>IPFS CID</span>
        <span style={{ flex: 1 }}>Ngày tạo</span>
      </div>
      {hoSoList.map((hs, i) => {
        const cid = hs.ipfsCid || hs.cid || '-';
        const cidUrl = cid !== '-' ? `http://localhost:8081/ipfs/${cid}` : null;
        return (
          <div key={i} style={{ ...css.dongHS, background: i % 2 === 0 ? '#fff' : '#f9fafb', alignItems: 'flex-start' }}>
            <span style={{ flex: 2, fontFamily: 'monospace', fontSize: '11px', wordBreak: 'break-all' }}>
              {hs.ehrId || hs.id || '-'}
            </span>
            <span style={{ flex: 1 }}>{tenLoai(hs.ehrType || hs.recordType || hs.type)}</span>
            <span style={{ flex: 2, fontFamily: 'monospace', fontSize: '11px', wordBreak: 'break-all' }}>
              {cidUrl
                ? <a href={cidUrl} target="_blank" rel="noreferrer" style={{ color: '#2563eb', textDecoration: 'none' }} title={cid}>
                    {rutGon(cid, 20)}
                  </a>
                : '-'}
            </span>
            <span style={{ flex: 1, color: mau.xam, fontSize: '12px' }}>
              {hs.createdAt ? new Date(hs.createdAt).toLocaleDateString('vi-VN') : '-'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Form tạo hồ sơ EHR mới (đa trường) ──────────────────────────────────────
const TRUONG_THEO_LOAI = {
  DIAGNOSIS: [
    { key: 'chanDoan', label: 'Chẩn đoán chính', placeholder: 'VD: Tăng huyết áp độ 1' },
    { key: 'trieuChung', label: 'Triệu chứng', placeholder: 'VD: Đau đầu, chóng mặt, mệt mỏi' },
    { key: 'mucDoNghiemTrong', label: 'Mức độ', placeholder: 'Nhẹ / Trung bình / Nặng' },
    { key: 'ghiChu', label: 'Ghi chú', placeholder: 'Ghi chú thêm của bác sĩ', loai: 'textarea' },
  ],
  PRESCRIPTION: [
    { key: 'thuoc', label: 'Tên thuốc', placeholder: 'VD: Amlodipine 5mg' },
    { key: 'lieuDung', label: 'Liều dùng', placeholder: 'VD: 1 viên/ngày, sau ăn sáng' },
    { key: 'soNgayDung', label: 'Số ngày dùng', placeholder: 'VD: 30 ngày' },
    { key: 'luuY', label: 'Lưu ý', placeholder: 'Không dùng cùng với...', loai: 'textarea' },
  ],
  LAB_RESULT: [
    { key: 'loaiXetNghiem', label: 'Loại xét nghiệm', placeholder: 'VD: Xét nghiệm máu tổng quát' },
    { key: 'ketQua', label: 'Kết quả', placeholder: 'VD: Hb: 12.5 g/dL, WBC: 7.2 K/uL' },
    { key: 'giaTriBinhThuong', label: 'Chỉ số bình thường', placeholder: 'VD: Hb: 12-16 g/dL' },
    { key: 'nhanXet', label: 'Nhận xét', placeholder: 'Bình thường / Bất thường', loai: 'textarea' },
  ],
  IMAGING: [
    { key: 'loaiHinhAnh', label: 'Loại hình ảnh', placeholder: 'VD: X-quang ngực thẳng' },
    { key: 'viTri', label: 'Vị trí', placeholder: 'VD: Phổi, tim, cơ hoành' },
    { key: 'moTa', label: 'Mô tả', placeholder: 'Mô tả hình ảnh...', loai: 'textarea' },
    { key: 'ketLuan', label: 'Kết luận', placeholder: 'VD: Không phát hiện bất thường', loai: 'textarea' },
  ],
  VISIT_NOTE: [
    { key: 'lyDoKham', label: 'Lý do khám', placeholder: 'VD: Khám định kỳ, tái khám' },
    { key: 'tinhTrangHienTai', label: 'Tình trạng hiện tại', placeholder: 'Mô tả tình trạng bệnh nhân...' },
    { key: 'huongXuLy', label: 'Hướng xử lý', placeholder: 'VD: Kê đơn, hẹn tái khám sau 1 tháng' },
    { key: 'ghiChu', label: 'Ghi chú', placeholder: 'Thông tin thêm...', loai: 'textarea' },
  ],
};

function FormTaoHoSo({ token, onTaoXong }) {
  const [loaiHS, setLoaiHS] = useState('DIAGNOSIS');
  const [truongDuLieu, setTruongDuLieu] = useState({});
  const [dangTai, setDangTai] = useState(false);
  const [ketQua, setKetQua] = useState(null);
  const [loi, setLoi] = useState('');
  const [moRong, setMoRong] = useState(false);

  const doiLoai = (loai) => {
    setLoaiHS(loai);
    setTruongDuLieu({});
    setKetQua(null);
    setLoi('');
  };

  const capNhat = (key, val) => setTruongDuLieu(p => ({ ...p, [key]: val }));

  const xuLyTao = async () => {
    setDangTai(true); setLoi(''); setKetQua(null);
    try {
      const pubKeyRes = await axios.get(`${API}/auth/public-key/PAT001`, {
        headers: { Authorization: `Bearer ${token}` }
      }).catch(() => null);
      const publicKey = pubKeyRes?.data?.publicKey;
      if (!publicKey) {
        setLoi('Không lấy được public key của bệnh nhân.');
        setDangTai(false);
        return;
      }
      const res = await axios.post(`${API}/ehr`, {
        patientId: 'PAT001',
        ehrType: loaiHS,
        ehrData: { loai: loaiHS, ...truongDuLieu },
        patientPublicKey: publicKey,
      }, { headers: { Authorization: `Bearer ${token}` } });
      setKetQua(res.data.ehrId || res.data.id || 'Tạo thành công');
      setTruongDuLieu({});
      if (onTaoXong) onTaoXong();
    } catch (e) {
      setLoi(e.response?.data?.error || e.response?.data?.message || e.message);
    } finally {
      setDangTai(false);
    }
  };

  const cacTruong = TRUONG_THEO_LOAI[loaiHS] || [];

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden', marginTop: '8px' }}>
      <div
        style={{ padding: '8px 12px', background: '#f8fafc', cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: '#374151', display: 'flex', justifyContent: 'space-between' }}
        onClick={() => setMoRong(!moRong)}
      >
        <span>+ Thêm hồ sơ mới cho PAT001</span>
        <span>{moRong ? '▲' : '▼'}</span>
      </div>
      {moRong && (
        <div style={{ padding: '12px' }}>
          <div style={{ fontSize: '12px', color: mau.xam, marginBottom: '4px' }}>Loại hồ sơ</div>
          <select style={css.select} value={loaiHS} onChange={e => doiLoai(e.target.value)}>
            {LOAI_EHR.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
          {cacTruong.map(tr => (
            <div key={tr.key}>
              <div style={{ fontSize: '12px', color: mau.xam, marginBottom: '4px' }}>{tr.label}</div>
              {tr.loai === 'textarea' ? (
                <textarea style={css.textarea} placeholder={tr.placeholder}
                  value={truongDuLieu[tr.key] || ''}
                  onChange={e => capNhat(tr.key, e.target.value)} />
              ) : (
                <input style={css.input} placeholder={tr.placeholder}
                  value={truongDuLieu[tr.key] || ''}
                  onChange={e => capNhat(tr.key, e.target.value)} />
              )}
            </div>
          ))}
          <button style={css.nut(mau.benhVienA)} onClick={xuLyTao} disabled={dangTai}>
            {dangTai ? 'Đang lưu lên blockchain...' : 'Lưu hồ sơ'}
          </button>
          {ketQua && <div style={css.hopOk}>Đã tạo hồ sơ — Mã: <code style={{ fontSize: '11px' }}>{ketQua}</code></div>}
          {loi && <div style={css.hopLoi}>{loi}</div>}
        </div>
      )}
    </div>
  );
}

// ─── Panel Bệnh viện A ─────────────────────────────────────────────────────────
function PanelBenhVienA({ trangThaiFlow, setTrangThaiFlow }) {
  const [bacSi, setBacSi] = useState(null);
  const [benhNhan, setBenhNhan] = useState(null);
  const [danhSachHS, setDanhSachHS] = useState(null);
  const [trangThaiHS, setTrangThaiHS] = useState(null);
  const [loiHS, setLoiHS] = useState('');
  // Consent theo từng EHR
  const [danhSachHSBenhNhan, setDanhSachHSBenhNhan] = useState(null);
  const [ehrDaChon, setEhrDaChon] = useState([]); // [] = chưa chọn gì, null = chọn tất cả
  const [dangTaiHSBN, setDangTaiHSBN] = useState(false);
  const [maChapThuan, setMaChapThuan] = useState('');
  const [trangThaiChapThuan, setTrangThaiChapThuan] = useState(null);
  const [trangThaiThuHoi, setTrangThaiThuHoi] = useState(null);
  const [dangTai, setDangTai] = useState({});

  const dat = (key, val) => setDangTai(p => ({ ...p, [key]: val }));
  const tenLoai = (type) => LOAI_EHR.find(l => l.value === type)?.label || type || '-';

  const xemHoSo = async () => {
    if (!bacSi) return;
    dat('hs', true);
    setTrangThaiHS(null); setLoiHS(''); setDanhSachHS(null);
    try {
      const res = await axios.get(`${API}/ehr/patient/PAT001`, {
        headers: { Authorization: `Bearer ${bacSi.token}` },
      });
      const ds = res.data.ehrList || res.data.records || res.data.data || [];
      setDanhSachHS(Array.isArray(ds) ? ds : [ds]);
      setTrangThaiHS('ok');
      setTrangThaiFlow(p => ({ ...p, buoc1: 'pass' }));
    } catch (e) {
      setLoiHS(e.response?.data?.message || e.message);
      setTrangThaiHS('loi');
      setTrangThaiFlow(p => ({ ...p, buoc1: 'fail' }));
    } finally { dat('hs', false); }
  };

  const taiDanhSachHSBenhNhan = async (token) => {
    setDangTaiHSBN(true);
    try {
      const res = await axios.get(`${API}/ehr/patient/PAT001`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const ds = res.data.ehrList || res.data.records || res.data.data || [];
      setDanhSachHSBenhNhan(Array.isArray(ds) ? ds : [ds]);
    } catch (e) {
      setDanhSachHSBenhNhan([]);
    } finally { setDangTaiHSBN(false); }
  };

  const batTatChon = (ehrId) => {
    setEhrDaChon(prev =>
      prev.includes(ehrId) ? prev.filter(id => id !== ehrId) : [...prev, ehrId]
    );
  };

  const capChapThuan = async () => {
    if (!benhNhan) return;
    dat('ct', true); setTrangThaiChapThuan(null);
    try {
      const ehrIds = ehrDaChon.length > 0 ? ehrDaChon : null; // null = ALL
      const payload = {
        doctorId: 'DOC002',
        purpose: 'TREATMENT',
        durationDays: 7,
      };
      if (ehrIds) payload.ehrIds = ehrIds;
      const res = await axios.post(`${API}/consent`, payload,
        { headers: { Authorization: `Bearer ${benhNhan.token}` } });
      const ma = res.data.consentId || res.data.id || res.data.consent?.consentId;
      setMaChapThuan(ma);
      setTrangThaiChapThuan('ok');
      setTrangThaiFlow(p => ({ ...p, buoc3: 'pass', maChapThuanHienTai: ma }));
    } catch (e) {
      setTrangThaiChapThuan('loi:' + (e.response?.data?.message || e.message));
    } finally { dat('ct', false); }
  };

  const thuHoiChapThuan = async () => {
    const ma = maChapThuan || trangThaiFlow.maChapThuanHienTai;
    if (!benhNhan || !ma) return;
    dat('th', true); setTrangThaiThuHoi(null);
    try {
      await axios.delete(`${API}/consent/${ma}`, {
        headers: { Authorization: `Bearer ${benhNhan.token}` },
      });
      setTrangThaiThuHoi('ok');
      setMaChapThuan('');
      setTrangThaiChapThuan(null);
      setEhrDaChon([]);
      setTrangThaiFlow(p => ({ ...p, buoc5: 'pass', maChapThuanHienTai: null }));
    } catch (e) {
      setTrangThaiThuHoi('loi:' + (e.response?.data?.message || e.message));
    } finally { dat('th', false); }
  };

  const thuHoiTatCaChapThuan = async () => {
    if (!benhNhan) return;
    dat('thTatCa', true); setTrangThaiThuHoi(null);
    try {
      // Lấy danh sách consent active
      const resConsent = await axios.get(`${API}/consent/patient/PAT001`, {
        headers: { Authorization: `Bearer ${benhNhan.token}` },
      });
      const consents = resConsent.data?.consents || resConsent.data || [];
      const actives = (Array.isArray(consents) ? consents : []).filter(c => c.status === 'ACTIVE');
      if (actives.length === 0) {
        setTrangThaiThuHoi('thuHoiTatCa');
        return;
      }
      for (const c of actives) {
        await axios.delete(`${API}/consent/${c.consentId}`, {
          headers: { Authorization: `Bearer ${benhNhan.token}` },
        }).catch(() => {});
      }
      setTrangThaiThuHoi('thuHoiTatCa');
      setMaChapThuan('');
      setTrangThaiChapThuan(null);
      setEhrDaChon([]);
      setTrangThaiFlow(p => ({ ...p, buoc5: 'pass', maChapThuanHienTai: null }));
    } catch (e) {
      setTrangThaiThuHoi('loi:' + (e.response?.data?.message || e.message));
    } finally { dat('thTatCa', false); }
  };

  return (
    <div style={css.khung(mau.benhVienA)}>
      <div style={css.dauKhung(mau.benhVienA)}>Bệnh viện A</div>
      <div style={css.thanKhung}>

        {/* Bác sĩ DOC001 */}
        <div style={css.muc}>
          <div style={css.tieuMuc}>Bác sĩ — DOC001</div>
          {!bacSi ? (
            <FormDangNhap macDinhUserId="DOC001" mauSac={mau.benhVienA} onDangNhap={d => setBacSi(d)} />
          ) : (
            <>
              <TheNguoiDung nguoiDung={bacSi.user} mauSac={mau.benhVienA}
                onDangXuat={() => { setBacSi(null); setDanhSachHS(null); setTrangThaiHS(null); }} />
              <button style={css.nut(mau.benhVienA)} onClick={xemHoSo} disabled={dangTai.hs}>
                {dangTai.hs ? 'Đang tải...' : 'Xem hồ sơ của PAT001'}
              </button>
              {trangThaiHS === 'ok' && (
                <>
                  <div style={css.nhan('#065f46', '#d1fae5')}>Cùng bệnh viện — không cần chấp thuận</div>
                  <DanhSachHoSo hoSoList={danhSachHS} />
                  <FormTaoHoSo token={bacSi.token} onTaoXong={xemHoSo} />
                </>
              )}
              {trangThaiHS === 'loi' && <div style={css.hopLoi}>{loiHS}</div>}
              {trangThaiHS === null && (
                <FormTaoHoSo token={bacSi.token} onTaoXong={xemHoSo} />
              )}
            </>
          )}
        </div>

        <div style={css.duongNgang} />

        {/* Bệnh nhân PAT001 */}
        <div style={css.muc}>
          <div style={css.tieuMuc}>Bệnh nhân — PAT001</div>
          {!benhNhan ? (
            <FormDangNhap macDinhUserId="PAT001" mauSac={mau.cam}
              onDangNhap={d => { setBenhNhan(d); taiDanhSachHSBenhNhan(d.token); }} />
          ) : (
            <>
              <TheNguoiDung nguoiDung={benhNhan.user} mauSac={mau.cam}
                onDangXuat={() => { setBenhNhan(null); setMaChapThuan(''); setTrangThaiChapThuan(null); setTrangThaiThuHoi(null); setDanhSachHSBenhNhan(null); setEhrDaChon([]); }} />

              {/* Chọn hồ sơ để cấp quyền */}
              {trangThaiChapThuan !== 'ok' && trangThaiThuHoi !== 'ok' && (
                <div style={{ marginBottom: '10px' }}>
                  <div style={{ fontSize: '12px', color: mau.xam, marginBottom: '6px', fontWeight: '600' }}>
                    Cấp quyền cho DOC002 (Bệnh viện B) — chọn hồ sơ:
                  </div>
                  {dangTaiHSBN && <div style={{ fontSize: '12px', color: mau.xam }}>Đang tải danh sách hồ sơ...</div>}
                  {danhSachHSBenhNhan && danhSachHSBenhNhan.length === 0 && (
                    <div style={{ fontSize: '12px', color: mau.xam }}>Chưa có hồ sơ nào.</div>
                  )}
                  {danhSachHSBenhNhan && danhSachHSBenhNhan.length > 0 && (
                    <div style={{ border: '1px solid #e5e7eb', borderRadius: '6px', overflow: 'hidden', marginBottom: '8px', maxHeight: '180px', overflowY: 'auto' }}>
                      {danhSachHSBenhNhan.map((hs, i) => {
                        const id = hs.ehrId || hs.id;
                        const chon = ehrDaChon.includes(id);
                        return (
                          <div key={i} onClick={() => batTatChon(id)}
                            style={{ padding: '7px 10px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', background: chon ? '#eff6ff' : (i % 2 === 0 ? '#fff' : '#f9fafb'), borderBottom: '1px solid #f3f4f6' }}>
                            <input type="checkbox" checked={chon} onChange={() => batTatChon(id)} onClick={e => e.stopPropagation()} />
                            <span style={{ fontFamily: 'monospace', fontSize: '11px', flex: 1 }}>{id?.slice(0, 25)}...</span>
                            <span style={{ fontSize: '12px', color: mau.xam }}>{tenLoai(hs.ehrType || hs.recordType || hs.type)}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div style={{ fontSize: '11px', color: mau.xam, marginBottom: '6px' }}>
                    {ehrDaChon.length === 0
                      ? 'Chưa chọn hồ sơ nào — sẽ cấp quyền toàn bộ hồ sơ'
                      : `Đã chọn ${ehrDaChon.length} hồ sơ`}
                  </div>
                  <button style={css.nut(mau.cam)} onClick={capChapThuan} disabled={dangTai.ct}>
                    {dangTai.ct ? 'Đang xử lý...' : ehrDaChon.length === 0 ? 'Cấp quyền toàn bộ hồ sơ' : `Cấp quyền ${ehrDaChon.length} hồ sơ đã chọn`}
                  </button>
                </div>
              )}

              {trangThaiChapThuan === 'ok' && (
                <div style={css.hopOk}>
                  Đã cấp quyền thành công
                  {ehrDaChon.length > 0 && ` (${ehrDaChon.length} hồ sơ)`}
                  {ehrDaChon.length === 0 && ' (toàn bộ hồ sơ)'}
                  <br/>
                  <span style={{ fontSize: '11px' }}>Mã chấp thuận: <code>{maChapThuan}</code></span>
                </div>
              )}
              {trangThaiChapThuan?.startsWith('loi:') && (
                <div style={css.hopLoi}>{trangThaiChapThuan.slice(4)}</div>
              )}

              {(trangThaiChapThuan === 'ok' || trangThaiFlow.maChapThuanHienTai) && trangThaiThuHoi !== 'ok' && (
                <button style={css.nut(mau.do)} onClick={thuHoiChapThuan} disabled={dangTai.th}>
                  {dangTai.th ? 'Đang thu hồi...' : 'Thu hồi quyền truy cập'}
                </button>
              )}
              {trangThaiThuHoi === 'ok' && <div style={css.hopOk}>Quyền truy cập đã bị thu hồi thành công.</div>}
              {trangThaiThuHoi === 'thuHoiTatCa' && <div style={css.hopOk}>Đã thu hồi tất cả quyền truy cập đang active.</div>}
              {trangThaiThuHoi?.startsWith('loi:') && <div style={css.hopLoi}>{trangThaiThuHoi.slice(4)}</div>}

              {/* Thu hồi tất cả consent active */}
              <div style={{ marginTop: '8px' }}>
                <button style={css.nutVien(mau.do)} onClick={thuHoiTatCaChapThuan} disabled={dangTai.thTatCa}>
                  {dangTai.thTatCa ? 'Đang thu hồi...' : 'Thu hồi tất cả quyền đang active'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Panel Bệnh viện B ─────────────────────────────────────────────────────────
function PanelBenhVienB({ trangThaiFlow, setTrangThaiFlow }) {
  const [bacSi, setBacSi] = useState(null);
  const [danhSachHS, setDanhSachHS] = useState(null);
  const [trangThaiHS, setTrangThaiHS] = useState(null);
  const [loiHS, setLoiHS] = useState('');
  const [dangTai, setDangTai] = useState(false);

  const [consentScope, setConsentScope] = useState(null);

  const xemHoSo = async (laThaiLai = false) => {
    if (!bacSi) return;
    setDangTai(true);
    setTrangThaiHS(null); setLoiHS(''); setDanhSachHS(null); setConsentScope(null);
    try {
      const res = await axios.get(`${API}/ehr/patient/PAT001`, {
        headers: { Authorization: `Bearer ${bacSi.token}` },
      });
      const ds = res.data.ehrList || res.data.records || res.data.data || [];
      setDanhSachHS(Array.isArray(ds) ? ds : [ds]);
      setConsentScope(res.data.consentScope || null);
      setTrangThaiHS('ok');
      if (laThaiLai) setTrangThaiFlow(p => ({ ...p, buoc4: 'pass' }));
      else setTrangThaiFlow(p => ({ ...p, buoc2: 'fail' }));
    } catch (e) {
      const msg = e.response?.data?.message || e.message;
      setLoiHS(msg);
      const ma = e.response?.status;
      setTrangThaiHS(ma === 403 ? 'tucChoi' : 'loi');
      if (laThaiLai) setTrangThaiFlow(p => ({ ...p, buoc6: 'fail' }));
      else setTrangThaiFlow(p => ({ ...p, buoc2: 'fail' }));
    } finally { setDangTai(false); }
  };

  const coChapThuan = !!trangThaiFlow.maChapThuanHienTai;

  return (
    <div style={css.khung(mau.benhVienB)}>
      <div style={css.dauKhung(mau.benhVienB)}>Bệnh viện B</div>
      <div style={css.thanKhung}>
        <div style={css.muc}>
          <div style={css.tieuMuc}>Bác sĩ — DOC002</div>
          {!bacSi ? (
            <FormDangNhap macDinhUserId="DOC002" mauSac={mau.benhVienB} onDangNhap={d => setBacSi(d)} />
          ) : (
            <>
              <TheNguoiDung nguoiDung={bacSi.user} mauSac={mau.benhVienB}
                onDangXuat={() => { setBacSi(null); setDanhSachHS(null); setTrangThaiHS(null); }} />

              <button style={css.nut(mau.benhVienB)} onClick={() => xemHoSo(false)} disabled={dangTai}>
                {dangTai ? 'Đang tải...' : 'Xem hồ sơ của PAT001'}
              </button>

              {trangThaiHS === 'tucChoi' && (
                <div style={css.hopLoi}>
                  <div style={{ fontWeight: '700', marginBottom: '4px' }}>403 — Từ chối truy cập</div>
                  <div style={{ fontSize: '12px' }}>{loiHS}</div>
                  <div style={{ fontSize: '12px', marginTop: '4px' }}>Bệnh nhân chưa cấp quyền cho bác sĩ này.</div>
                </div>
              )}
              {trangThaiHS === 'loi' && <div style={css.hopLoi}>{loiHS}</div>}
              {trangThaiHS === 'ok' && (
                <>
                  <div style={css.nhan('#065f46', '#d1fae5')}>Truy cập được cấp phép qua chấp thuận</div>
                  {consentScope && consentScope !== 'ALL' && (
                    <div style={{ fontSize: '12px', color: mau.benhVienB, marginBottom: '6px' }}>
                      Phạm vi: {Array.isArray(consentScope) ? `${consentScope.length} hồ sơ được cấp phép` : consentScope}
                    </div>
                  )}
                  {consentScope === 'ALL' && (
                    <div style={{ fontSize: '12px', color: mau.xam, marginBottom: '6px' }}>Phạm vi: toàn bộ hồ sơ</div>
                  )}
                  <DanhSachHoSo hoSoList={danhSachHS} />
                </>
              )}

              <div style={{ marginTop: '12px' }}>
                <button style={css.nutVien(mau.benhVienB)} onClick={() => xemHoSo(true)} disabled={dangTai}>
                  Thử lại (sau khi cấp / thu hồi quyền)
                </button>
                <span style={{ fontSize: '12px', color: coChapThuan ? mau.benhVienB : mau.do }}>
                  {coChapThuan ? 'Đang có quyền truy cập' : 'Chưa được cấp quyền'}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Khu vực Demo Flow ─────────────────────────────────────────────────────────
function KhuVucDemoFlow({ trangThaiFlow }) {
  const cacBuoc = [
    { key: 'buoc1', moTa: 'DOC001 xem hồ sơ PAT001 tại Bệnh viện A — cùng viện, không cần chấp thuận', mongDoi: 'pass' },
    { key: 'buoc2', moTa: 'DOC002 xem hồ sơ PAT001 từ Bệnh viện B — chưa có quyền, bị từ chối', mongDoi: 'fail' },
    { key: 'buoc3', moTa: 'PAT001 cấp quyền truy cập cho DOC002 (Bệnh viện B)', mongDoi: 'pass' },
    { key: 'buoc4', moTa: 'DOC002 truy cập lại sau khi được cấp quyền — thành công', mongDoi: 'pass' },
    { key: 'buoc5', moTa: 'PAT001 thu hồi quyền truy cập của DOC002', mongDoi: 'pass' },
    { key: 'buoc6', moTa: 'DOC002 thử lại sau khi bị thu hồi — bị từ chối', mongDoi: 'fail' },
  ];

  const layBienHieu = (trangThai, mongDoi) => {
    if (!trangThai) return { ky: '○', mau: '#9ca3af' };
    const ok = (trangThai === 'pass' && mongDoi === 'pass') || (trangThai === 'fail' && mongDoi === 'fail');
    return ok ? { ky: '✓', mau: '#059669' } : { ky: '✗', mau: '#dc2626' };
  };

  const layTrangThaiDong = (trangThai, mongDoi) => {
    if (!trangThai) return 'cho';
    return ((trangThai === 'pass' && mongDoi === 'pass') || (trangThai === 'fail' && mongDoi === 'fail')) ? 'pass' : 'fail';
  };

  return (
    <div style={css.khungDemoFlow}>
      <div style={css.tieuDemoFlow}>Kịch bản demo — Chia sẻ hồ sơ y tế liên bệnh viện</div>
      {cacBuoc.map((buoc, i) => {
        const ts = trangThaiFlow[buoc.key];
        const bh = layBienHieu(ts, buoc.mongDoi);
        const ttDong = layTrangThaiDong(ts, buoc.mongDoi);
        return (
          <div key={buoc.key} style={css.dongFlow(ttDong)}>
            <div style={{ ...css.bienHieuFlow, color: bh.mau }}>
              {bh.ky}
            </div>
            <div style={css.noiDungFlow}>
              <strong>Bước {i + 1}:</strong> {buoc.moTa}
            </div>
            <div style={{ fontSize: '11px', color: mau.xam, marginLeft: '8px', whiteSpace: 'nowrap' }}>
              {buoc.mongDoi === 'pass' ? '(mong muốn: cho phép)' : '(mong muốn: từ chối)'}
            </div>
          </div>
        );
      })}
      <div style={{ marginTop: '12px', fontSize: '12px', color: mau.xam }}>
        Thực hiện các thao tác tại hai panel bên trên theo thứ tự từ bước 1 đến bước 6.
      </div>
    </div>
  );
}

// ─── Ứng dụng chính ────────────────────────────────────────────────────────────
export default function App() {
  const [trangThaiFlow, setTrangThaiFlow] = useState({
    buoc1: null, buoc2: null, buoc3: null,
    buoc4: null, buoc5: null, buoc6: null,
    maChapThuanHienTai: null,
  });

  return (
    <div style={css.trang}>
      <div style={css.tieuDe}>
        <h1 style={css.h1}>Demo Chia sẻ Hồ sơ Y tế Liên Bệnh viện</h1>
        <p style={css.moTa}>
          Mô phỏng luồng kiểm soát truy cập hồ sơ bệnh nhân giữa các bệnh viện dựa trên Hyperledger Fabric và IPFS
        </p>
      </div>

      <div style={css.luoi}>
        <PanelBenhVienA trangThaiFlow={trangThaiFlow} setTrangThaiFlow={setTrangThaiFlow} />
        <PanelBenhVienB trangThaiFlow={trangThaiFlow} setTrangThaiFlow={setTrangThaiFlow} />
      </div>

      <KhuVucDemoFlow trangThaiFlow={trangThaiFlow} />


    </div>
  );
}
