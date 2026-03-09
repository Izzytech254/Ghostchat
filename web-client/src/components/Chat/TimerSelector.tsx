import type { DeletionType } from "@/types";
import { TimerIcon, EyeIcon, FlameIcon } from "@/components/UI/Icons";
import styles from "./TimerSelector.module.css";

const TTL_OPTIONS: { label: string; ms: number }[] = [
  { label: "10s", ms: 10_000 },
  { label: "30s", ms: 30_000 },
  { label: "1m", ms: 60_000 },
  { label: "5m", ms: 300_000 },
  { label: "1h", ms: 3_600_000 },
  { label: "1d", ms: 86_400_000 },
  { label: "7d", ms: 604_800_000 },
];

const DEL_OPTIONS: { value: DeletionType; title: string; icon: "timer" | "eye" | "flame" }[] = [
  { value: "timed", title: "Delete after timer", icon: "timer" },
  { value: "read_once", title: "Delete after read", icon: "eye" },
  { value: "burn_on_read", title: "Burn 5s after read", icon: "flame" },
];

interface Props {
  ttlMs: number;
  deletionType: DeletionType;
  onChangeTtl: (ms: number) => void;
  onChangeDeletionType: (t: DeletionType) => void;
}

const IconMap = {
  timer: TimerIcon,
  eye: EyeIcon,
  flame: FlameIcon,
};

export default function TimerSelector({
  ttlMs,
  deletionType,
  onChangeTtl,
  onChangeDeletionType,
}: Props) {
  return (
    <div className={styles.container}>
      <select
        className={styles.select}
        value={ttlMs}
        onChange={(e) => onChangeTtl(Number(e.target.value))}
        title="Message lifetime"
      >
        {TTL_OPTIONS.map((o) => (
          <option key={o.label} value={o.ms}>
            {o.label}
          </option>
        ))}
      </select>

      <div className={styles.delTypes}>
        {DEL_OPTIONS.map((o) => {
          const IconComponent = IconMap[o.icon];
          return (
            <button
              key={o.value}
              className={`${styles.delBtn} ${deletionType === o.value ? styles.active : ""}`}
              title={o.title}
              onClick={() => onChangeDeletionType(o.value)}
            >
              <IconComponent size={14} color="currentColor" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
