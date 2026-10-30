import assert from 'node:assert/strict';
import test from 'node:test';
import { createBlankPresentationDocument, presentationDocumentSchema } from '../src/domain/presentations.ts';

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
