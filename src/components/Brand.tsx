interface BrandProps {
  compact?: boolean;
  inverted?: boolean;
}

export function Brand({ compact = false, inverted = false }: BrandProps) {
  return (
    <div className={`brand-lockup${compact ? ' brand-lockup-compact' : ''}${inverted ? ' brand-lockup-inverted' : ''}`}>
      <span className="brand-symbol" aria-hidden="true">
        <svg viewBox="0 0 32 32" fill="none">
          <rect x="4.5" y="5" width="23" height="22" rx="6" />
          <path d="M5 12h22M12 12v14M20 12v14M9 18h3m5 0h3m-8 5h3m5 0h3" />
        </svg>
      </span>
      {!compact && <span className="brand-name">SmartStock WMS</span>}
    </div>
  );
}
