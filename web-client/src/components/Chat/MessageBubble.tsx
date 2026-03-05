import { useEffect, useRef, useState } from "react";
import type { Message } from "@/types";
import { formatDistanceToNow } from "date-fns";
import styles from "./MessageBubble.module.css";
import clsx from "clsx";

interface Props {
  message: Message;
  onVisible: () => void;
}

export default function MessageBubble({ message, onVisible }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [remaining, setRemaining] = useState(
    Math.max(0, message.expiresAt - Date.now()),
  );

  // Intersection observer – mark as read when visible
  useEffect(() => {
    if (message.isOwn || message.isRead) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          onVisible();
          observer.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [message.isOwn, message.isRead]);

  // Countdown timer (updates every second)
  useEffect(() => {
    const id = setInterval(() => {
      const r = Math.max(0, message.expiresAt - Date.now());
      setRemaining(r);
      if (r === 0) clearInterval(id);
    }, 1_000);
    return () => clearInterval(id);
  }, [message.expiresAt]);

  const formatTtl = (ms: number): string => {
    if (ms <= 0) return "expired";
    if (ms < 60_000) return `${Math.ceil(ms / 1000)}s`;
    if (ms < 3_600_000) return `${Math.ceil(ms / 60_000)}m`;
    if (ms < 86_400_000) return `${Math.ceil(ms / 3_600_000)}h`;
    return `${Math.ceil(ms / 86_400_000)}d`;
  };

  const urgency =
    remaining < 10_000 ? "critical" : remaining < 60_000 ? "warn" : "ok";

  return (
    <div
      ref={ref}
      className={clsx(
        styles.bubble,
        message.isOwn ? styles.own : styles.other,
        styles.fadeIn,
      )}
    >
      {message.screenshotAlert && (
        <div className={styles.screenshotBadge}>📸 Screenshot</div>
      )}

      <div className={styles.body}>
        <p className={styles.text}>
          {message.plaintextCache ?? "🔒 Encrypted"}
        </p>
      </div>

      <div className={styles.footer}>
        <span
          className={clsx(styles.timer, {
            [styles.warn]: urgency === "warn",
            [styles.critical]: urgency === "critical",
          })}
          title={`Expires ${new Date(message.expiresAt).toLocaleString()}`}
        >
          ⏱ {formatTtl(remaining)}
        </span>

        <span className={styles.meta}>
          {formatDistanceToNow(message.createdAt, { addSuffix: true })}
        </span>

        {message.isOwn && (
          <span className={styles.status}>{message.isRead ? "✓✓" : "✓"}</span>
        )}
      </div>
    </div>
  );
}
