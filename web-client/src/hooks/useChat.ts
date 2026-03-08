/**
 * useChat.ts – high-level chat hook
 * Wires together WS, encryption, message store, and expiry pruning.
 */

import { useEffect, useCallback } from "react";
import { v4 as uuid } from "uuid";

import { wsClient } from "@/utils/wsClient";
import { useMessageStore } from "@/store/messageStore";
import { useAccountStore } from "@/store/accountStore";
import type { Message, DeletionType } from "@/types";

const PRUNE_INTERVAL_MS = 10_000; // check every 10s

export function useChat(chatId: string) {
  const { account } = useAccountStore();
  const {
    messagesByChatId,
    loadMessages,
    addInboundMessage,
    markRead,
    pruneExpired,
  } = useMessageStore();
  const messages = messagesByChatId[chatId] ?? [];

  // ── Load persisted messages on mount ─────────────────────────────────────
  useEffect(() => {
    loadMessages(chatId);
  }, [chatId]);

  // ── Periodic expiry pruner ────────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(pruneExpired, PRUNE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // NOTE: MESSAGE packets are handled globally in App.tsx to support
  // auto-creating chats for new senders. This hook only handles send.

  // ── Send ──────────────────────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (
      plaintext: string,
      recipientId: string,
      ttlMs: number,
      deletionType: DeletionType = "timed",
    ) => {
      if (!account) return;

      console.log(
        "[Whispro] Sending message to:",
        recipientId,
        "from:",
        account.id,
      );

      const id = uuid();
      const now = Date.now();
      const expiresAt = now + ttlMs;

      // TODO: Encrypt plaintext with recipient's key bundle (x3dhInitiate).
      // For MVP we send the plaintext as-is; replace `content` with encrypted envelope.
      const content = JSON.stringify({ text: plaintext, mock: true });

      wsClient.send({
        type: "MESSAGE",
        to: recipientId,
        id,
        content,
        expiresAt,
        deletionType,
      });

      const outbound: Message = {
        id,
        chatId,
        senderId: account.id,
        content,
        plaintextCache: plaintext,
        createdAt: now,
        expiresAt,
        deletionType,
        isRead: true,
        isOwn: true,
      };

      await addInboundMessage(outbound);
    },
    [account, chatId],
  );

  // ── Mark read ─────────────────────────────────────────────────────────────
  const onMessageRead = useCallback(
    (msg: Message) => {
      if (!msg.isRead && !msg.isOwn) markRead(msg);
    },
    [markRead],
  );

  return { messages, sendMessage, onMessageRead };
}
