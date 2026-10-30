import type { PresentationDocument } from '@/domain/presentations';

export function SlideRenderer({ slide, presentationId }: { slide: PresentationDocument['slides'][number]; presentationId?: string }) {
  return (
    <div className="presentation-slide-canvas" style={{ backgroundColor: slide.background }}>
      {slide.elements.map((element, index) => {
        const placement: React.CSSProperties = {
          left: `${element.x / 12.8}%`, top: `${element.y / 7.2}%`,
          width: `${element.width / 12.8}%`, height: `${element.height / 7.2}%`, zIndex: index + 1
        };
        if (element.type === 'text') return <div key={element.id} className="presentation-canvas-text" style={{ ...placement, color: element.color, fontSize: `${element.fontSize / 12.8}cqw`, fontWeight: element.fontWeight, textAlign: element.align }}>{element.text}</div>;
        if (element.type === 'shape') return <div key={element.id} className={`presentation-canvas-shape is-${element.shape}`} style={{ ...placement, backgroundColor: element.shape === 'line' || element.shape === 'arrow' ? 'transparent' : element.fill, borderColor: element.stroke, borderWidth: `${element.strokeWidth / 12.8}cqw` }} aria-hidden="true" />;
        return presentationId
          ? <img key={element.id} className="presentation-canvas-image" src={`/api/presentations/${presentationId}/assets/${element.assetId}`} alt="Imagem da apresentação" style={{ ...placement, objectFit: element.fit }} />
          : <div key={element.id} className="presentation-canvas-image-placeholder" style={placement}>Imagem</div>;
      })}
    </div>
  );
}
