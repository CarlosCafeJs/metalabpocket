import assert from 'node:assert/strict';
import test from 'node:test';
import { createBlankPresentationDocument, presentationDocumentSchema } from '../src/domain/presentations.ts';
import { createCanvaLessonDocument } from '../src/domain/canva-lesson.ts';
import { detectPresentationImageMime } from '../src/domain/presentation-image.ts';

test('new presentation starts with a valid versioned 16:9 document and one slide', () => {
  const document = createBlankPresentationDocument();
  assert.equal(document.schemaVersion, 1);
  assert.deepEqual(document.dimensions, { width: 1280, height: 720 });
  assert.equal(document.slides.length, 1);
  assert.equal(presentationDocumentSchema.safeParse(document).success, true);
});

test('document schema rejects executable element fields and unsupported schema versions', () => {
  const document = createBlankPresentationDocument();
  const element = document.slides[0].elements[0];
  const unsafe = { ...document, slides: [{ ...document.slides[0], elements: [{ ...element, onClick: 'alert(1)' }] }] };
  assert.equal(presentationDocumentSchema.safeParse(unsafe).success, false);
  assert.equal(presentationDocumentSchema.safeParse({ ...document, schemaVersion: 2 }).success, false);
});

test('image elements can only reference declared image assets', () => {
  const document = createBlankPresentationDocument();
  const missingAsset = { ...document, slides: [{ ...document.slides[0], elements: [{ id: '824e061d-2a75-4aac-9914-82e6a584ab87', type: 'image', assetId: 'f7356b2a-a778-44ac-918a-eaa83144f85a', x: 0, y: 0, width: 640, height: 360, fit: 'contain' }] }] };
  assert.equal(presentationDocumentSchema.safeParse(missingAsset).success, false);
  const withAsset = { ...missingAsset, assets: [{ id: 'f7356b2a-a778-44ac-918a-eaa83144f85a', mimeType: 'image/png', sizeBytes: 512 }] };
  assert.equal(presentationDocumentSchema.safeParse(withAsset).success, true);
});

test('Canva beginner lesson is a valid editable 20-slide 16:9 document', () => {
  const document = createCanvaLessonDocument();
  assert.equal(document.slides.length, 20);
  assert.equal(presentationDocumentSchema.safeParse(document).success, true);
  assert.equal(document.slides[0].elements.some(element => element.type === 'text' && element.text.includes('Introdução ao design')), true);
  assert.equal(document.slides[17].elements.some(element => element.type === 'text' && element.text.includes('Faça 4 páginas')), true);
});

test('image upload checks signatures instead of trusting the filename MIME', () => {
  assert.equal(detectPresentationImageMime(Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])), 'image/png');
  assert.equal(detectPresentationImageMime(Uint8Array.from([255, 216, 255, 0])), 'image/jpeg');
  assert.equal(detectPresentationImageMime(Uint8Array.from([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80])), 'image/webp');
  assert.equal(detectPresentationImageMime(Uint8Array.from([60, 115, 118, 103, 62])), null);
  assert.equal(detectPresentationImageMime(Uint8Array.from([137, 80, 78])), null);
});
