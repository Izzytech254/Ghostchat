import os

BASE = "/home/boss/Documents/Projects/Ghost/web-client/src"

# ── WhisproLogo.tsx ────────────────────────────────────────────────────────────
whispro_logo = '''/**
 * AppLogo – Split hacker mask: left black / right white, sky-blue accents
 */

interface Props {
  size?: number;
  className?: string;
  animated?: boolean;
}

export default function WhisproLogo({
  size = 120,
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
      <defs>
        <clipPath id="splitLeft">
          <rect x="0" y="0" width="50" height="100" />
        </clipPath>
        <clipPath id="splitRight">
          <rect x="50" y="0" width="50" height="100" />
        </clipPath>
        {animated && (
          <style>{`
            @keyframes maskFloat {
              0%, 100% { transform: translateY(0); }
              50%       { transform: translateY(-7px); }
            }
            @keyframes glowPulse {
              0%, 100% { opacity: 0.7; }
              50%       { opacity: 1; }
            }
            .gc-mask    { animation: maskFloat  4s ease-in-out infinite; }
            .gc-divider { animation: glowPulse  3s ease-in-out infinite; }
          `}</style>
        )}
      </defs>

      {/* ── Mask silhouette ── */}
      <g className={animated ? "gc-mask" : ""}>
        {/* Left half – black */}
        <path
          d="M50 5 C29 5 13 21 13 42 L13 70 C13 85 21 97 36 99 L50 100 Z"
          fill="#000"
        />
        {/* Right half – white */}
        <path
          d="M50 5 C71 5 87 21 87 42 L87 70 C87 85 79 97 64 99 L50 100 Z"
          fill="#ffffff"
        />
        {/* Outer border */}
        <path
          d="M50 5 C29 5 13 21 13 42 L13 70 C13 85 21 97 36 99 L50 100 L64 99 C79 97 87 85 87 70 L87 42 C87 21 71 5 50 5 Z"
          fill="none"
          stroke="#38bdf8"
          strokeWidth="1.8"
        />

        {/* ── Left eye (on black – white sclera, sky iris, black pupil) ── */}
        <ellipse cx="33" cy="44" rx="10" ry="7"  fill="#ffffff" />
        <ellipse cx="33" cy="44" rx="6"  ry="4"  fill="#38bdf8" />
        <ellipse cx="33" cy="44" rx="2.5" ry="2.5" fill="#000" />
        <circle  cx="34.5" cy="42.8" r="1" fill="rgba(255,255,255,0.7)" />

        {/* ── Right eye (on white – dark sclera, sky iris, white pupil) ── */}
        <ellipse cx="67" cy="44" rx="10" ry="7"  fill="#111" />
        <ellipse cx="67" cy="44" rx="6"  ry="4"  fill="#38bdf8" />
        <ellipse cx="67" cy="44" rx="2.5" ry="2.5" fill="#fff" />
        <circle  cx="68.5" cy="42.8" r="1" fill="rgba(0,0,0,0.5)" />

        {/* ── Eyebrows ── */}
        <path d="M23 33 Q33 27 43 33" stroke="#38bdf8" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <path d="M57 33 Q67 27 77 33" stroke="#38bdf8" strokeWidth="1.6" fill="none" strokeLinecap="round" />

        {/* ── Nose ── */}
        <path d="M46 59 L50 67 L54 59" stroke="#38bdf8" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />

        {/* ── Mouth – left half (on black = white stroke) ── */}
        <path d="M33 79 Q41 86 50 83" stroke="#ffffff" strokeWidth="1.8" fill="none" strokeLinecap="round" clipPath="url(#splitLeft)" />
        {/* ── Mouth – right half (on white = black stroke) ── */}
        <path d="M50 83 Q59 86 67 79" stroke="#000000" strokeWidth="1.8" fill="none" strokeLinecap="round" clipPath="url(#splitRight)" />

        {/* ── Centre divider ── */}
        <line
          className={animated ? "gc-divider" : ""}
          x1="50" y1="5" x2="50" y2="100"
          stroke="#38bdf8"
          strokeWidth="1.5"
        />
      </g>
    </svg>
  );
}
'''

# ── AuthScreen.module.css ─────────────────────────────────────────────────────
auth_css = '''.screen {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100dvh;
  background: #000;
}

.card {
  background: #0d0d0d;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 48px 36px;
  width: 100%;
  max-width: 420px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  animation: fadeUp 280ms ease;
}

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: translateY(0); }
}

.logo {
  margin-bottom: 4px;
}

.title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.2px;
}

.sub {
  margin: 0;
  font-size: 13px;
  color: #4b5563;
}

.buttons {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  margin-top: 10px;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 100%;
}

.label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: #9ca3af;
  font-weight: 500;
}

.input {
  background: #1a1a1a;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 12px 14px;
  color: #fff;
  font-size: 14px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  width: 100%;
}

.input:focus {
  border-color: #38bdf8;
  box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.12);
}

.input::placeholder {
  color: #2d2d2d;
}

.btn {
  background: #38bdf8;
  border: none;
  border-radius: 8px;
  color: #000;
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  padding: 13px 20px;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.1s ease;
  width: 100%;
}

.btn:hover  { background: #7dd3fc; }
.btn:active { transform: scale(0.98); }
.btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
  transform: none;
}

.btn.secondary {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #9ca3af;
}

.btn.secondary:hover {
  border-color: #38bdf8;
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.07);
}

.error {
  color: #f87171;
  font-size: 13px;
  font-family: inherit;
  margin: 0;
  padding: 10px 14px;
  border: 1px solid rgba(248, 113, 113, 0.25);
  border-radius: 8px;
  background: rgba(248, 113, 113, 0.07);
  width: 100%;
}
'''

# ── App.module.css ────────────────────────────────────────────────────────────
app_css = '''.app {
  display: flex;
  width: 100%;
  height: 100dvh;
  overflow: hidden;
  background: #000;
}

/* ── Sidebar ── */
.sidebar {
  width: 300px;
  min-width: 260px;
  background: #0a0a0a;
  border-right: 1px solid rgba(255, 255, 255, 0.07);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.sidebarHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
}

.logo {
  font-weight: 700;
  font-size: 15px;
  color: #fff;
  letter-spacing: 0.3px;
}

.iconBtn {
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #6b7280;
  font-size: 15px;
  cursor: pointer;
  padding: 6px 9px;
  border-radius: 6px;
  transition: all 0.15s ease;
  line-height: 1;
}

.iconBtn:hover {
  border-color: #38bdf8;
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.08);
}

.iconBtn:active { transform: scale(0.95); }

/* ── Main pane ── */
.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #000;
}

.emptyState {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  animation: fadeIn 300ms ease;
  text-align: center;
  padding: 24px;
  color: var(--text-muted);
}

.whisproIcon {
  margin-bottom: 4px;
}

.sub {
  font-size: 12px;
  color: #374151;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ── Responsive ── */
@media (max-width: 640px) {
  .sidebar {
    width: 100%;
    min-width: unset;
    border-right: none;
  }
  .main { display: none; }

  .hasChatOpen .sidebar { display: none; }
  .hasChatOpen .main    { display: flex; }
}
'''

files = {
    os.path.join(BASE, "components/WhisproLogo.tsx"):             whispro_logo,
    os.path.join(BASE, "components/Auth/AuthScreen.module.css"): auth_css,
    os.path.join(BASE, "App.module.css"):                        app_css,
}

for path, content in files.items():
    with open(path, "w") as f:
        f.write(content)
    print(f"Written: {path}")
