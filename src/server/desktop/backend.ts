import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { isIP } from 'node:net';
import { request as httpsRequest } from 'node:https';

type ResolvedAddress = { address: string; family: number };

export type DesktopBackendErrorCode =
  | 'invalid_url'
  | 'blocked_destination'
  | 'dns_failure'
  | 'network_unavailable'
  | 'timeout'
  | 'server_unavailable'
  | 'tls_certificate'
  | 'authentication'
  | 'not_found'
  | 'remote_unauthorized'
  | 'remote_forbidden'
  | 'remote_server_error'
  | 'incompatible';

export class DesktopBackendError extends Error {
  readonly code: DesktopBackendErrorCode;

  constructor(code: DesktopBackendErrorCode) {
    super(code);
    this.name = 'DesktopBackendError';
    this.code = code;
  }
}

export type DesktopBackendTarget = {
  origin: string;
  hostname: string;
  protocol: 'https:' | 'http:';
  port?: string;
  address: ResolvedAddress;
};

type PinnedLookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | ResolvedAddress[],
  family?: number
) => void;

type ResolveOptions = {
  allowTestLocal?: boolean;
  lookup?: (hostname: string) => Promise<ResolvedAddress[]>;
};

function parseIpv4(address: string): number[] | null {
  if (isIP(address) !== 4) return null;
  return address.split('.').map(Number);
}

function ipv4IsNonPublic(address: string): boolean {
  const octets = parseIpv4(address);
  if (!octets) return true;
  const [a, b, c] = octets;
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && ((b === 0 && c === 0) || (b === 0 && c === 2) || b === 168 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113) ||
    (a === 255 && b === 255 && c === 255);
}

function ipv6ToBigInt(address: string): bigint | null {
  if (isIP(address) !== 6) return null;
  let normalized = address.toLowerCase().split('%', 1)[0];
  const embeddedIpv4 = normalized.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/u)?.[1];
  if (embeddedIpv4) {
    const octets = parseIpv4(embeddedIpv4);
    if (!octets) return null;
    const high = ((octets[0] << 8) | octets[1]).toString(16);
    const low = ((octets[2] << 8) | octets[3]).toString(16);
    normalized = normalized.replace(embeddedIpv4, `${high}:${low}`);
  }
  const [leftText, rightText = ''] = normalized.split('::');
  const left = leftText ? leftText.split(':') : [];
  const right = rightText ? rightText.split(':') : [];
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (!normalized.includes('::') && missing !== 0)) return null;
  const groups = [...left, ...Array(missing).fill('0'), ...right];
  if (groups.length !== 8 || groups.some(group => !/^[0-9a-f]{1,4}$/u.test(group))) return null;
  return groups.reduce((value, group) => (value << 16n) | BigInt(`0x${group}`), 0n);
}

function ipv6MatchesPrefix(value: bigint, network: bigint, bits: number): boolean {
  const shift = BigInt(128 - bits);
  return (value >> shift) === (network >> shift);
}

function ipv6IsNonPublic(address: string): boolean {
  const value = ipv6ToBigInt(address);
  if (value === null) return true;
  const prefix = (hex: string) => BigInt(`0x${hex}`) << BigInt(128 - hex.length * 4);
  // Accept globally routable unicast only; exclude special-use allocations within 2000::/3.
  if (!ipv6MatchesPrefix(value, prefix('2000'), 3)) return true;
  return ipv6MatchesPrefix(value, prefix('20010db8'), 32) || // documentation
    ipv6MatchesPrefix(value, prefix('20010000'), 23) || // IETF protocol assignments
    ipv6MatchesPrefix(value, prefix('2002'), 16) || // 6to4 transition addresses
    ipv6MatchesPrefix(value, prefix('3fff'), 20); // documentation
}

export function isNonPublicAddress(address: string): boolean {
  const family = isIP(address);
  return family === 4 ? ipv4IsNonPublic(address) : family === 6 ? ipv6IsNonPublic(address) : true;
}

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/gu, '');
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

function normalizeUrl(raw: string, allowTestLocal: boolean): URL {
  let url: URL;
  try {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.length > 300) throw new Error('invalid');
    url = new URL(trimmed);
  } catch {
    throw new DesktopBackendError('invalid_url');
  }
  if (url.username || url.password || url.search || url.hash || url.hostname.endsWith('.')) {
    throw new DesktopBackendError('invalid_url');
  }
  const path = url.pathname;
  if (path !== '/' && path !== '/dashboard' && path !== '/dashboard/') throw new DesktopBackendError('invalid_url');
  if (url.protocol === 'http:' && allowTestLocal && isLoopbackHost(url.hostname)) return url;
  if (url.protocol !== 'https:' || (url.port && url.port !== '443') || isIP(url.hostname) !== 0 || isLoopbackHost(url.hostname)) {
    throw new DesktopBackendError('invalid_url');
  }
  url.pathname = '/';
  return url;
}

export async function resolveDesktopBackend(raw: string, options: ResolveOptions = {}): Promise<DesktopBackendTarget> {
  const url = normalizeUrl(raw, options.allowTestLocal === true);
  const localTest = options.allowTestLocal === true && url.protocol === 'http:' && isLoopbackHost(url.hostname);
  let addresses: ResolvedAddress[];
  if (localTest) {
    const localHost = url.hostname.toLowerCase().replace(/^\[|\]$/gu, '');
    addresses = [{ address: localHost === 'localhost' ? '127.0.0.1' : localHost, family: localHost === '::1' ? 6 : 4 }];
  } else {
    try {
      const resolve = options.lookup || (async hostname => await dnsLookup(hostname, { all: true, verbatim: true }));
      addresses = await resolve(url.hostname);
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      throw new DesktopBackendError(code === 'EAI_AGAIN' || code === 'ENOTFOUND' ? 'dns_failure' : 'server_unavailable');
    }
    if (!addresses.length) throw new DesktopBackendError('server_unavailable');
    if (addresses.some(({ address }) => isNonPublicAddress(address))) throw new DesktopBackendError('blocked_destination');
  }
  return {
    origin: url.origin,
    hostname: url.hostname,
    protocol: url.protocol as 'https:' | 'http:',
    port: url.port || undefined,
    address: addresses[0]
  };
}

export function isMetaLabDesktopIdentity(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const identity = value as Record<string, unknown>;
  return identity.application === 'metalab-pocket' &&
    identity.capability === 'desktop-offline-sync' &&
    identity.protocolVersion === 1;
}

export function isTlsCertificateErrorCode(code: string): boolean {
  return /^(?:CERT_|ERR_TLS_|UNABLE_TO_VERIFY|DEPTH_ZERO|SELF_SIGNED|ERR_OSSL_)/u.test(code);
}

export function createPinnedLookup(address: ResolvedAddress) {
  return (_hostname: string, options: { all?: boolean }, callback: PinnedLookupCallback) => {
    const pinnedAddress = { address: address.address, family: address.family };
    // Node's auto-family selection asks custom lookup functions for all results.
    // Returning the single-address shape in that mode raises ERR_INVALID_IP_ADDRESS.
    if (options?.all) callback(null, [pinnedAddress]);
    else callback(null, pinnedAddress.address, pinnedAddress.family);
  };
}

export async function verifyMetaLabDesktopBackend(target: DesktopBackendTarget, headers: Record<string, string> = {}): Promise<void> {
  const response = await requestDesktopBackend(target, '/api/desktop/identity', { headers: { Accept: 'application/json', ...headers }, timeoutMs: 10_000 });
  if (response.status === 404) throw new DesktopBackendError('not_found');
  if (response.status === 401) throw new DesktopBackendError('remote_unauthorized');
  if (response.status === 403) throw new DesktopBackendError('remote_forbidden');
  if (response.status >= 500) throw new DesktopBackendError('remote_server_error');
  let identity: unknown = null;
  try { identity = JSON.parse(response.text) as unknown; } catch { /* incompatible server response */ }
  if (response.status !== 200 || !isMetaLabDesktopIdentity(identity)) throw new DesktopBackendError('incompatible');
}

export type DesktopBackendResponse = { status: number; headers: import('node:http').IncomingHttpHeaders; text: string };

export async function requestDesktopBackend(
  target: DesktopBackendTarget,
  apiPath: string,
  options: { method?: 'GET' | 'POST'; headers?: Record<string, string>; body?: string; timeoutMs?: number } = {}
): Promise<DesktopBackendResponse> {
  if (!apiPath.startsWith('/api/') || apiPath.startsWith('//')) throw new DesktopBackendError('invalid_url');
  const url = new URL(apiPath, target.origin);
  if (url.origin !== target.origin) throw new DesktopBackendError('invalid_url');
  const request = target.protocol === 'https:' ? httpsRequest : httpRequest;
  const pinnedLookup = createPinnedLookup(target.address);
  return await new Promise((resolve, reject) => {
    const outgoing = request(url, {
      method: options.method || 'GET',
      headers: options.headers,
      lookup: pinnedLookup,
      servername: target.protocol === 'https:' ? target.hostname : undefined,
      rejectUnauthorized: true,
      timeout: options.timeoutMs || 15_000
    }, response => {
      const chunks: Buffer[] = [];
      let length = 0;
      response.on('data', (chunk: Buffer | string) => {
        const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        length += data.length;
        if (length > 1_000_000) {
          outgoing.destroy(Object.assign(new Error('BACKEND_RESPONSE_TOO_LARGE'), { code: 'BACKEND_RESPONSE_TOO_LARGE' }));
          return;
        }
        chunks.push(data);
      });
      response.on('end', () => resolve({ status: response.statusCode || 0, headers: response.headers, text: Buffer.concat(chunks).toString('utf8') }));
    });
    outgoing.on('timeout', () => outgoing.destroy(Object.assign(new Error('BACKEND_TIMEOUT'), { code: 'ETIMEDOUT' })));
    outgoing.on('error', error => {
      const code = 'code' in error ? String(error.code) : '';
      if (isTlsCertificateErrorCode(code)) reject(new DesktopBackendError('tls_certificate'));
      else if (code === 'ETIMEDOUT' || code === 'BACKEND_TIMEOUT' || code === 'ERR_SOCKET_CONNECTION_TIMEOUT') reject(new DesktopBackendError('timeout'));
      else if (code === 'ENETDOWN' || code === 'ENETUNREACH' || code === 'EHOSTUNREACH') reject(new DesktopBackendError('network_unavailable'));
      else if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') reject(new DesktopBackendError('dns_failure'));
      else if (code === 'BACKEND_RESPONSE_TOO_LARGE') reject(new DesktopBackendError('incompatible'));
      else reject(new DesktopBackendError('server_unavailable'));
    });
    if (options.body) outgoing.write(options.body);
    outgoing.end();
  });
}
