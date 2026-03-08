import os

MASK_TSX = r'''/**
 * AppLogo – Anonymous / Guy Fawkes hacker mask
 * Left half: black  |  Right half: white
 * Slow 3D Y-axis coin-flip rotation
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
  const id = "gc";
  return (
    <svg
      width={size}
      height={Math.round(size * 1.2)}
      viewBox="0 0 100 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: "block", transformOrigin: "50% 50%" }}
    >
      {/* ── Animations ── */}
      {animated && (
        <defs>
          <style>{`
            @keyframes gcFlip {
              0%   { transform: perspective(600px) rotateY(0deg);   }
              100% { transform: perspective(600px) rotateY(360deg); }
            }
            .${id}-root {
              animation: gcFlip 7s linear infinite;
              transform-origin: 50% 50%;
            }
          `}</style>
        </defs>
      )}

      <g className={animated ? `${id}-root` : ""}>

        {/* ══════════════════════════════════════════
            MASK SILHOUETTE
            egg shape: wide forehead, tapering to
            a distinct pointed chin
        ══════════════════════════════════════════ */}

        {/* Left half – black */}
        <path
          d="
            M 50 4
            C 28 4, 10 20, 10 46
            C 10 70, 14 90, 28 107
            Q 36 118, 50 118
            Z
          "
          fill="#111"
        />

        {/* Right half – white */}
        <path
          d="
            M 50 4
            C 72 4, 90 20, 90 46
            C 90 70, 86 90, 72 107
            Q 64 118, 50 118
            Z
          "
          fill="#efefef"
        />

        {/* Outer mask border */}
        <path
          d="
            M 50 4
            C 28 4, 10 20, 10 46
            C 10 70, 14 90, 28 107
            Q 36 118, 50 118
            Q 64 118, 72 107
            C 86 90, 90 70, 90 46
            C 90 20, 72 4, 50 4 Z
          "
          fill="none"
          stroke="#555"
          strokeWidth="1"
        />

        {/* ══════════════════════════════════════════
            EYEBROWS  – thick, sharply arched
        ══════════════════════════════════════════ */}

        {/* Left eyebrow – white on black */}
        <path
          d="M 18 38 Q 28 26 43 32"
          stroke="#fff"
          strokeWidth="3.5"
          strokeLinecap="round"
          fill="none"
        />
        {/* Right eyebrow – black on white */}
        <path
          d="M 57 32 Q 72 26 82 38"
          stroke="#111"
          strokeWidth="3.5"
          strokeLinecap="round"
          fill="none"
        />

        {/* ══════════════════════════════════════════
            EYE HOLES – deep almond / teardrop shape
        ══════════════════════════════════════════ */}

        {/* Left eye socket – white hollow on black face */}
        <path
          d="M 19 50 Q 24 40 33 40 Q 42 40 46 50 Q 42 60 33 60 Q 24 60 19 50 Z"
          fill="#fff"
          stroke="#ccc"
          strokeWidth="0.5"
        />
        {/* Left pupil */}
        <ellipse cx="33" cy="50" rx="5" ry="5.5" fill="#111" />
        {/* Left iris ring */}
        <ellipse cx="33" cy="50" rx="7" ry="7.5" fill="none" stroke="#888" strokeWidth="0.8" />
        {/* Left highlight */}
        <circle cx="35" cy="47" r="1.5" fill="rgba(255,255,255,0.9)" />

        {/* Right eye socket – dark hollow on white face */}
        <path
          d="M 54 50 Q 58 40 67 40 Q 76 40 81 50 Q 76 60 67 60 Q 58 60 54 50 Z"
          fill="#222"
          stroke="#444"
          strokeWidth="0.5"
        />
        {/* Right iris */}
        <ellipse cx="67" cy="50" rx="7" ry="7.5" fill="none" stroke="#666" strokeWidth="0.8" />
        {/* Right pupil */}
        <ellipse cx="67" cy="50" rx="5" ry="5.5" fill="#f5f5f5" />
        {/* Right highlight */}
        <circle cx="69" cy="47" r="1.5" fill="rgba(30,30,30,0.7)" />

        {/* ══════════════════════════════════════════
            CHEEKS – subtle circular blush panels
        ══════════════════════════════════════════ */}

        {/* Left cheek – faint on black */}
        <circle cx="22" cy="72" r="9" fill="rgba(255,255,255,0.06)" />
        {/* Right cheek – faint on white */}
        <circle cx="78" cy="72" r="9" fill="rgba(0,0,0,0.07)" />

        {/* ══════════════════════════════════════════
            NOSE – inverted Y / narrow bridge
        ══════════════════════════════════════════ */}

        {/* Left nostril line – white */}
        <path
          d="M 50 64 L 42 74 Q 40 77 43 78"
          stroke="#fff"
          strokeWidth="1.4"
          strokeLinecap="round"
          fill="none"
        />
        {/* Right nostril line – black */}
        <path
          d="M 50 64 L 58 74 Q 60 77 57 78"
          stroke="#222"
          strokeWidth="1.4"
          strokeLinecap="round"
          fill="none"
        />

        {/* ══════════════════════════════════════════
            HANDLEBAR MUSTACHE
            thin, curling sharply up at both tips
        ══════════════════════════════════════════ */}

        {/* Left side of mustache – white on black */}
        <path
          d="M 50 84 Q 44 81 38 82 Q 30 83 26 79"
          stroke="#fff"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
        {/* Right side of mustache – black on white */}
        <path
          d="M 50 84 Q 56 81 62 82 Q 70 83 74 79"
          stroke="#111"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
        {/* Curl tip left */}
        <path
          d="M 26 79 Q 23 76 27 73"
          stroke="#fff"
          strokeWidth="1.6"
          strokeLinecap="round"
          fill="none"
        />
        {/* Curl tip right */}
        <path
          d="M 74 79 Q 77 76 73 73"
          stroke="#111"
          strokeWidth="1.6"
          strokeLinecap="round"
          fill="none"
        />

        {/* ══════════════════════════════════════════
            CHIN GOATEE – narrow tapered triangle
        ══════════════════════════════════════════ */}

        {/* Left half goatee – white on black */}
        <path
          d="M 50 91 Q 45 96 47 108 Q 48 113 50 115"
          stroke="#fff"
          strokeWidth="1.8"
          strokeLinecap="round"
          fill="none"
        />
        {/* Right half goatee – black on white */}
        <path
          d="M 50 91 Q 55 96 53 108 Q 52 113 50 115"
          stroke="#222"
          strokeWidth="1.8"
          strokeLinecap="round"
          fill="none"
        />

        {/* ══════════════════════════════════════════
            FOREHEAD ORNAMENT – diamond above nose bridge
        ══════════════════════════════════════════ */}
        <path
          d="M 50 14 L 53 20 L 50 26 L 47 20 Z"
          fill="none"
          stroke="#888"
          strokeWidth="1"
        />

        {/* ══════════════════════════════════════════
            CENTRE DIVIDER
        ══════════════════════════════════════════ */}
        <line
          x1="50" y1="4" x2="50" y2="118"
          stroke="#777"
          strokeWidth="0.7"
          strokeDasharray="4 2"
        />

      </g>
    </svg>
  );
}
'''

path = "/home/boss/Documents/Projects/Ghost/web-client/src/components/GhostLogo.tsx"
with open(path, "w") as f:
    f.write(MASK_TSX)
print("Written:", path)
