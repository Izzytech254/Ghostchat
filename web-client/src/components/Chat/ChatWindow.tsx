import { useRef, useEffect, useState } from "react";
import { useChat } from "@/hooks/useChat";
import { getChat } from "@/utils/storage";
import MessageBubble from "./MessageBubble";
import TimerSelector from "./TimerSelector";
import type { DeletionType, Chat } from "@/types";
import styles from "./ChatWindow.module.css";

interface Props {
  chatId: string;
  onBack?: () => void;
}

export default function ChatWindow({ chatId, onBack }: Props) {
  const [chat, setChat] = useState<Chat | null>(null);
  const [text, setText] = useState("");
  const [ttlMs, setTtlMs] = useState(86_400_000); // 24 h default
  const [delType, setDelType] = useState<DeletionType>("timed");
  const [screenshotAlert, setScreenshotAlert] = useState(false);

  const { messages, sendMessage, onMessageRead } = useChat(chatId);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load chat data to get recipient info
  useEffect(() => {
    getChat(chatId).then(setChat);
  }, [chatId]);

  // Get recipient ID from chat participants
  const recipientId = chat?.participantIds?.[0] ?? "";

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Screenshot detection (browser API)
  useEffect(() => {
    const handle = () => {
      setScreenshotAlert(true);
      setTimeout(() => setScreenshotAlert(false), 4_000);
    };
    // visibilitychange is the closest browser-level signal
    document.addEventListener("visibilitychange", handle);
    return () => document.removeEventListener("visibilitychange", handle);
  }, []);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || !recipientId) return;
    await sendMessage(trimmed, recipientId, ttlMs, delType);
    setText("");
  };

  return (
    <div className={styles.window}>
      {/* Header */}
      <header className={styles.header}>
        {onBack && (
          <button className={styles.backBtn} onClick={onBack} title="Back">
            ←
          </button>
        )}
        <div className={styles.peerName}>{chat?.name ?? "Loading..."}</div>
        <TimerSelector
          ttlMs={ttlMs}
          deletionType={delType}
          onChangeTtl={setTtlMs}
          onChangeDeletionType={setDelType}
        />
      </header>

      {screenshotAlert && (
        <div className={styles.alert}>
          ⚠ Screenshot detected – sender has been notified
        </div>
      )}

      {/* Messages */}
      <div className={styles.messages}>
        {messages.length === 0 && (
          <p className={styles.empty}>
            Messages disappear after their timer expires. 👻
          </p>
        )}
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onVisible={() => onMessageRead(msg)}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <footer className={styles.composer}>
        <textarea
          className={styles.textarea}
          placeholder="Type a ghosted message…"
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <button className={styles.sendBtn} onClick={handleSend} title="Send">
          ↑
        </button>
      </footer>
    </div>
  );
}
