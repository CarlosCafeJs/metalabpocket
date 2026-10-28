import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { sanitizeInstalabImage } from '../src/server/instalab-image.ts';

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4, 'ascii');
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, chunk.length - 4)), chunk.length - 4);
  return chunk;
}
function onePixelPng() {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4);
  header[8] = 8; header[9] = 6;
  return Buffer.concat([signature, pngChunk('IHDR', header), pngChunk('tEXt', Buffer.from('Comment\0private metadata')), pngChunk('IDAT', deflateSync(Buffer.from([0, 255, 0, 0, 255]))), pngChunk('IEND', Buffer.alloc(0))]);
}

test('profile PNGs retain image pixels and remove textual metadata', () => {
  const original = onePixelPng();
  const clean = sanitizeInstalabImage('image/png', original);
  assert.ok(clean);
  assert.equal(clean.toString('ascii').includes('private metadata'), false);
  assert.equal(clean.toString('ascii').includes('tEXt'), false);
  assert.equal(clean.toString('ascii').includes('IDAT'), true);
});

test('profile image validation rejects spoofed MIME types and corrupt PNG chunks', () => {
  const corrupt = onePixelPng();
  corrupt[corrupt.indexOf(Buffer.from('IHDR')) + 12] ^= 0xff;
  assert.equal(sanitizeInstalabImage('image/png', corrupt), null);
  assert.equal(sanitizeInstalabImage('image/jpeg', onePixelPng()), null);
});
