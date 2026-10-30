import { z } from 'zod';

const uuid = z.string().uuid();
const color = z.string().regex(/^#[0-9a-f]{6}$/iu);

const textElement = z.object({
  id: uuid,
  type: z.literal('text'),
  x: z.number().min(0).max(1280),
  y: z.number().min(0).max(720),
  width: z.number().positive().max(1280),
  height: z.number().positive().max(720),
  text: z.string().max(5000),
  color,
  fontSize: z.number().int().min(10).max(120),
  fontWeight: z.union([z.literal(400), z.literal(600), z.literal(700), z.literal(800)]),
  align: z.enum(['left', 'center', 'right'])
}).strict();

const shapeElement = z.object({
  id: uuid,
  type: z.literal('shape'),
  shape: z.enum(['rectangle', 'circle', 'line', 'arrow']),
  x: z.number().min(0).max(1280),
  y: z.number().min(0).max(720),
  width: z.number().positive().max(1280),
  height: z.number().positive().max(720),
  fill: color,
  stroke: color,
  strokeWidth: z.number().min(0).max(24)
}).strict();

const imageElement = z.object({
  id: uuid,
  type: z.literal('image'),
  assetId: uuid,
  x: z.number().min(0).max(1280),
  y: z.number().min(0).max(720),
  width: z.number().positive().max(1280),
  height: z.number().positive().max(720),
  fit: z.enum(['contain', 'cover'])
}).strict();

export const presentationElementSchema = z.discriminatedUnion('type', [textElement, shapeElement, imageElement]);

const slideSchema = z.object({
  id: uuid,
  title: z.string().trim().min(1).max(120),
  background: color,
  elements: z.array(presentationElementSchema).max(100)
}).strict();

export const presentationDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  dimensions: z.object({ width: z.literal(1280), height: z.literal(720) }).strict(),
  slides: z.array(slideSchema).min(1).max(100),
  themes: z.array(z.object({ id: uuid, name: z.string().trim().min(1).max(80), colors: z.array(color).max(12) }).strict()).max(20),
  assets: z.array(z.object({ id: uuid, mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']), sizeBytes: z.number().int().positive().max(10 * 1024 * 1024) }).strict()).max(50)
}).strict().superRefine((document, context) => {
  const assetIds = new Set(document.assets.map(asset => asset.id));
  document.slides.forEach((slide, slideIndex) => slide.elements.forEach((element, elementIndex) => {
    if (element.type === 'image' && !assetIds.has(element.assetId)) {
      context.addIssue({ code: 'custom', path: ['slides', slideIndex, 'elements', elementIndex, 'assetId'], message: 'Referência de imagem sem anexo correspondente.' });
    }
  }));
});

export type PresentationDocument = z.infer<typeof presentationDocumentSchema>;
export type PresentationElement = z.infer<typeof presentationElementSchema>;

export function createBlankPresentationDocument(): PresentationDocument {
  return {
    schemaVersion: 1,
    dimensions: { width: 1280, height: 720 },
    slides: [{
      id: crypto.randomUUID(),
      title: 'Capa',
      background: '#f7f4ee',
      elements: [{
        id: crypto.randomUUID(), type: 'text', x: 112, y: 265, width: 1056, height: 180,
        text: 'Sua próxima ideia começa aqui.', color: '#172743', fontSize: 64, fontWeight: 800, align: 'center'
      }]
    }],
    themes: [],
    assets: []
  };
}
