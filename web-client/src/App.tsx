import { useEffect, useState, useRef } from "react";
import { useAccountStore } from "@/store/accountStore";
import { useMessageStore } from "@/store/messageStore";
import { wsClient } from "@/utils/wsClient";
import { getChats, saveChat } from "@/utils/storage";
import { playNotificationSound, showNotification } from "@/utils/sounds";
import { v4 as uuid } from "uuid";
import clsx from "clsx";
import ChatList from "@/components/Chat/ChatList";
import ChatWindow from "@/components/Chat/ChatWindow";
import AuthScreen from "@/components/Auth/AuthScreen";
import SettingsPanel from "@/components/Settings/SettingsPanel";
import WhisproLogo from "@/components/WhisproLogo";
import { CallProvider } from "@/contexts/CallContext";
import GlobalCallOverlay from "@/components/Chat/GlobalCallOverlay";
import { ToastContainer, useToastStore } from "@/components/UI/ToastNotification";
import type { WsInboundPacket, Message } from "@/types";
import styles from "./App.module.css";

type View = "chat" | "settings";

export default function App() {
  const account = useAccountStore((s) => s.account);
  const isUnlocked = useAccountStore((s) => s.isUnlocked);
  const loadAccount = useAccountStore((s) => s.loadAccount);
  const { addInboundMessage } = useMessageStore();
  const showToast = useToastStore((s) => s.showToast);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const activeChatIdRef = useRef<string | null>(null);
  const [view, setView] = useState<View>("chat");
  const [chatRefreshKey, setChatRefreshKey] = useState(0);

  // Keep ref in sync so the WS handler closure always sees the latest active chat
  useEffect(() => { activeChatIdRef.current = activeChatId; }, [activeChatId]);

  // Load account from IndexedDB on startup
  useEffect(() => {
    loadAccount();
  }, []);

  // Request notification permission early (browser only - native handled separately)
  useEffect(() => {
    if (account && isUnlocked && typeof Notification !== 'undefined' && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, [account, isUnlocked]);

  // Connect WebSocket once account is available
  useEffect(() => {
    if (account && isUnlocked) {
      // Use stored deviceId or generate one per-session
      const deviceId =
        sessionStorage.getItem("wp_device") ??
        (() => {
          const id = uuid();
          sessionStorage.setItem("wp_device", id);
          return id;
        })();

      console.log(
        "[Whispro] Connecting WebSocket as:",
        account.id,
        "username:",
        account.username,
      );
      wsClient.connect(account.id, deviceId);
    }
    return () => wsClient.disconnect();
  }, [account?.id, isUnlocked]);

  // Global message handler - creates chats for new senders
  useEffect(() => {
    if (!account || !isUnlocked) return;

    const handleMessage = async (packet: WsInboundPacket) => {
      console.log("[Whispro] WS Packet received:", packet);

      if (packet.type !== "MESSAGE") return;

      const senderId = packet.from;

      // Find or create chat for this sender
      const chats = await getChats();
      let chat = chats.find((c) => c.participantIds.includes(senderId));

      if (!chat) {
        // Create new chat for this sender
        chat = {
          id: uuid(),
          type: "private",
          name: senderId.slice(0, 8), // Will be updated when we lookup username
          participantIds: [senderId],
          defaultTtlMs: 86_400_000,
          createdAt: Date.now(),
        };
        await saveChat(chat);
        setChatRefreshKey((k) => k + 1); // Trigger ChatList refresh
      }

      // Parse message content
      let plaintext = packet.content;
      try {
        const parsed = JSON.parse(packet.content);
        if (parsed.text) plaintext = parsed.text;
      } catch {
        // Use content as-is
      }

      const msg: Message = {
        id: packet.id,
        chatId: chat.id,
        senderId: senderId,
        content: packet.content,
        plaintextCache: plaintext,
        createdAt: packet.deliveredAt,
        expiresAt: packet.expiresAt,
        deletionType: packet.deletionType,
        isRead: false,
        isOwn: false,
      };

      await addInboundMessage(msg);

      // Always play sound
      playNotificationSound();

      // Show in-app toast if the user isn't already looking at this chat
      const isViewingThisChat = activeChatIdRef.current === chat.id;
      if (!isViewingThisChat) {
        const senderLabel = chat.name || senderId.slice(0, 8);
        const preview = plaintext.length > 80 ? plaintext.slice(0, 80) + "…" : plaintext;
        showToast({
          title: senderLabel,
          message: preview,
          avatarLetter: senderLabel.charAt(0).toUpperCase(),
          onClick: () => {
            setActiveChatId(chat!.id);
            setView("chat");
          },
        });
      }

      // Also fire OS notification when app is backgrounded
      if (!document.hasFocus()) {
        showNotification(
          chat.name || senderId.slice(0, 8),
          plaintext.length > 100 ? plaintext.slice(0, 100) + "..." : plaintext,
          `msg-${senderId}`
        );
      }
    };

    const unsub = wsClient.onMessage(handleMessage);
    return unsub;
  }, [account?.id, isUnlocked, addInboundMessage]);

  // Debug: log render state
  console.log("[App] render - account:", account?.username, "isUnlocked:", isUnlocked);

  if (!account || !isUnlocked) {
    return (
      <>
        <ToastContainer />
        <AuthScreen />
      </>
    );
  }

  return (
    <CallProvider>
      <div className={clsx(styles.app, activeChatId && styles.hasChatOpen)}>
        {/* ── Sidebar ── */}
        <aside className={styles.sidebar}>
          <header className={styles.sidebarHeader}>
            <span className={styles.logo}>
              <WhisproLogo size={22} animated={false} />
              Whispro<span className={styles.logoAccent}></span>
            </span>
            <button
              className={styles.iconBtn}
              title="Settings"
              onClick={() => setView("settings")}
            >
              ⚙
            </button>
          </header>

          {view === "chat" ? (
            <ChatList
              key={chatRefreshKey}
              activeChatId={activeChatId}
              onSelectChat={(id) => {
                setActiveChatId(id);
                setView("chat");
              }}
            />
          ) : (
            <SettingsPanel onClose={() => setView("chat")} />
          )}
        </aside>

        {/* ── Main pane ── */}
        <main className={styles.main}>
          {activeChatId ? (
            <ChatWindow
              chatId={activeChatId}
              onBack={() => setActiveChatId(null)}
            />
          ) : (
            <div className={styles.emptyState}>
              <div className={styles.whisproIcon}>
                <WhisproLogo size={110} animated />
              </div>
              <p>Select a chat or start a new one</p>
              <p className={styles.sub}>Whisper Without Worry</p>
            </div>
          )}
        </main>

        {/* Global incoming call overlay */}
        <GlobalCallOverlay />

        {/* In-app toast notifications */}
        <ToastContainer />
      </div>
    </CallProvider>
  );
}
