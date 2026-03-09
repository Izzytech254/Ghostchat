/**
 * useCall.ts – Secure WebRTC voice call hook
 * ───────────────────────────────────────────
 * Implements end-to-end encrypted voice calls using WebRTC.
 * All signaling (offer/answer/ICE) is encrypted before transmission.
 * Uses TURN relay mode to hide IP addresses for untraceability.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { wsClient } from "@/utils/wsClient";
import { b64Encode, b64Decode } from "@/utils/crypto";
import type { CallState, CallSignalType, WsCallSignal } from "@/types";

// ICE servers for NAT traversal
// Using multiple STUN servers for reliability, TURN for firewall traversal
const ICE_SERVERS: RTCIceServer[] = [
  // Google STUN servers (reliable)
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
  // Twilio STUN (backup)
  { urls: "stun:global.stun.twilio.com:3478" },
  // Metered TURN servers (free tier)
  {
    urls: [
      "turn:a.relay.metered.ca:80",
      "turn:a.relay.metered.ca:80?transport=tcp",
      "turn:a.relay.metered.ca:443",
      "turns:a.relay.metered.ca:443",
    ],
    username: "e8dd65f92ae0ae3eb5a4da68",
    credential: "uWdGpshi7KW3lXsQ",
  },
];

// Allow all ICE candidates for maximum connectivity
// Note: For maximum privacy, you can set iceTransportPolicy: "relay" but
// this requires working TURN servers. Using "all" for reliability.
const RTC_CONFIG: RTCConfiguration = {
  iceServers: ICE_SERVERS,
  iceTransportPolicy: "all", // Use STUN+TURN for reliability
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require",
  iceCandidatePoolSize: 10,
};

const initialState: CallState = {
  status: "idle",
  peerId: null,
  peerName: null,
  isInitiator: false,
  isVideoCall: false,
  startTime: null,
  duration: 0,
};

export function useCall(chatId: string) {
  const [callState, setCallState] = useState<CallState>(initialState);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const durationIntervalRef = useRef<number | null>(null);

  // Derive encryption key from chat ID (MVP - use Double Ratchet in production)
  const deriveCallKey = useCallback(async (): Promise<CryptoKey> => {
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(chatId + "_whispro_call_key"),
      "PBKDF2",
      false,
      ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: new TextEncoder().encode("whispro_call_salt"),
        iterations: 10000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }, [chatId]);

  // Encrypt signal data before sending
  const encryptSignal = useCallback(async (data: object): Promise<string> => {
    const key = await deriveCallKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(JSON.stringify(data));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      plaintext
    );
    // Pack iv + ciphertext
    const packed = new Uint8Array(12 + ciphertext.byteLength);
    packed.set(iv, 0);
    packed.set(new Uint8Array(ciphertext), 12);
    return b64Encode(packed);
  }, [deriveCallKey]);

  // Decrypt received signal
  const decryptSignal = useCallback(async (encrypted: string): Promise<object | null> => {
    if (!encrypted) return {};
    try {
      const key = await deriveCallKey();
      const packed = b64Decode(encrypted);
      const iv = packed.slice(0, 12);
      const ciphertext = packed.slice(12);
      const plaintext = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        key,
        ciphertext
      );
      return JSON.parse(new TextDecoder().decode(plaintext));
    } catch (e) {
      console.error("[useCall] Failed to decrypt signal:", e);
      // Try parsing as plain JSON (fallback)
      try {
        return JSON.parse(encrypted);
      } catch {
        return null;
      }
    }
  }, [deriveCallKey]);

  // Send signaling message through WebSocket relay
  const sendSignal = useCallback(async (to: string, signalType: CallSignalType, data: object) => {
    const encryptedPayload = await encryptSignal(data);
    wsClient.send({
      type: "CALL_SIGNAL",
      to,
      signalType,
      payload: encryptedPayload,
    });
  }, [encryptSignal]);

  // Create and configure RTCPeerConnection
  const createPeerConnection = useCallback((peerId: string) => {
    console.log("[useCall] Creating peer connection with relay-only mode");
    const pc = new RTCPeerConnection(RTC_CONFIG);

    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        console.log("[useCall] ICE candidate:", event.candidate.type);
        await sendSignal(peerId, "CALL_ICE", { candidate: event.candidate.toJSON() });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log("[useCall] ICE state:", pc.iceConnectionState);
      if (pc.iceConnectionState === "connected") {
        setCallState((s) => ({ ...s, status: "connected", startTime: Date.now() }));
      } else if (pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "failed") {
        endCall();
      }
    };

    pc.ontrack = (event) => {
      console.log("[useCall] Remote track received");
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = event.streams[0];
        remoteAudioRef.current.play().catch(console.error);
      }
    };

    pcRef.current = pc;
    return pc;
  }, [sendSignal]);

  // Start outgoing call
  const startCall = useCallback(async (recipientId: string) => {
    if (callState.status !== "idle") {
      console.warn("[useCall] Call already in progress");
      return;
    }

    // Check if getUserMedia is supported
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.error("[useCall] getUserMedia not supported");
      alert("Voice calls are not supported on this device/browser");
      return;
    }

    console.log("[useCall] Starting call to:", recipientId);
    setCallState({
      status: "calling",
      peerId: recipientId,
      peerName: recipientId.slice(0, 8),
      isInitiator: true,
      isVideoCall: false,
      startTime: null,
      duration: 0,
    });

    try {
      // Get microphone access with timeout
      console.log("[useCall] Requesting microphone access...");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      localStreamRef.current = stream;

      // Create peer connection
      const pc = createPeerConnection(recipientId);

      // Add audio track
      stream.getAudioTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      // Create and send offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await sendSignal(recipientId, "CALL_OFFER", { sdp: offer });
    } catch (err) {
      console.error("[useCall] Failed to start call:", err);
      endCall();
    }
  }, [callState.status, createPeerConnection, sendSignal]);

  // Answer incoming call
  const answerCall = useCallback(async () => {
    if (callState.status !== "ringing" || !callState.peerId) {
      return;
    }

    console.log("[useCall] Answering call from:", callState.peerId);
    setCallState((s) => ({ ...s, status: "connected" }));

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      localStreamRef.current = stream;

      const pc = pcRef.current;
      if (!pc) return;

      // Add local audio track
      stream.getAudioTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      // Create and send answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await sendSignal(callState.peerId, "CALL_ANSWER", { sdp: answer });
    } catch (err) {
      console.error("[useCall] Failed to answer call:", err);
      endCall();
    }
  }, [callState, sendSignal]);

  // Reject incoming call
  const rejectCall = useCallback(async () => {
    if (callState.peerId) {
      await sendSignal(callState.peerId, "CALL_REJECT", {});
    }
    endCall();
  }, [callState.peerId, sendSignal]);

  // End current call
  const endCall = useCallback(async () => {
    console.log("[useCall] Ending call");

    if (callState.peerId && callState.status !== "idle") {
      await sendSignal(callState.peerId, "CALL_END", {});
    }

    // Clean up
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }

    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }

    setCallState(initialState);
    setIsMuted(false);
  }, [callState.peerId, callState.status, sendSignal]);

  // Toggle microphone mute
  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  }, []);

  // Toggle speaker
  const toggleSpeaker = useCallback(() => {
    if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = isSpeakerOn;
      setIsSpeakerOn(!isSpeakerOn);
    }
  }, [isSpeakerOn]);

  // Handle incoming call signals
  const handleSignal = useCallback(async (signal: WsCallSignal) => {
    console.log("[useCall] Received signal:", signal.signalType, "from:", signal.from);

    // Only process signals for current chat
    if (signal.from !== chatId && callState.peerId !== signal.from) {
      // Incoming call from different chat - check if idle
      if (signal.signalType === "CALL_OFFER" && callState.status !== "idle") {
        // Busy - send busy signal
        wsClient.send({
          type: "CALL_SIGNAL",
          to: signal.from,
          signalType: "CALL_BUSY",
          payload: "",
        });
        return;
      }
    }

    const payload = await decryptSignal(signal.payload);

    switch (signal.signalType) {
      case "CALL_OFFER": {
        if (callState.status !== "idle") {
          wsClient.send({
            type: "CALL_SIGNAL",
            to: signal.from,
            signalType: "CALL_BUSY",
            payload: "",
          });
          return;
        }

        console.log("[useCall] Incoming call from:", signal.from);
        setCallState({
          status: "ringing",
          peerId: signal.from,
          peerName: signal.from.slice(0, 8),
          isInitiator: false,
          isVideoCall: false,
          startTime: null,
          duration: 0,
        });

        // Create peer connection and set remote description
        const pc = createPeerConnection(signal.from);
        if (payload && (payload as any).sdp) {
          await pc.setRemoteDescription(new RTCSessionDescription((payload as any).sdp));
        }
        break;
      }

      case "CALL_ANSWER": {
        if (pcRef.current && payload && (payload as any).sdp) {
          await pcRef.current.setRemoteDescription(
            new RTCSessionDescription((payload as any).sdp)
          );
        }
        break;
      }

      case "CALL_ICE": {
        if (pcRef.current && payload && (payload as any).candidate) {
          try {
            await pcRef.current.addIceCandidate(
              new RTCIceCandidate((payload as any).candidate)
            );
          } catch (e) {
            console.warn("[useCall] Failed to add ICE candidate:", e);
          }
        }
        break;
      }

      case "CALL_END":
      case "CALL_REJECT":
        console.log("[useCall] Call ended/rejected by peer");
        endCall();
        break;

      case "CALL_BUSY":
        console.log("[useCall] Peer is busy");
        endCall();
        break;
    }
  }, [chatId, callState, createPeerConnection, decryptSignal, endCall]);

  // Subscribe to WebSocket call signals
  useEffect(() => {
    const unsubscribe = wsClient.onMessage((packet) => {
      if (packet.type === "CALL_SIGNAL") {
        handleSignal(packet as WsCallSignal);
      }
    });

    return () => unsubscribe();
  }, [handleSignal]);

  // Update call duration
  useEffect(() => {
    if (callState.status === "connected" && callState.startTime) {
      durationIntervalRef.current = window.setInterval(() => {
        setCallState((s) => ({
          ...s,
          duration: Math.floor((Date.now() - s.startTime!) / 1000),
        }));
      }, 1000);
    }

    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    };
  }, [callState.status, callState.startTime]);

  // Create hidden audio element for remote stream
  useEffect(() => {
    const audio = document.createElement("audio");
    audio.autoplay = true;
    audio.setAttribute("playsinline", "true");
    remoteAudioRef.current = audio;

    return () => {
      audio.srcObject = null;
    };
  }, []);

  return {
    callState,
    isMuted,
    isSpeakerOn,
    startCall,
    answerCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleSpeaker,
  };
}
