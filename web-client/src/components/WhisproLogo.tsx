interface Props {
  size?: number;
  className?: string;
  animated?: boolean;
}

export default function WhisproLogo({
  size = 80,
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
      style={{ display: "block" }}
    >
      {animated && (
        <defs>
          <style>{`
            @keyframes wpFloat {
              0%, 100% { transform: translateY(0); }
              50%       { transform: translateY(-3px); }
            }
            @keyframes wpGlow {
              0%, 100% { opacity: 0.5; }
              50%      { opacity: 0.8; }
            }
            @keyframes wpShine {
              0% { transform: translateX(-100%); }
              100% { transform: translateX(200%); }
            }
            .wp-group { animation: wpFloat 4s ease-in-out infinite; transform-origin: center; }
            .wp-bg    { animation: wpGlow 3s ease-in-out infinite; }
            .wp-shine { animation: wpShine 4s ease-in-out infinite; }
          `}</style>
          <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1e293b" />
            <stop offset="100%" stopColor="#0f172a" />
          </linearGradient>
          <linearGradient id="blueGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#60a5fa" />
            <stop offset="50%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#1d4ed8" />
          </linearGradient>
          <linearGradient id="whiteGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f8fafc" />
            <stop offset="100%" stopColor="#cbd5e1" />
          </linearGradient>
          <linearGradient id="shineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="transparent" />
            <stop offset="50%" stopColor="rgba(255,255,255,0.3)" />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
      )}

      <g className={animated ? "wp-group" : ""}>
        <circle cx="60" cy="60" r="56" fill="url(#bgGrad)" />
        
        <circle cx="60" cy="60" r="52" fill="none" stroke="url(#blueGrad)" strokeWidth="1.5" opacity="0.4" />
        
        <circle cx="60" cy="60" r="45" className={animated ? "wp-bg" : ""} fill="#3b82f6" opacity="0.15" />

        <path
          d="M30 40 L38 75 L48 55 L58 75 L66 40"
          stroke="url(#whiteGrad)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          filter="url(#glow)"
        />

        <path
          d="M72 40 L72 75 M72 52 C72 52 90 48 90 58 C90 68 72 64 72 64"
          stroke="url(#blueGrad)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          filter="url(#glow)"
        />

        {animated && (
          <ellipse
            cx="60"
            cy="60"
            rx="50"
            ry="50"
            fill="url(#shineGrad)"
            className="wp-shine"
          />
        )}
      </g>
    </svg>
  );
}
