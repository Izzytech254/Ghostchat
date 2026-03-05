import { useEffect, useState } from "react";
import { v4 as uuid } from "uuid";
import { getChats, saveChat } from "@/utils/storage";
import { lookupUser } from "@/utils/keyServerApi";
import type { Chat } from "@/types";
import { formatDistanceToNow } from "date-fns";
import styles from "./ChatList.module.css";

interface Props {
  activeChatId: string | null;
  onSelectChat: (id: string) => void;
}

export default function ChatList({ activeChatId, onSelectChat }: Props) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getChats().then((saved) => {
      setChats(saved);
    });
  }, []);

  const createChat = async () => {
    const name = newName.trim().toLowerCase();
    if (!name) return;

    setError("");
    setLoading(true);

    try {
      // Look up user by username
      const user = await lookupUser(name);

      if (!user) {
        setError("User not found. Ask them to create an account first.");
        setLoading(false);
        return;
      }

      // Check if chat already exists
      const existingChat = chats.find((c) =>
        c.participantIds.includes(user.user_id),
      );
      if (existingChat) {
        onSelectChat(existingChat.id);
        setNewName("");
        setLoading(false);
        return;
      }

      const chat: Chat = {
        id: uuid(),
        type: "private",
        name: user.username,
        participantIds: [user.user_id],
        defaultTtlMs: 86_400_000,
        createdAt: Date.now(),
      };

      await saveChat(chat);
      setChats((prev) => [chat, ...prev]);
      setNewName("");
      onSelectChat(chat.id);
    } catch (err) {
      setError("Failed to look up user. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      {/* New chat input */}
      <div className={styles.newChat}>
        <input
          className={styles.input}
          placeholder="New chat… (enter username)"
          value={newName}
          onChange={(e) => {
            setNewName(e.target.value);
            setError("");
          }}
          onKeyDown={(e) => e.key === "Enter" && !loading && createChat()}
          disabled={loading}
        />
        <button
          className={styles.addBtn}
          onClick={createChat}
          title="Create chat"
          disabled={loading}
        >
          {loading ? "…" : "+"}
        </button>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {/* Chat list */}
      <ul className={styles.list}>
        {chats.map((chat) => (
          <li
            key={chat.id}
            className={`${styles.item} ${chat.id === activeChatId ? styles.active : ""}`}
            onClick={() => onSelectChat(chat.id)}
          >
            <div className={styles.avatar}>
              {(chat.name ?? "?")[0].toUpperCase()}
            </div>
            <div className={styles.info}>
              <div className={styles.row}>
                <span className={styles.name}>{chat.name ?? "Unknown"}</span>
                {chat.lastMessageAt && (
                  <span className={styles.time}>
                    {formatDistanceToNow(chat.lastMessageAt, {
                      addSuffix: true,
                    })}
                  </span>
                )}
              </div>
              <span className={styles.preview}>
                {chat.lastMessagePreview ?? "…"}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
