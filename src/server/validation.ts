import { z } from 'zod';

const isoBirthDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return year >= 1900 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day && date <= new Date();
}, 'Data inválida');

const cleanText = (max: number, min = 2) => z.string().trim().min(min).max(max).transform(value => value.normalize('NFKC').replace(/[\u0000-\u001F\u007F]/g, '').replace(/\s+/g, ' '));

export const studentSchema = z.object({
  name: cleanText(120),
  email: z.email().max(254).transform(value => value.trim().toLowerCase()),
  birthDate: isoBirthDate,
  photoSharingConsent: z.boolean().optional().default(true),
  website: z.string().max(0).optional().default('')
}).strict();

export const photoConsentSchema = z.object({ photoSharingConsent: z.boolean() }).strict();

export const businessSchema = z.object({
  name: cleanText(100),
  segment: cleanText(80),
  description: cleanText(500, 15),
  mainOffering: cleanText(160),
  targetAudience: cleanText(240, 10),
  differentiator: cleanText(240, 10),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/)
}).strict();

export const missionAnswerSchema = z.object({
  answer: z.union([z.string().max(2000), z.array(z.string().max(160)).max(12), z.number().int().nonnegative()]),
  evidence: z.record(z.string(), z.union([z.string().max(300), z.number(), z.boolean()])).optional().default({})
}).strict();

export async function readJson(request: Request, limit = 8192) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new Response(JSON.stringify({ error: 'Envie os dados em JSON.' }), { status: 415, headers: { 'Content-Type': 'application/json' } });
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > limit) throw new Response(JSON.stringify({ error: 'Dados acima do limite permitido.' }), { status: 413, headers: { 'Content-Type': 'application/json' } });
  try { return JSON.parse(raw); } catch { throw new Response(JSON.stringify({ error: 'JSON inválido.' }), { status: 400, headers: { 'Content-Type': 'application/json' } }); }
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;

  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    return false;
  }
  if (parsedOrigin.username || parsedOrigin.password || parsedOrigin.pathname !== '/' || parsedOrigin.search || parsedOrigin.hash) {
    return false;
  }

  // Behind Railway (and other reverse proxies), request.url can contain the
  // container's internal HTTP address while the browser sends the public HTTPS
  // origin. Prefer the proxy's forwarded public host/protocol when available.
  const firstHeaderValue = (name: string) =>
    request.headers.get(name)?.split(',')[0]?.trim();
  const forwardedHost = firstHeaderValue('x-forwarded-host');
  const host = forwardedHost || request.headers.get('host')?.trim();
  const forwardedProtocol = firstHeaderValue('x-forwarded-proto');

  if (host) {
    const expectedProtocol = forwardedProtocol || new URL(request.url).protocol.replace(/:$/, '');
    if (expectedProtocol !== 'http' && expectedProtocol !== 'https') return false;
    try {
      const expected = new URL(`${expectedProtocol}://${host}`);
      return parsedOrigin.origin === expected.origin;
    } catch {
      return false;
    }
  }

  return parsedOrigin.origin === new URL(request.url).origin;
}
