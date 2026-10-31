"use client";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { Icon } from "./brand";
import FamilyStoryMockup from "./family-story-mockup";
import { PREPARATION_DURATION_MS, PREPARATION_FADE_MS, PREPARATION_IMAGES, PREPARATION_SLIDE_MS, preloadPreparationImages } from "../lib/preparation-media";

type Props = {
  startedAt: number;
  onPrepare: (startedAt: number) => Promise<void>;
  onFinalize: () => Promise<void>;
  onContinue: () => void;
  onBack?: () => void;
};

export default function ReunionPreparation({ startedAt, onPrepare, onFinalize, onContinue, onBack }: Props) {
  const [run, setRun] = useState({ id: 0, startedAt });
  const [elapsed, setElapsed] = useState(() => Math.min(PREPARATION_DURATION_MS, Math.max(0, Date.now() - startedAt)));
  const [slide, setSlide] = useState(0), [ready, setReady] = useState(false), [error, setError] = useState("");
  const [leaving, setLeaving] = useState(false), [reducedMotion, setReducedMotion] = useState(false);
  const [paused, setPaused] = useState(false);
  const pausedAt = useRef<number | null>(null), pausedDuration = useRef(0);
  const actions = useRef({ onPrepare, onFinalize, onContinue });
  actions.current = { onPrepare, onFinalize, onContinue };
  const manual = useRef(false), finishing = useRef(false), mounted = useRef(false);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointer = useRef<{ id: number; x: number; y: number } | null>(null);
  const title = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    mounted.current = true; title.current?.focus({ preventScroll: true });
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update(); media.addEventListener("change", update);
    return () => { mounted.current = false; media.removeEventListener("change", update); if (fadeTimer.current) clearTimeout(fadeTimer.current); };
  }, []);

  useEffect(() => {
    let active = true;
    setReady(false); setError("");
    Promise.all([
      Promise.resolve().then(() => actions.current.onPrepare(run.startedAt)),
      preloadPreparationImages(),
    ]).then(() => { if (active) setReady(true); }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : "Não foi possível salvar suas fotos. Tente novamente.");
    });
    return () => { active = false; };
  }, [run]);

  useEffect(() => {
    const tick = () => setElapsed(Math.min(PREPARATION_DURATION_MS, Math.max(0, (pausedAt.current ?? Date.now()) - run.startedAt - pausedDuration.current)));
    tick(); const timer = setInterval(tick, 100);
    return () => clearInterval(timer);
  }, [run]);

  useEffect(() => {
    if (!manual.current && !reducedMotion) setSlide(Math.min(2, Math.floor(elapsed / PREPARATION_SLIDE_MS)));
  }, [elapsed, reducedMotion]);

  const finish = useCallback(async () => {
    if (!ready || error || finishing.current) return;
    finishing.current = true;
    try {
      await actions.current.onFinalize();
      if (!mounted.current) return;
      setLeaving(true);
      fadeTimer.current = setTimeout(() => {
        if (mounted.current) actions.current.onContinue();
      }, reducedMotion ? 0 : PREPARATION_FADE_MS);
    } catch (cause) {
      if (!mounted.current) return;
      finishing.current = false;
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar a próxima etapa. Tente novamente.");
    }
  }, [ready, error, reducedMotion]);

  useEffect(() => {
    if (elapsed >= PREPARATION_DURATION_MS && ready && !error && !paused) void finish();
  }, [elapsed, ready, error, paused, finish]);

  function togglePause() {
    if (pausedAt.current === null) { pausedAt.current = Date.now(); setPaused(true); }
    else { pausedDuration.current += Date.now() - pausedAt.current; pausedAt.current = null; setPaused(false); }
  }

  function choose(index: number) {
    manual.current = true;
    setSlide(Math.max(0, Math.min(PREPARATION_IMAGES.length - 1, index)));
  }
  function pointerUp(event: PointerEvent<HTMLDivElement>) {
    const start = pointer.current; pointer.current = null;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (Math.abs(dx) >= 32 && Math.abs(dx) > Math.abs(dy)) choose(slide + (dx < 0 ? 1 : -1));
  }
  function retry() {
    manual.current = false; finishing.current = false;
    pausedAt.current = null; pausedDuration.current = 0; setPaused(false);
    setSlide(0); setElapsed(0); setReady(false); setError(""); setLeaving(false);
    setRun(previous => ({ id: previous.id + 1, startedAt: Date.now() }));
  }
  const progress = Math.min(1, elapsed / PREPARATION_DURATION_MS);
  const progressStyle = { transform: `scaleX(${progress})` } as CSSProperties;

  return <section className={`reunion-preparation family-stories-experience${leaving ? " is-leaving" : ""}${paused ? " is-paused" : ""}`} aria-labelledby="reunion-preparation-title" aria-busy={!ready && !error}>
    <div className="stories-atmosphere" aria-hidden="true">{[0,1,2,3,4,5,6,7].map(i=><i key={i}/>)}</div>
    <div className="reunion-preparation-intro">
      <span className="stories-eyebrow">O AMOR TAMBÉM SE COMPARTILHA</span>
      <h1 id="reunion-preparation-title" ref={title} tabIndex={-1}>Imagine compartilhar<br/>uma <span>lembrança</span> assim...</h1>
      <p>Uma lembrança sua. Uma história que muitos vão reconhecer.</p>
    </div>
    <FamilyStoryMockup slide={slide} elapsed={elapsed} paused={paused} onTogglePause={togglePause} onChoose={choose}
        onPointerDown={event => { manual.current = true; pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture?.(event.pointerId); }}
        onPointerUp={pointerUp} onPointerCancel={() => { pointer.current = null; }}
        onKeyDown={event => { if (event.key === "ArrowRight") { event.preventDefault(); choose(slide + 1); } if (event.key === "ArrowLeft") { event.preventDefault(); choose(slide - 1); } }}
    />
    <div className="reunion-preparation-bottom">
      <p className="transition-progress-title">Preparando sua experiência com carinho <span>💛</span></p>
      <div className="transition-progress" role="progressbar" aria-label="Transição para a próxima etapa" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(progress * 100)} aria-describedby="transition-progress-description">
        <span key={run.id} style={progressStyle}/>
      </div>
      <p className="sr-only" id="transition-progress-description">Esta barra representa a transição da interface, não a geração do vídeo. O avanço aguarda o salvamento das fotos.</p>
      {error ? <div className="transition-error" role="alert"><p>{error}</p><button type="button" className="text-link" onClick={retry}>Tentar novamente <Icon name="refresh"/></button>{onBack&&<button type="button" className="text-link" onClick={onBack}>Revisar fotos</button>}</div> : <p className="transition-save-status" role="status">{ready ? "Suas fotos estão salvas para continuar." : "Salvando suas fotos com cuidado…"}</p>}
      <button type="button" className="transition-continue" disabled={!ready || !!error || leaving} onClick={() => { void finish(); }}>Continuar <Icon name="arrow"/></button>
    </div>
  </section>;
}
