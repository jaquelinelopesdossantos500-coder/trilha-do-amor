"use client";
import { useId } from "react";

export function GoldenLock() {
  const gold = useId();
  return <span className="golden-lock" aria-hidden="true"><svg viewBox="0 0 64 72" fill="none">
    <defs><linearGradient id={gold} x1="10" y1="12" x2="56" y2="66" gradientUnits="userSpaceOnUse"><stop stopColor="#FFF1C8"/><stop offset=".36" stopColor="#F5C45E"/><stop offset=".72" stopColor="#B77F2D"/><stop offset="1" stopColor="#F7E5B5"/></linearGradient></defs>
    <path d="M18 30V20a14 14 0 0 1 28 0v10" stroke={`url(#${gold})`} strokeWidth="4.5" strokeLinecap="round"/>
    <rect x="10" y="29" width="44" height="36" rx="10" fill={`url(#${gold})`}/>
    <path d="M32 43v9" stroke="#614319" strokeWidth="3" strokeLinecap="round"/><circle cx="32" cy="43" r="3" fill="#614319"/>
    <path d="M16 35h24" stroke="#FFF6DF" strokeOpacity=".65" strokeWidth="1.5" strokeLinecap="round"/>
  </svg></span>;
}

export default function LockedMemorialPreview({ scenario, name }: { scenario: string; name: string }) {
  return <section className="locked-memorial-preview" aria-label={`Prévia ilustrativa bloqueada: ${name}`}>
    <img className="locked-preview-image" src={`/media/${scenario}.webp`} alt={`Referência ilustrativa do cenário ${name}`} width="432" height="768" decoding="async"/>
    <div className="locked-preview-depth" aria-hidden="true"/>
    <div className="locked-preview-light" aria-hidden="true"/>
    <div className="locked-preview-content">
      <GoldenLock/>
      <span className="locked-preview-kicker">{name}</span>
      <span className="locked-preview-badge">Prévia ilustrativa do cenário escolhido</span>
    </div>
  </section>;
}
