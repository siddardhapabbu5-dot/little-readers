export function OwlBadge() {
  return (
    <div className="lr-owl" aria-hidden="true">
      <svg viewBox="0 0 120 110" width="92" height="86">
        <path d="M35 28 L60 8 L85 28 Z" fill="#17345E" />
        <rect x="52" y="8" width="16" height="10" rx="2" fill="#FFD93D" />
        <ellipse cx="60" cy="62" rx="38" ry="34" fill="#D9B48F" />
        <circle cx="46" cy="58" r="14" fill="#fff" />
        <circle cx="74" cy="58" r="14" fill="#fff" />
        <circle cx="46" cy="58" r="6" fill="#17345E" />
        <circle cx="74" cy="58" r="6" fill="#17345E" />
        <path d="M54 70 L60 78 L66 70 Z" fill="#FF9B42" />
        <rect x="70" y="78" width="28" height="20" rx="3" fill="#1677E8" />
        <path d="M74 84 h20 M74 90 h14" stroke="#fff" strokeWidth="2" />
        <path
          d="M28 40 l8 12 M92 40 l-8 12"
          stroke="#8B5E3C"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>
      <span className="lr-owl-star">✦</span>
      <span className="lr-owl-star right">✦</span>
    </div>
  );
}
