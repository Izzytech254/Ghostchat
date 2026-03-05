/**
 * messageStore.ts – Zustand store for ephemeral messages.
 *
 * Responsibilities:
 *  - Hold decrypted messages in memory only.
 *  - Persist encrypted form to local IndexedDB.
 *  - Start countdown timers for timed messages.
 *  - Trigger read_once / burn_on_read deletion.
 *  - Sync deletions to peers via WebSocket.
 */

import { create } from "zustand";

import {
  deleteMessage,
  saveMessage,
  getMessages,
  deleteExpiredMessages,
} from "@/utils/storage";
import { wsClient } from "@/utils/wsClient";
import type { Message, WsInboundPacket } from "@/types";

interface MessageState {
  /** chatId → Message[] (decrypted, in memory) */
  messagesByChatId: Record<string, Message[]>;

  loadMessages: (chatId: string) => Promise<void>;
  addInboundMessage: (msg: Message) => Promise<void>;
  markRead: (msg: Message) => Promise<void>;
  deleteMsg: (msg: Message) => Promise<void>;
  pruneExpired: () => Promise<void>;
  handleWsPacket: (packet: WsInboundPacket) => void;
}

// Timers: messageId → NodeJS.Timeout
const _timers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleDelete(msg: Message, onDelete: (id: string) => void): void {
  const remaining = msg.expiresAt - Date.now();
  if (remaining <= 0) {
    onDelete(msg.id);
    return;
  }

  const t = setTimeout(() => {
    onDelete(msg.id);
    _timers.delete(msg.id);
  }, remaining);

  _timers.set(msg.id, t);
}

export const useMessageStore = create<MessageState>((set, get) => {
  // ── helpers ──────────────────────────────────────────────────────────────

  const removeFromState = (messageId: string) => {
    set((state) => {
      const updated = { ...state.messagesByChatId };
      for (const chatId of Object.keys(updated)) {
        updated[chatId] = updated[chatId].filter((m) => m.id !== messageId);
      }
      return { messagesByChatId: updated };
    });
  };

  const _deleteMsg = async (msg: Message) => {
    // Cancel any existing timer
    if (_timers.has(msg.id)) {
      clearTimeout(_timers.get(msg.id)!);
      _timers.delete(msg.id);
    }

    // Remove from state
    removeFromState(msg.id);

    // Remove from IndexedDB
    await deleteMessage(msg.id);

    // Notify peer
    wsClient.send({
      type: "READ_RECEIPT",
      to: msg.senderId,
      messageId: msg.id,
      event: "deleted",
    });
  };

  // ── store ─────────────────────────────────────────────────────────────────

  return {
    messagesByChatId: {},

    loadMessages: async (chatId) => {
      const msgs = await getMessages(chatId);

      // Restart expiry timers for already-loaded messages
      for (const m of msgs) {
        if (!m.isRead || m.deletionType === "timed") {
          scheduleDelete(m, (id) => {
            const target = msgs.find((x) => x.id === id);
            if (target) _deleteMsg(target);
          });
        }
      }

      set((s) => ({
        messagesByChatId: { ...s.messagesByChatId, [chatId]: msgs },
      }));
    },

    addInboundMessage: async (msg) => {
      // Persist encrypted form
      await saveMessage(msg);

      // Add to in-memory state
      set((s) => ({
        messagesByChatId: {
          ...s.messagesByChatId,
          [msg.chatId]: [...(s.messagesByChatId[msg.chatId] ?? []), msg],
        },
      }));

      // Schedule auto-expiry
      scheduleDelete(msg, (id) => {
        const m = get().messagesByChatId[msg.chatId]?.find((x) => x.id === id);
        if (m) _deleteMsg(m);
      });
    },

    markRead: async (msg) => {
      const updated: Message = { ...msg, isRead: true };

      // Update in state
      set((s) => ({
        messagesByChatId: {
          ...s.messagesByChatId,
          [msg.chatId]: (s.messagesByChatId[msg.chatId] ?? []).map((m) =>
            m.id === msg.id ? updated : m,
          ),
        },
      }));

      await saveMessage(updated);

      // Send read receipt
      wsClient.send({
        type: "READ_RECEIPT",
        to: msg.senderId,
        messageId: msg.id,
        event: "read",
      });

      if (msg.deletionType === "read_once") {
        await _deleteMsg(msg);
      } else if (msg.deletionType === "burn_on_read") {
        setTimeout(() => _deleteMsg(msg), 5_000);
      }
    },

    deleteMsg: _deleteMsg,

    pruneExpired: async () => {
      const deletedIds = await deleteExpiredMessages();
      deletedIds.forEach(removeFromState);
    },

    handleWsPacket: (_packet) => {
      // Handled in useChat hook – see hooks/useChat.ts
    },
  };
});
