import { inflateSync } from 'node:zlib';

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function pngCrc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Checks the encoded container and drops common EXIF/XMP/text metadata. */
export function sanitizeInstalabImage(mimeType: string, input: Buffer): Buffer | null {
  if (mimeType === 'image/jpeg') return sanitizeJpeg(input);
  if (mimeType === 'image/png') return sanitizePng(input);
  if (mimeType === 'image/webp') return sanitizeWebp(input);
  return null;
}

function sanitizeJpeg(input: Buffer): Buffer | null {
  if (input.length < 16 || input[0] !== 0xff || input[1] !== 0xd8 || input.at(-2) !== 0xff || input.at(-1) !== 0xd9) return null;
  const chunks: Buffer[] = [input.subarray(0, 2)];
  let offset = 2;
  let sawFrame = false;
  let sawScan = false;
  while (offset < input.length - 2) {
    if (input[offset] !== 0xff) return null;
    let markerOffset = offset;
    while (input[offset] === 0xff) offset++;
    const marker = input[offset++];
    if (marker === undefined || marker === 0x00) return null;
    if (marker === 0xda) { // Start of scan: compressed image data runs to EOI.
      if (!sawFrame || offset + 2 > input.length) return null;
      const length = input.readUInt16BE(offset);
      if (length < 2 || offset + length > input.length) return null;
      chunks.push(input.subarray(markerOffset, input.length - 2));
      sawScan = true;
      break;
    }
    if (marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      chunks.push(input.subarray(markerOffset, offset));
      continue;
    }
    if (offset + 2 > input.length) return null;
    const length = input.readUInt16BE(offset);
    if (length < 2 || offset + length > input.length) return null;
    const segmentEnd = offset + length;
    if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
      if (length < 8) return null;
      const height = input.readUInt16BE(offset + 3);
      const width = input.readUInt16BE(offset + 5);
      if (!width || !height || width * height > 40_000_000) return null;
      sawFrame = true;
    }
    if (![0xe1, 0xed, 0xec, 0xfe].includes(marker)) chunks.push(input.subarray(markerOffset, segmentEnd));
    offset = segmentEnd;
  }
  if (!sawScan) return null;
  chunks.push(input.subarray(input.length - 2));
  return Buffer.concat(chunks);
}

function sanitizePng(input: Buffer): Buffer | null {
  if (input.length < 45 || !input.subarray(0, 8).equals(pngSignature)) return null;
  const chunks: Buffer[] = [input.subarray(0, 8)];
  const removed = new Set(['eXIf','tEXt','zTXt','iTXt','tIME']);
  let offset = 8;
  let sawHeader = false;
  let sawData = false;
  let sawEnd = false;
  const imageData: Buffer[] = [];
  while (offset + 12 <= input.length) {
    const length = input.readUInt32BE(offset);
    const type = input.toString('ascii', offset + 4, offset + 8);
    const end = offset + 12 + length;
    if (end > input.length || (!sawHeader && (type !== 'IHDR' || length !== 13))) return null;
    if (pngCrc32(input.subarray(offset + 4, end - 4)) !== input.readUInt32BE(end - 4)) return null;
    if (type === 'IHDR') {
      if (sawHeader) return null;
      const width = input.readUInt32BE(offset + 8);
      const height = input.readUInt32BE(offset + 12);
      if (!width || !height || width * height > 40_000_000) return null;
      sawHeader = true;
    }
    if (type === 'IDAT') { sawData = true; imageData.push(input.subarray(offset + 8, end - 4)); }
    if (type === 'IEND') {
      if (length !== 0) return null;
      sawEnd = true;
      if (end !== input.length) return null;
    }
    if (!removed.has(type)) chunks.push(input.subarray(offset, end));
    offset = end;
    if (sawEnd) break;
  }
  if (!sawHeader || !sawData || !sawEnd) return null;
  try { if (inflateSync(Buffer.concat(imageData)).byteLength === 0) return null; } catch { return null; }
  return Buffer.concat(chunks);
}

function sanitizeWebp(input: Buffer): Buffer | null {
  if (input.length < 20 || input.toString('ascii', 0, 4) !== 'RIFF' || input.toString('ascii', 8, 12) !== 'WEBP') return null;
  const riffEnd = input.readUInt32LE(4) + 8;
  if (riffEnd !== input.length) return null;
  const chunks: Buffer[] = [];
  let offset = 12;
  let hasImageData = false;
  let dimensions: { width: number; height: number } | null = null;
  while (offset + 8 <= riffEnd) {
    const type = input.toString('ascii', offset, offset + 4);
    const length = input.readUInt32LE(offset + 4);
    const end = offset + 8 + length + (length % 2);
    if (end > riffEnd) return null;
    const data = offset + 8;
    if (type === 'VP8X' && length >= 10) {
      dimensions = { width: 1 + input[data + 4] + (input[data + 5] << 8) + (input[data + 6] << 16), height: 1 + input[data + 7] + (input[data + 8] << 8) + (input[data + 9] << 16) };
    } else if (type === 'VP8 ' && length >= 10 && input[data + 3] === 0x9d && input[data + 4] === 0x01 && input[data + 5] === 0x2a) {
      hasImageData = true;
      dimensions = { width: input.readUInt16LE(data + 6) & 0x3fff, height: input.readUInt16LE(data + 8) & 0x3fff };
    } else if (type === 'VP8L' && length >= 5 && input[data] === 0x2f) {
      hasImageData = true;
      dimensions = { width: 1 + input[data + 1] + ((input[data + 2] & 0x3f) << 8), height: 1 + ((input[data + 2] >> 6) | (input[data + 3] << 2) | ((input[data + 4] & 0x0f) << 10)) };
    }
    if (type !== 'EXIF' && type !== 'XMP ') chunks.push(input.subarray(offset, end));
    offset = end;
  }
  if (offset !== riffEnd || !hasImageData || !dimensions?.width || !dimensions.height || dimensions.width * dimensions.height > 40_000_000) return null;
  const body = Buffer.concat(chunks);
  const header = Buffer.from('RIFF');
  const size = Buffer.alloc(4);
  size.writeUInt32LE(body.length + 4, 0);
  return Buffer.concat([header, size, Buffer.from('WEBP'), body]);
}
