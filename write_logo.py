import os

BASE_SRC  = "/home/boss/Documents/Projects/Ghost/web-client/src"
BASE_RES  = "/home/boss/Documents/Projects/Ghost/web-client/android/app/src/main/res"

# ── 1. GhostLogo.tsx – sky-blue ghost mark, no mask ───────────────────────────
ghost_tsx = '''/**
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
'''

# ── 2. Android vector drawable – ic_launcher_foreground.xml ──────────────────
android_foreground_xml = '''<?xml version="1.0" encoding="utf-8"?>
<!-- GhostChat adaptive icon foreground – white ghost on transparent bg -->
<!-- Designed for 108dp adaptive icon canvas (safe zone: 72dp centred) -->
<vector
    xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">

    <!-- Ghost body – white fill, centred in safe zone -->
    <path
        android:fillColor="#FFFFFF"
        android:pathData="
            M54,18
            C37,18 24,30 24,46
            L24,84
            C27.5,81.5 31.5,84.5 35,81.5
            C38.5,78.5 42,82 45.5,79
            C49,76 53,79 56.5,82
            C60,79 63.5,76 67,79
            C70.5,82 74,78.5 77.5,81.5
            C81,84.5 85,81.5 84,84
            L84,46
            C84,30 71,18 54,18
            Z
        " />

    <!-- Left eye -->
    <path
        android:fillColor="#000000"
        android:pathData="M44,50 m-7,0 a7,8 0 1,0 14,0 a7,8 0 1,0 -14,0" />

    <!-- Right eye -->
    <path
        android:fillColor="#000000"
        android:pathData="M64,50 m-7,0 a7,8 0 1,0 14,0 a7,8 0 1,0 -14,0" />

    <!-- Eye shine left -->
    <path
        android:fillColor="#FFFFFF"
        android:pathData="M47,46 m-2.5,0 a2.5,2.5 0 1,0 5,0 a2.5,2.5 0 1,0 -5,0" />

    <!-- Eye shine right -->
    <path
        android:fillColor="#FFFFFF"
        android:pathData="M67,46 m-2.5,0 a2.5,2.5 0 1,0 5,0 a2.5,2.5 0 1,0 -5,0" />

</vector>
'''

# ── 3. Background colour – black ─────────────────────────────────────────────
background_xml = '''<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#FF000000</color>
</resources>
'''

# ── Write all files ─────────────────────────────────────────────────────────
files = {
    os.path.join(BASE_SRC, "components/GhostLogo.tsx"):                         ghost_tsx,
    os.path.join(BASE_RES, "drawable/ic_launcher_foreground.xml"):               android_foreground_xml,
    os.path.join(BASE_RES, "values/ic_launcher_background.xml"):                 background_xml,
}

for path, content in files.items():
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(content)
    print("Written:", path)

# ── Update adaptive icon to use drawable foreground (vector) ─────────────────
adaptive_xml = '''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@drawable/ic_launcher_foreground"/>
</adaptive-icon>
'''
for name in ["ic_launcher.xml", "ic_launcher_round.xml"]:
    path = os.path.join(BASE_RES, "mipmap-anydpi-v26", name)
    with open(path, "w") as f:
        f.write(adaptive_xml)
    print("Updated:", path)

print("Done.")
