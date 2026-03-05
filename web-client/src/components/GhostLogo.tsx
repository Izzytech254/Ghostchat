/**
 * GhostLogo – Ethereal floating ghost SVG logo
 * Spectral, translucent, misty aesthetic
 */

interface Props {
  size?: number;
  className?: string;
  animated?: boolean;
}

export default function GhostLogo({
  size = 120,
  className = "",
  animated = true,
}: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{
        filter: "drop-shadow(0 0 18px rgba(196, 181, 253, 0.45))",
        display: "block",
      }}
    >
      <defs>
        {/* Outer ethereal aura */}
        <radialGradient id="aura" cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor="rgba(196,181,253,0.12)" />
          <stop offset="100%" stopColor="rgba(196,181,253,0)" />
        </radialGradient>

        {/* Ghost body fill – translucent misty */}
        <linearGradient id="bodyFill" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="rgba(220,215,255,0.18)" />
          <stop offset="60%" stopColor="rgba(180,165,240,0.10)" />
          <stop offset="100%" stopColor="rgba(140,125,210,0.05)" />
        </linearGradient>

        {/* Eye glow */}
        <radialGradient id="eyeGlow" cx="50%" cy="40%" r="55%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.95)" />
          <stop offset="60%" stopColor="rgba(220,210,255,0.7)" />
          <stop offset="100%" stopColor="rgba(196,181,253,0)" />
        </radialGradient>

        {/* Wisp gradient */}
        <radialGradient id="wispGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(210,200,255,0.45)" />
          <stop offset="100%" stopColor="rgba(196,181,253,0)" />
        </radialGradient>

        {/* Spectral glow filter */}
        <filter id="spectralGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Eye bloom filter */}
        <filter id="eyeBloom" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {animated && (
          <style>{`
            @keyframes ghostFloat {
              0%, 100% { transform: translateY(0px); }
              50%       { transform: translateY(-7px); }
            }
            @keyframes ghostBreath {
              0%, 100% { opacity: 0.82; }
              50%       { opacity: 1; }
            }
            @keyframes eyeShimmer {
              0%, 100% { opacity: 0.85; }
              40%       { opacity: 1; }
              60%       { opacity: 0.55; }
              70%       { opacity: 1; }
            }
            @keyframes wispDrift {
              0%, 100% { opacity: 0.3; transform: translateY(0) scale(1); }
              50%       { opacity: 0.65; transform: translateY(-5px) scale(1.06); }
            }
            .gc-ghost-body  { animation: ghostFloat 4s ease-in-out infinite, ghostBreath 4s ease-in-out infinite; }
            .gc-ghost-eye   { animation: eyeShimmer 3.5s ease-in-out infinite; }
            .gc-eye-r       { animation-delay: 0.4s; }
            .gc-wisp-l      { animation: wispDrift 5s ease-in-out infinite; }
            .gc-wisp-r      { animation: wispDrift 5s ease-in-out infinite 1.2s; }
            .gc-wisp-t      { animation: wispDrift 6s ease-in-out infinite 2.4s; }
          `}</style>
        )}
      </defs>

      {/* Ambient ethereal aura */}
      <ellipse cx="60" cy="68" rx="40" ry="32" fill="url(#aura)" />

      {/* ── Ghost body ── */}
      <g className="gc-ghost-body" filter="url(#spectralGlow)">
        {/* Outer body – dome top with wavy bottom */}
        <path
          d="
            M 30 65
            C 30 40 42 22 60 22
            C 78 22 90 40 90 65
            L 90 90
            C 86 87 82 94 78 88
            C 74 82 70 89 66 84
            C 62 79 58 84 54 88
            C 50 92 46 85 42 88
            C 38 91 34 86 30 90
            Z
          "
          fill="url(#bodyFill)"
          stroke="rgba(210,200,255,0.45)"
          strokeWidth="1.2"
        />

        {/* Inner sheen highlight */}
        <path
          d="
            M 40 60 C 40 44 48 31 60 28 C 72 31 80 44 80 60
            L 80 72 C 77 70 74 74 71 70 C 68 66 65 71 62 68
            C 59 65 56 70 53 68 C 50 66 46 70 43 68 Z
          "
          fill="rgba(230,225,255,0.06)"
          stroke="none"
        />

        {/* ── Left eye ── */}
        <g className="gc-ghost-eye" filter="url(#eyeBloom)">
          <ellipse cx="47" cy="57" rx="7" ry="8.5" fill="rgba(12,10,28,0.88)" />
          <ellipse
            cx="47"
            cy="55.5"
            rx="5"
            ry="6"
            fill="url(#eyeGlow)"
            opacity="0.9"
          />
          <ellipse
            cx="48.5"
            cy="53.5"
            rx="1.8"
            ry="2.2"
            fill="rgba(255,255,255,0.95)"
          />
        </g>

        {/* ── Right eye ── */}
        <g className="gc-ghost-eye gc-eye-r" filter="url(#eyeBloom)">
          <ellipse cx="73" cy="57" rx="7" ry="8.5" fill="rgba(12,10,28,0.88)" />
          <ellipse
            cx="73"
            cy="55.5"
            rx="5"
            ry="6"
            fill="url(#eyeGlow)"
            opacity="0.9"
          />
          <ellipse
            cx="74.5"
            cy="53.5"
            rx="1.8"
            ry="2.2"
            fill="rgba(255,255,255,0.95)"
          />
        </g>

        {/* Subtle mouth */}
        <path
          d="M 52 70 Q 60 73.5 68 70"
          stroke="rgba(196,181,253,0.3)"
          strokeWidth="1"
          fill="none"
          strokeLinecap="round"
        />
      </g>

      {/* ── Floating wisps ── */}
      <g className="gc-wisp-l">
        <ellipse cx="20" cy="56" rx="5.5" ry="3" fill="url(#wispGrad)" />
        <ellipse
          cx="13"
          cy="63"
          rx="3.5"
          ry="2"
          fill="url(#wispGrad)"
          opacity="0.6"
        />
      </g>

      <g className="gc-wisp-r">
        <ellipse cx="100" cy="53" rx="5.5" ry="3" fill="url(#wispGrad)" />
        <ellipse
          cx="107"
          cy="61"
          rx="3"
          ry="2"
          fill="url(#wispGrad)"
          opacity="0.6"
        />
      </g>

      <g className="gc-wisp-t">
        <ellipse
          cx="60"
          cy="12"
          rx="4.5"
          ry="2.5"
          fill="url(#wispGrad)"
          opacity="0.5"
        />
      </g>

      {/* Mist particles */}
      <circle cx="25" cy="40" r="1.5" fill="rgba(196,181,253,0.22)" />
      <circle cx="96" cy="46" r="1.2" fill="rgba(196,181,253,0.2)" />
      <circle cx="18" cy="74" r="1" fill="rgba(196,181,253,0.18)" />
      <circle cx="103" cy="71" r="1.3" fill="rgba(196,181,253,0.2)" />
      <circle cx="60" cy="109" r="1.8" fill="rgba(196,181,253,0.14)" />
      <circle cx="40" cy="104" r="1" fill="rgba(196,181,253,0.11)" />
      <circle cx="80" cy="106" r="1.2" fill="rgba(196,181,253,0.12)" />
    </svg>
  );
}
