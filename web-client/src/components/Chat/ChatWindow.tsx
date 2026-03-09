import { useRef, useEffect, useState } from "react";
import { useChat } from "@/hooks/useChat";
import { useCallContext } from "@/contexts/CallContext";
import { getChat } from "@/utils/storage";
import MessageBubble from "./MessageBubble";
import TimerSelector from "./TimerSelector";
import EmojiPicker from "./EmojiPicker";
import MediaPicker, { MediaFile } from "./MediaPicker";
import type { DeletionType, Chat } from "@/types";

import { AttachmentIcon, SmileIcon, VideoIcon, CloseIcon, AlertIcon, PhoneIcon, SendIcon } from "@/components/UI/Icons";
import styles from "./ChatWindow.module.css";

interface Props {
  chatId: string;
  onBack?: () => void;
}

export default function ChatWindow({ chatId, onBack }: Props) {
  const [chat, setChat] = useState<Chat | null>(null);
  const [text, setText] = useState("");
  const [ttlMs, setTtlMs] = useState(86_400_000);
  const [delType, setDelType] = useState<DeletionType>("timed");
  const [screenshotAlert, setScreenshotAlert] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [mediaPreview, setMediaPreview] = useState<MediaFile | null>(null);

  const { messages, sendMessage, onMessageRead } = useChat(chatId);
  const { callState, startCall } = useCallContext();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getChat(chatId).then(setChat);
  }, [chatId]);

  const recipientId = chat?.participantIds?.[0] ?? "";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    const handle = () => {
      setScreenshotAlert(true);
      setTimeout(() => setScreenshotAlert(false), 4_000);
    };
    document.addEventListener("visibilitychange", handle);
    return () => document.removeEventListener("visibilitychange", handle);
  }, []);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed && !mediaPreview) return;
    if (!recipientId) return;

    if (mediaPreview) {
      const content = JSON.stringify({
        type: mediaPreview.type,
        fileName: mediaPreview.file.name,
        data: await blobToBase64(mediaPreview.compressed || mediaPreview.file),
      });
      await sendMessage(content, recipientId, ttlMs, delType);
      setMediaPreview(null);
    }

    if (trimmed) {
      await sendMessage(trimmed, recipientId, ttlMs, delType);
    }
    setText("");
  };

  const handleEmojiSelect = (emoji: string) => {
    setText((prev) => prev + emoji);
    setShowEmojiPicker(false);
  };

  const handleMediaSelect = (media: MediaFile) => {
    setMediaPreview(media);
    setShowMediaPicker(false);
  };

  const clearMedia = () => {
    if (mediaPreview?.preview) {
      URL.revokeObjectURL(mediaPreview.preview);
    }
    setMediaPreview(null);
  };

  return (
    <div className={styles.window}>
      <header className={styles.header}>
        {onBack && (
          <button className={styles.backBtn} onClick={onBack} title="Back">
            ←
          </button>
        )}
        <div className={styles.peerName}>{chat?.name ?? "Loading..."}</div>
        <div className={styles.headerActions}>
          <button
            className={styles.callBtn}
            onClick={() => recipientId && startCall(recipientId, chat?.name || "Unknown")}
            title="Voice call (encrypted)"
            disabled={!recipientId || callState.status !== "idle"}
          >
            <PhoneIcon size={20} color="#22c55e" />
          </button>
          <button
            className={`${styles.callBtn} ${styles.videoCallBtn}`}
            onClick={() => recipientId && startCall(recipientId, chat?.name || "Unknown", true)}
            title="Video call (encrypted)"
            disabled={!recipientId || callState.status !== "idle"}
          >
            <VideoIcon size={20} color="#3b82f6" />
          </button>
          <TimerSelector
            ttlMs={ttlMs}
            deletionType={delType}
            onChangeTtl={setTtlMs}
            onChangeDeletionType={setDelType}
          />
        </div>
      </header>

      {screenshotAlert && (
        <div className={styles.alert}>
          <AlertIcon size={16} color="#f59e0b" /> Screenshot detected - sender has been notified
        </div>
      )}

      <div className={styles.messages}>
        {messages.length === 0 && (
          <p className={styles.empty}>Whisper Without Worry</p>
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

      {mediaPreview && (
        <div className={styles.mediaPreview}>
          {mediaPreview.type === "image" && (
            <img src={mediaPreview.preview} alt="Preview" />
          )}
          {mediaPreview.type === "video" && (
            <video src={mediaPreview.preview} controls />
          )}
          {mediaPreview.type === "audio" && (
            <audio src={mediaPreview.preview} controls />
          )}
          <button className={styles.clearMedia} onClick={clearMedia} title="Remove media">
            <CloseIcon size={18} color="#fff" />
          </button>
        </div>
      )}

      <div style={{ position: "relative" }}>
        {showEmojiPicker && (
          <div className={styles.pickerContainer}>
            <EmojiPicker
              onSelect={handleEmojiSelect}
              onClose={() => setShowEmojiPicker(false)}
            />
          </div>
        )}
        {showMediaPicker && (
          <div className={styles.pickerContainer}>
            <MediaPicker
              onSelect={handleMediaSelect}
              onClose={() => setShowMediaPicker(false)}
            />
          </div>
        )}
      </div>

      <footer className={styles.composer}>
        <div className={styles.attachments}>
          <button
            className={styles.attachBtn}
            onClick={() => setShowMediaPicker(!showMediaPicker)}
            title="Media"
          >
            <AttachmentIcon size={22} color="#6b7280" />
          </button>
          <button
            className={styles.attachBtn}
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            title="Emoji"
          >
            <SmileIcon size={22} color="#6b7280" />
          </button>
        </div>
        <textarea
          className={styles.textarea}
          placeholder="Message..."
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
          <SendIcon size={22} color="#fff" />
        </button>
      </footer>
    </div>
  );
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
