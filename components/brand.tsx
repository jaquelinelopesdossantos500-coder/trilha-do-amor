export function Brand({ small = false }: { small?: boolean }) {
  return <a className={`brand ${small ? "brand-small" : ""}`} href="/" aria-label="Trilha do Amor, início">
    <svg viewBox="0 0 40 42" fill="none" aria-hidden="true"><path d="M20 30S5 21.5 5 12.7C5 5.6 14.1 3.3 20 10c5.9-6.7 15-4.4 15 2.7C35 21.5 20 30 20 30Z" stroke="currentColor" strokeWidth="1.7"/><path d="M20 18c-8 5-7 12-1 14 8 3 8 5 0 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><circle cx="20" cy="17" r="1.8" fill="currentColor"/></svg>
    <span>trilha <span className="brand-light">do</span> amor</span>
  </a>;
}
export function Icon({ name, className = "" }: { name: string; className?: string }) {
  const paths: Record<string,React.ReactNode> = {
    arrow: <><path d="M4 12h15M13 5l7 7-7 7"/></>,
    back: <><path d="M20 12H5m6-7-7 7 7 7"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    plus: <path d="M12 5v14M5 12h14"/>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3"/></>,
    play: <path d="m9 5 10 7-10 7V5Z"/>,
    photo: <><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="9" cy="9" r="2"/><path d="m3 17 5-5 4 4 4-5 5 6"/></>,
    film: <><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 3v18M17 3v18M3 8h4m-4 8h4m10-8h4m-4 8h4"/></>,
    spark: <><path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z"/></>,
    phone: <><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 18h4"/></>,
    whatsapp: <><path d="M20.5 11.5a8.5 8.5 0 0 1-12.6 7.4L3 20l1.1-4.9a8.5 8.5 0 1 1 16.4-3.6Z"/><path d="m8.3 7.4-1 1.2c-.6 2.8 3.3 6.7 6.1 6.1l1.2-1-2-1.3-.8.7a6.7 6.7 0 0 1-2.2-2.2l.7-.8-1.3-2.7Z"/></>,
    heart: <path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z"/>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 6a8 8 0 0 1 14 6M4 12a8 8 0 0 0 14 6"/></>,
    close: <path d="m6 6 12 12M6 18 18 6"/>,
  };
  return <svg className={`icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.heart}</svg>;
}
