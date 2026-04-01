'use strict';

/**
 * Unit Test Skeleton - EHRRegistryContract
 * Framework: Jest
 * Mô tả: Kiểm thử các chức năng cốt lõi của chaincode quản lý EHR trên Hyperledger Fabric
 */

jest.mock('fabric-contract-api', () => ({
    Contract: class Contract {},
}));

jest.mock('fabric-shim', () => ({
    ClientIdentity: jest.fn(),
}));

const { ClientIdentity } = require('fabric-shim');
const EHRRegistryContract = require('../lib/ehr-registry');

// Helper: tạo mock context dùng chung
function buildMockCtx({ role = 'Doctor', mspId = 'HospitalMSP', doctorId = 'doctor001' } = {}) {
    ClientIdentity.mockImplementation(() => ({
        getAttributeValue: jest.fn((attr) => attr === 'role' ? role : null),
        getID: jest.fn(() => `x509::CN=${doctorId},OU=client::CN=ca.${mspId}`),
        getMSPID: jest.fn(() => mspId),
    }));

    return {
        stub: {
            getState: jest.fn(),
            putState: jest.fn(),
            setEvent: jest.fn(),
            getTxID: jest.fn(() => 'mock-tx-id-001'),
            getTxTimestamp: jest.fn(() => ({ seconds: { low: 1700000000 } })),
            getChannelID: jest.fn(() => 'ehr-channel'),
            getCreator: jest.fn(() => ({ mspid: mspId })),
        },
        clientIdentity: new ClientIdentity(),
    };
}

// Dữ liệu mẫu — accessGrants là object {doctorId: encryptedDEK}
const SAMPLE_EHR_ID = 'EHR_001';
const SAMPLE_EHR = {
    ehrId: 'EHR_001', patientId: 'patient001',
    ipfsHash: 'QmXyz123abc', encryptedDEK: 'enc-key-base64',
    encryptedDEKFor: {}, ehrType: 'CONSULTATION', dataHash: 'sha256hash',
    createdBy: 'doctor001', createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    status: 'ACTIVE', accessGrants: { 'doctor001': 'enc-dek-for-doc1' },
};

describe('EHRRegistryContract', () => {
    let contract;
    beforeEach(() => { contract = new EHRRegistryContract(); jest.clearAllMocks(); });

    // 1. initLedger
    describe('initLedger', () => {
        it('nên trả về "OK" khi khởi tạo ledger thành công', async () => {
            const result = await contract.initLedger(buildMockCtx());
            expect(result).toBe('OK');
        });
    });

    // 2 & 3. createEHR
    describe('createEHR', () => {
        it('nên tạo EHR thành công khi caller có role Doctor', async () => {
            const ctx = buildMockCtx({ role: 'Doctor' });
            ctx.stub.getState.mockResolvedValue(null);  // chưa tồn tại
            await expect(contract.createEHR(ctx, SAMPLE_EHR_ID, 'patient001', 'QmXyz', 'enc-key'))
                .resolves.not.toThrow();
            expect(ctx.stub.putState).toHaveBeenCalledTimes(1);
        });

        it('nên ném lỗi khi EHR ID đã tồn tại trên ledger', async () => {
            const ctx = buildMockCtx({ role: 'Doctor' });
            ctx.stub.getState.mockResolvedValue(Buffer.from(JSON.stringify(SAMPLE_EHR)));
            await expect(contract.createEHR(ctx, SAMPLE_EHR_ID, 'patient001', 'QmXyz', 'enc-key'))
                .rejects.toThrow(/already exists/i);
        });
    });

    // 4 & 5. getEHR
    describe('getEHR', () => {
        it('nên trả về đúng EHR khi EHR tồn tại', async () => {
            const ctx = buildMockCtx();
            ctx.stub.getState.mockResolvedValue(Buffer.from(JSON.stringify(SAMPLE_EHR)));
            const result = await contract.getEHR(ctx, SAMPLE_EHR_ID);
            const parsed = typeof result === 'string' ? JSON.parse(result) : result;
            expect(parsed.ehrId).toBe(SAMPLE_EHR_ID);
        });

        it('nên ném lỗi khi EHR không tồn tại', async () => {
            const ctx = buildMockCtx();
            ctx.stub.getState.mockResolvedValue(null);
            await expect(contract.getEHR(ctx, 'EHR_NOT_FOUND'))
                .rejects.toThrow(/not found/i);
        });
    });

    // 6. addAccessGrant
    describe('addAccessGrant', () => {
        it('nên thêm doctor mới vào accessGrants', async () => {
            const ctx = buildMockCtx({ role: 'Admin' });
            ctx.stub.getState.mockResolvedValue(Buffer.from(JSON.stringify(SAMPLE_EHR)));
            await contract.addAccessGrant(ctx, SAMPLE_EHR_ID, 'doctor002', 'enc-dek-for-doc2');
            const saved = JSON.parse(ctx.stub.putState.mock.calls[0][1].toString());
            expect(saved.accessGrants).toHaveProperty('doctor002');
        });
    });

    // 7. revokeAccessGrant
    describe('revokeAccessGrant', () => {
        it('nên xóa doctor khỏi accessGrants', async () => {
            const ctx = buildMockCtx({ role: 'Admin' });
            const ehr = { ...SAMPLE_EHR, accessGrants: { 'doctor001': 'dek1', 'doctor002': 'dek2' } };
            ctx.stub.getState.mockResolvedValue(Buffer.from(JSON.stringify(ehr)));
            await contract.revokeAccessGrant(ctx, SAMPLE_EHR_ID, 'doctor002');
            const saved = JSON.parse(ctx.stub.putState.mock.calls[0][1].toString());
            expect(saved.accessGrants).not.toHaveProperty('doctor002');
        });
    });

    // 8. revokeEHR
    describe('revokeEHR', () => {
        it('nên đổi status thành "REVOKED"', async () => {
            const ctx = buildMockCtx({ role: 'Admin' });
            ctx.stub.getState.mockResolvedValue(Buffer.from(JSON.stringify(SAMPLE_EHR)));
            await contract.revokeEHR(ctx, SAMPLE_EHR_ID);
            const saved = JSON.parse(ctx.stub.putState.mock.calls[0][1].toString());
            expect(saved.status).toBe('REVOKED');
        });
    });
});
