/**
 * GhostLogo – Brand icon mark: clean sky-blue ghost
 * Minimal, modern – same design language as Telegram / WhatsApp app marks.
 */

interface Props {
  size?: number;
  className?: string;
  animated?: boolean;
}

export default function GhostLogo({
  size = 80,
  className = "",
  animated = true,
}: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: "block" }}
    >
      {animated && (
        <defs>
          <style>{`
            @keyframes gcFloat {
              0%, 100% { transform: translateY(0); }
              50%       { transform: translateY(-6px); }
            }
            @keyframes gcBlink {
              0%, 90%, 100% { transform: scaleY(1); }
              95%           { transform: scaleY(0.1); }
            }
            .gc-body  { animation: gcFloat 3.6s ease-in-out infinite; transform-origin: 50% 50%; }
            .gc-eye-l { animation: gcBlink 4s ease-in-out infinite 0s; transform-origin: 36px 47px; }
            .gc-eye-r { animation: gcBlink 4s ease-in-out infinite 0.15s; transform-origin: 64px 47px; }
          `}</style>
        </defs>
      )}

      <g className={animated ? "gc-body" : ""}>

        {/* ── Ghost body ── */}
        {/* Main dome + torso */}
        <path
          d="
            M 50 14
            C 31 14, 18 27, 18 44
            L 18 80
            C 22 77, 27 80, 31 77
            C 35 74, 39 78, 43 75
            C 47 72, 52 75, 56 78
            C 60 75, 64 72, 68 75
            C 72 78, 76 74, 80 77
            C 84 80, 84 80, 82 76
            L 82 44
            C 82 27, 69 14, 50 14
            Z
          "
          fill="#38bdf8"
        />

        {/* Subtle inner highlight – top specular gloss */}
        <ellipse
          cx="44"
          cy="30"
          rx="13"
          ry="8"
          fill="rgba(255,255,255,0.18)"
          transform="rotate(-20 44 30)"
        />

        {/* ── Eyes ── */}
        <ellipse
          cx="36" cy="47" rx="7" ry="8"
          fill="#000e1a"
          className={animated ? "gc-eye-l" : ""}
        />
        <ellipse
          cx="64" cy="47" rx="7" ry="8"
          fill="#000e1a"
          className={animated ? "gc-eye-r" : ""}
        />

        {/* Eye shine */}
        <circle cx="39" cy="44" r="2.5" fill="rgba(255,255,255,0.75)" />
        <circle cx="67" cy="44" r="2.5" fill="rgba(255,255,255,0.75)" />

      </g>
    </svg>
  );
}
