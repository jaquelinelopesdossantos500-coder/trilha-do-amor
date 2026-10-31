import type { KeyboardEvent, PointerEvent } from "react";
import { PREPARATION_IMAGES, PREPARATION_SLIDE_MS } from "../lib/preparation-media";
import { Icon } from "./brand";

type Props = {
  slide: number; elapsed: number; paused: boolean;
  onChoose: (index: number) => void; onTogglePause: () => void;
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: () => void; onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
};

export default function FamilyStoryMockup({ slide, elapsed, paused, onChoose, onTogglePause, ...gestures }: Props) {
  return <div className="stories-device-stage">
    <div className="stories-phone-stage">
      <div className="story-phone" role="region" aria-roledescription="carrossel" aria-label="Exemplos ilustrativos de homenagens em Stories">
        <div className="story-phone-screen">
          <div className="memory-carousel-window" {...gestures} tabIndex={0} aria-label="Deslize para ver os Stories ou use as setas do teclado">
            {PREPARATION_IMAGES.map((image, index) => <figure key={image.src} className={`memory-slide story-slide story-slide-${index + 1}${slide === index ? " is-active" : ""}`} aria-label={`Story ${index + 1} de 3`} aria-hidden={slide !== index}>
              <img src={image.src} alt={image.alt} width="720" height="1280" loading="eager" decoding="async" draggable={false}/>
              <figcaption><span className="story-caption-rule"/>{image.caption}</figcaption>
            </figure>)}
          </div>
          <div className="story-top-shade" aria-hidden="true"/>
          <div className="story-camera" aria-hidden="true"><i/></div>
          <div className="story-progress" aria-label="Escolher imagem">
            {PREPARATION_IMAGES.map((image, index) => <button key={image.src} type="button" onClick={() => onChoose(index)} aria-label={`Ver imagem ${index + 1} de 3`} aria-current={slide === index ? "true" : undefined}><span style={{ transform: `scaleX(${index < slide ? 1 : index > slide ? 0 : Math.min(1, Math.max(0, (elapsed - index * PREPARATION_SLIDE_MS) / PREPARATION_SLIDE_MS))})` }}/></button>)}
          </div>
          <div className="story-identity"><span className="story-avatar" aria-hidden="true"><Icon name="heart"/></span><span><strong>Memórias em Família</strong><small>Exemplo ilustrativo</small></span><button className="story-pause" type="button" aria-label={paused ? "Reproduzir Stories" : "Pausar Stories"} aria-pressed={paused} onClick={onTogglePause}>{paused ? <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7 4 9 6-9 6V4Z" fill="currentColor"/></svg> : <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 5v10M13 5v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>}</button></div>
          <div className="story-bottom" aria-hidden="true"><span className="story-signature">trilha do amor <i>♥</i></span><span><Icon name="heart"/><svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m21 3-7 18-4-7-7-4 18-7ZM10 14 21 3"/></svg></span></div>
          <div className="story-home" aria-hidden="true"/>
        </div>
      </div>
    </div>
    <p className="stories-sharing-caption">Uma homenagem para emocionar quem também<br className="stories-wide-break"/> guarda essa pessoa no coração.</p>
    <p className="memory-disclaimer">Exemplos ilustrativos de recriações com IA.</p>
  </div>;
}
