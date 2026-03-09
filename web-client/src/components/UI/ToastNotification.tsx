/**
 * ToastNotification – In-app toast popup manager.
 *
 * Usage:
 *   const { showToast } = useToastStore();
 *   showToast({ title: "Alice", message: "Hey!", onClick: () => openChat(id) });
 *
 * Mount <ToastContainer /> once at the app root.
 */

import { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import styles from "./ToastNotification.module.css";

// ── Store ─────────────────────────────────────────────────────────────────────

export interface ToastItem {
  id: number;
  title: string;
  message: string;
  /** Single initial letter shown in avatar bubble, falls back to 💬 */
  avatarLetter?: string;
  /** Tap handler – e.g. open the relevant chat */
  onClick?: () => void;
  /** Duration in ms before auto-dismiss. Default 4500 */
  duration?: number;
}

interface ToastState {
  toasts: ToastItem[];
  showToast: (toast: Omit<ToastItem, "id">) => void;
  dismissToast: (id: number) => void;
}

let _nextId = 1;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  showToast: (toast) =>
    set((s) => ({
      toasts: [...s.toasts, { ...toast, id: _nextId++ }],
    })),
  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

// ── Single toast ──────────────────────────────────────────────────────────────

function Toast({ item }: { item: ToastItem }) {
  const dismissToast = useToastStore((s) => s.dismissToast);
  const [leaving, setLeaving] = useState(false);
  const duration = item.duration ?? 4500;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = () => {
    if (leaving) return;
    setLeaving(true);
    setTimeout(() => dismissToast(item.id), 230); // match slideOut duration
  };

  useEffect(() => {
    timerRef.current = setTimeout(dismiss, duration);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClick = () => {
    dismiss();
    item.onClick?.();
  };

  return (
    <div
      className={`${styles.toast} ${leaving ? styles.leaving : ""}`}
      onClick={handleClick}
      role="alert"
      aria-live="polite"
    >
      {/* Avatar */}
      {item.avatarLetter ? (
        <div className={styles.avatar}>{item.avatarLetter}</div>
      ) : (
        <div className={styles.iconWrap}>💬</div>
      )}

      {/* Text */}
      <div className={styles.body}>
        <span className={styles.title}>{item.title}</span>
        <span className={styles.message}>{item.message}</span>
      </div>

      {/* Close */}
      <button
        className={styles.close}
        onClick={(e) => { e.stopPropagation(); dismiss(); }}
        aria-label="Dismiss"
      >
        ✕
      </button>

      {/* Progress drain bar */}
      <div className={styles.progress} />
    </div>
  );
}

// ── Container ─────────────────────────────────────────────────────────────────

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className={styles.container}>
      {toasts.map((t) => (
        <Toast key={t.id} item={t} />
      ))}
    </div>
  );
}
