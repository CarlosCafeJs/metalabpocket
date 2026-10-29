import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DesktopBackendError,
  createPinnedLookup,
  isMetaLabDesktopIdentity,
  isNonPublicAddress,
  isTlsCertificateErrorCode,
  resolveDesktopBackend
} from '../src/server/desktop/backend.ts';

const publicDns = async () => [{ address: '93.184.216.34', family: 4 }];

test('official custom domain and dashboard URL normalize to the HTTPS origin', async () => {
  for (const input of ['https://metalab.cafeflow.com.br', 'https://metalab.cafeflow.com.br/dashboard']) {
    const target = await resolveDesktopBackend(input, { lookup: publicDns });
    assert.equal(target.origin, 'https://metalab.cafeflow.com.br');
    assert.equal(target.hostname, 'metalab.cafeflow.com.br');
  }
});

test('a custom HTTPS domain can normalize when it resolves to a public address', async () => {
  const target = await resolveDesktopBackend('https://aula.example.org/dashboard', { lookup: publicDns });
  assert.equal(target.origin, 'https://aula.example.org');
});

test('insecure schemes, embedded credentials, malformed urls and arbitrary paths are rejected', async () => {
  for (const input of [
    'http://metalab.cafeflow.com.br',
    'https://student:secret@metalab.cafeflow.com.br',
    'https://metalab.cafeflow.com.br/teacher/panel',
    'https://metalab.cafeflow.com.br/dashboard////',
    'https://metalab.cafeflow.com.br/dashboard?redirect=https://example.org',
    'not a url'
  ]) {
    await assert.rejects(resolveDesktopBackend(input, { lookup: publicDns }), error => error instanceof DesktopBackendError && error.code === 'invalid_url');
  }
});

test('private and special-use IPv4/IPv6 destinations are blocked, including mixed DNS answers', async () => {
  for (const address of ['127.0.0.1', '10.2.3.4', '172.20.0.1', '192.168.1.1', '169.254.169.254', '100.64.1.1', '::1', 'fc00::1', 'fe80::1', '2001:db8::1']) {
    assert.equal(isNonPublicAddress(address), true, `${address} is not public`);
  }
  assert.equal(isNonPublicAddress('93.184.216.34'), false);
  assert.equal(isNonPublicAddress('2606:4700:4700::1111'), false);
  await assert.rejects(resolveDesktopBackend('https://aula.example.org', {
    lookup: async () => [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.9', family: 4 }]
  }), error => error instanceof DesktopBackendError && error.code === 'blocked_destination');
});

test('MetaLab identity requires the expected application, capability and protocol version', () => {
  assert.equal(isMetaLabDesktopIdentity({ application: 'metalab-pocket', capability: 'desktop-offline-sync', protocolVersion: 1 }), true);
  assert.equal(isMetaLabDesktopIdentity({ application: 'other', capability: 'desktop-offline-sync', protocolVersion: 1 }), false);
  assert.equal(isMetaLabDesktopIdentity({ application: 'metalab-pocket', capability: 'desktop-offline-sync', protocolVersion: 2 }), false);
});

test('TLS certificate failures are classified without weakening certificate validation', () => {
  assert.equal(isTlsCertificateErrorCode('ERR_TLS_CERT_ALTNAME_INVALID'), true);
  assert.equal(isTlsCertificateErrorCode('UNABLE_TO_VERIFY_LEAF_SIGNATURE'), true);
  assert.equal(isTlsCertificateErrorCode('ECONNRESET'), false);
});

test('pinned DNS lookup supports Node single-address and all-address callback contracts', async () => {
  const pinned = { address: '93.184.216.34', family: 4 };
  const lookup = createPinnedLookup(pinned);
  const single = await new Promise((resolve, reject) => lookup('aula.example.org', {}, (error, address, family) => {
    if (error) reject(error);
    else resolve({ address, family });
  }));
  const all = await new Promise((resolve, reject) => lookup('aula.example.org', { all: true }, (error, addresses) => {
    if (error) reject(error);
    else resolve(addresses);
  }));

  assert.deepEqual(single, pinned);
  assert.deepEqual(all, [pinned]);
});
