/**
 * CallContext.tsx – Global call state provider
 * ─────────────────────────────────────────────
 * Provides call functionality across entire app so incoming
 * calls are detected even when not in the specific chat.
 */

import { createContext, useContext, ReactNode } from "react";
import { useGlobalCall } from "@/hooks/useGlobalCall";
import type { CallState } from "@/types";

interface CallContextValue {
  callState: CallState;
  isMuted: boolean;
  isSpeakerOn: boolean;
  isVideoEnabled: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  startCall: (recipientId: string, peerName?: string, withVideo?: boolean) => Promise<void>;
  answerCall: () => Promise<void>;
  rejectCall: () => Promise<void>;
  endCall: () => Promise<void>;
  toggleMute: () => void;
  toggleSpeaker: () => void;
  toggleVideo: () => void;
}

const CallContext = createContext<CallContextValue | null>(null);

export function CallProvider({ children }: { children: ReactNode }) {
  const callApi = useGlobalCall();

  return (
    <CallContext.Provider value={callApi}>
      {children}
    </CallContext.Provider>
  );
}

export function useCallContext() {
  const ctx = useContext(CallContext);
  if (!ctx) {
    throw new Error("useCallContext must be used within CallProvider");
  }
  return ctx;
}
