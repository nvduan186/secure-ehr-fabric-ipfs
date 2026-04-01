#!/usr/bin/env node
/**
 * EHR System Benchmark Script
 * Measures performance of key operations: 50 iterations each
 * Outputs: mean, stddev, p95 in milliseconds
 */

const fs = require('fs');
const https = require('https');
const http = require('http');

const BASE_URL = 'http://localhost:3001';
const ITERATIONS = 50;

// ─── HTTP helper ─────────────────────────────────────────────────────────────
function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ─── Stats ────────────────────────────────────────────────────────────────────
function stats(times) {
  const n = times.length;
  const mean = times.reduce((a, b) => a + b, 0) / n;
  const variance = times.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);
  const sorted = [...times].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(n * 0.95)];
  return { mean, stddev, p95 };
}

// ─── Time a call ─────────────────────────────────────────────────────────────
async function timed(fn) {
  const start = performance.now();
  const result = await fn();
  const elapsed = performance.now() - start;
  return { elapsed, result };
}

async function bench(label, fn) {
  const times = [];
  let lastResult;
  process.stdout.write(`  Running: ${label} `);
  for (let i = 0; i < ITERATIONS; i++) {
    const { elapsed, result } = await timed(fn);
    times.push(elapsed);
    lastResult = result;
    if ((i + 1) % 10 === 0) process.stdout.write('.');
  }
  process.stdout.write(' done\n');
  return { label, ...stats(times), lastResult };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('EHR Benchmark — authenticating...\n');

  // Login
  const loginDoc1 = await request('POST', '/api/v1/auth/login', { userId: 'DOC001', password: 'password123' });
  const loginDoc2 = await request('POST', '/api/v1/auth/login', { userId: 'DOC002', password: 'password123' });
  const loginPat1 = await request('POST', '/api/v1/auth/login', { userId: 'PAT001', password: 'password123' });

  if (!loginDoc1.body.token || !loginDoc2.body.token || !loginPat1.body.token) {
    console.error('Login failed:', JSON.stringify({ loginDoc1: loginDoc1.body, loginDoc2: loginDoc2.body, loginPat1: loginPat1.body }));
    process.exit(1);
  }

  const tokenDoc1 = loginDoc1.body.token;
  const tokenDoc2 = loginDoc2.body.token;
  const tokenPat1 = loginPat1.body.token;

  const patientPublicKey = fs.readFileSync('/tmp/pat001-public.pem', 'utf8');

  console.log('Tokens obtained. Starting benchmark...\n');

  const results = [];

  // 1. EHR Creation
  results.push(await bench('EHR Creation', async () => {
    return request('POST', '/api/v1/ehr', {
      patientId: 'PAT001',
      ehrType: 'CONSULTATION',
      ehrData: { diagnosis: 'Benchmark test', notes: 'perf measurement', timestamp: new Date().toISOString() },
      patientPublicKey,
    }, tokenDoc1);
  }));

  // 2. EHR Retrieval
  results.push(await bench('EHR Retrieval', async () => {
    return request('GET', '/api/v1/ehr/patient/PAT001', null, tokenDoc1);
  }));

  // 3. Consent Grant (PAT001 → DOC002)
  const grantedConsentIds = [];
  const consentBench = await bench('Consent Grant', async () => {
    const res = await request('POST', '/api/v1/consent', {
      grantedTo: 'DOC002',
      purpose: 'BENCHMARK',
      durationHours: 1,
    }, tokenPat1);
    if (res.body && res.body.consentId) grantedConsentIds.push(res.body.consentId);
    return res;
  });
  results.push(consentBench);

  // 4. Consent Revoke
  // Grant extra consents if needed
  while (grantedConsentIds.length < ITERATIONS) {
    const r = await request('POST', '/api/v1/consent', {
      grantedTo: 'DOC002',
      purpose: 'BENCHMARK_EXTRA',
      durationHours: 1,
    }, tokenPat1);
    if (r.body && r.body.consentId) grantedConsentIds.push(r.body.consentId);
    else break;
  }

  const revokeIds = [...grantedConsentIds];
  results.push(await bench('Consent Revoke', async () => {
    const id = revokeIds.shift();
    if (!id) return { status: 400, body: { error: 'no consent id' } };
    return request('DELETE', `/api/v1/consent/${id}`, null, tokenPat1);
  }));

  // 5. Cross-hospital access with DOC002 token (after granting fresh consent)
  // Grant one consent so DOC002 can access
  await request('POST', '/api/v1/consent', {
    grantedTo: 'DOC002',
    purpose: 'CROSS_HOSPITAL_BENCH',
    durationHours: 1,
  }, tokenPat1);

  results.push(await bench('Cross-Hospital Access (DOC002)', async () => {
    return request('GET', '/api/v1/ehr/patient/PAT001', null, tokenDoc2);
  }));

  // ─── Print results ──────────────────────────────────────────────────────────
  console.log('\n## Benchmark Results\n');
  console.log('| Operation | Mean (ms) | Std Dev (ms) | P95 (ms) |');
  console.log('|-----------|-----------|--------------|----------|');
  for (const r of results) {
    console.log(`| ${r.label} | ${r.mean.toFixed(2)} | ${r.stddev.toFixed(2)} | ${r.p95.toFixed(2)} |`);
  }
  console.log();

  // ─── Save markdown ──────────────────────────────────────────────────────────
  const now = new Date().toISOString();
  let md = `# Benchmark Results\n\n`;
  md += `**Date:** ${now}  \n`;
  md += `**Backend:** ${BASE_URL}  \n`;
  md += `**Iterations:** ${ITERATIONS} per operation  \n\n`;
  md += `## Performance Table\n\n`;
  md += `| Operation | Mean (ms) | Std Dev (ms) | P95 (ms) |\n`;
  md += `|-----------|-----------|--------------|----------|\n`;
  for (const r of results) {
    md += `| ${r.label} | ${r.mean.toFixed(2)} | ${r.stddev.toFixed(2)} | ${r.p95.toFixed(2)} |\n`;
  }
  md += `\n## Notes\n\n`;
  md += `- All operations ran ${ITERATIONS} iterations sequentially.\n`;
  md += `- P95 = 95th percentile latency.\n`;
  md += `- EHR Creation includes AES encryption + IPFS upload + Fabric transaction.\n`;
  md += `- EHR Retrieval fetches metadata from Fabric + data from IPFS + decryption.\n`;
  md += `- Consent operations submit transactions to Hyperledger Fabric.\n`;
  md += `- Cross-Hospital Access tests DOC002 (HospitalB) accessing PAT001 records with consent.\n`;

  const outPath = '/home/nguye/.openclaw/workspace-thesis-lead/benchmark-results.md';
  fs.writeFileSync(outPath, md, 'utf8');
  console.log(`Results saved to: ${outPath}`);
}

main().catch((err) => {
  console.error('Benchmark error:', err);
  process.exit(1);
});
