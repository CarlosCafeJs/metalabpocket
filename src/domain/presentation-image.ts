export type PresentationImageMime = 'image/jpeg' | 'image/png' | 'image/webp';

export function detectPresentationImageMime(data: Uint8Array): PresentationImageMime | null {
  if (data.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => data[index] === byte)) return 'image/png';
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (data.length >= 12 && String.fromCharCode(...data.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...data.subarray(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}
