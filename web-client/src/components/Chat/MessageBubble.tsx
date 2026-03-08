import { useEffect, useRef, useState } from "react";
import type { Message } from "@/types";
import { formatDistanceToNow } from "date-fns";
import styles from "./MessageBubble.module.css";
import clsx from "clsx";

interface Props {
  message: Message;
  onVisible: () => void;
}

interface MediaContent {
  type: "image" | "video" | "audio" | "file" | "text";
  data?: string;
  fileName?: string;
}

function parseContent(content: string): MediaContent {
  try {
    const parsed = JSON.parse(content);
    if (parsed.type && parsed.data) {
      return {
        type: parsed.type,
        data: parsed.data,
        fileName: parsed.fileName,
      };
    }
  } catch {}
  
  return { type: "text", data: content };
}

const emojiRegex = /(\p{Emoji_Presentation}|\p{Extended_Pictographic})/gu;

function renderEmojis(text: string): React.ReactNode[] {
  const parts = text.split(emojiRegex);
  
  return parts.map((part, index) => {
    if (!part) return null;
    if (emojiRegex.test(part)) {
      return (
        <span key={`emoji-${index}`} className={styles.animatedEmoji}>
          {part}
        </span>
      );
    }
    return part;
  });
}

export default function MessageBubble({ message, onVisible }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [remaining, setRemaining] = useState(
    Math.max(0, message.expiresAt - Date.now()),
  );
  const [showMedia, setShowMedia] = useState(false);

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
  }, [message.isOwn, message.isRead, onVisible]);

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

  const media = parseContent(message.content);

  return (
    <div
      ref={ref}
      className={clsx(
        styles.bubble,
        message.isOwn ? styles.own : styles.other,
      )}
    >
      {message.screenshotAlert && (
        <div className={styles.screenshotBadge}>📸 Screenshot</div>
      )}

      <div className={styles.body}>
        {media.type === "image" && media.data && (
          <img
            src={media.data}
            alt={media.fileName || "Image"}
            className={styles.mediaImage}
            onClick={() => setShowMedia(!showMedia)}
          />
        )}
        
        {media.type === "video" && media.data && (
          <video
            src={media.data}
            className={styles.mediaImage}
            controls
          />
        )}
        
        {media.type === "audio" && media.data && (
          <audio src={media.data} controls className={styles.audioPlayer} />
        )}
        
        {(media.type === "text" || !media.type) && (
          <p className={styles.text}>
            {message.plaintextCache ? renderEmojis(message.plaintextCache) : "🔒 Encrypted"}
          </p>
        )}
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
