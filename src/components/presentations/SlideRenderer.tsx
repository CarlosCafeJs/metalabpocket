import type { PresentationDocument } from '@/domain/presentations';

export function SlideRenderer({ slide }: { slide: PresentationDocument['slides'][number] }) {
  return (
    <div className="presentation-slide-canvas" style={{ backgroundColor: slide.background }}>
      {slide.elements.map((element, index) => {
        const placement: React.CSSProperties = {
          left: `${element.x / 12.8}%`, top: `${element.y / 7.2}%`,
          width: `${element.width / 12.8}%`, height: `${element.height / 7.2}%`, zIndex: index + 1
        };
        if (element.type === 'text') return <div key={element.id} className="presentation-canvas-text" style={{ ...placement, color: element.color, fontSize: `${element.fontSize / 12.8}cqw`, fontWeight: element.fontWeight, textAlign: element.align }}>{element.text}</div>;
        if (element.type === 'shape') return <div key={element.id} className={`presentation-canvas-shape is-${element.shape}`} style={{ ...placement, backgroundColor: element.shape === 'line' || element.shape === 'arrow' ? 'transparent' : element.fill, borderColor: element.stroke, borderWidth: `${element.strokeWidth / 12.8}cqw` }} aria-hidden="true" />;
        return <div key={element.id} className="presentation-canvas-image-placeholder" style={placement}>Imagem ainda não disponível neste documento</div>;
      })}
    </div>
  );
}
