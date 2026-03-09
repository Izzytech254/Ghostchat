/**
 * useGlobalCall.ts – Global incoming call handler
 * ─────────────────────────────────────────────────
 * Listens for incoming CALL_SIGNAL at app level so calls are detected
 * even when you're not in the specific chat window.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { wsClient } from "@/utils/wsClient";
import { b64Encode, b64Decode } from "@/utils/crypto";
import { startRingtone, stopRingtone, showCallNotification, cancelNotification } from "@/utils/sounds";
import { useAccountStore } from "@/store/accountStore";
import type { CallState, CallSignalType, WsCallSignal } from "@/types";

// ICE servers for NAT traversal
const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:global.stun.twilio.com:3478" },
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

const RTC_CONFIG: RTCConfiguration = {
  iceServers: ICE_SERVERS,
  iceTransportPolicy: "all",
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

export function useGlobalCall() {
  const [callState, setCallState] = useState<CallState>(initialState);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  // Store streams in state for proper React binding
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const durationIntervalRef = useRef<number | null>(null);
  // Keep ref to latest callState so callbacks always see current value
  const callStateRef = useRef<CallState>(initialState);
  useEffect(() => { callStateRef.current = callState; }, [callState]);

  // Derive SYMMETRIC encryption key from SORTED pair of IDs
  // Both caller and callee sort [myId, peerId] → always get the same key
  const deriveCallKey = useCallback(async (peerId: string): Promise<CryptoKey> => {
    const myId = useAccountStore.getState().account?.id ?? "unknown";
    const ids = [myId, peerId].sort();
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(ids.join(":") + "_whispro_call"),
      "PBKDF2",
      false,
      ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: new TextEncoder().encode("whispro_call_salt_v2"),
        iterations: 10000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }, []);

  // Encrypt signal data
  const encryptSignal = useCallback(async (peerId: string, data: object): Promise<string> => {
    const key = await deriveCallKey(peerId);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(JSON.stringify(data));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      plaintext
    );
    const packed = new Uint8Array(12 + ciphertext.byteLength);
    packed.set(iv, 0);
    packed.set(new Uint8Array(ciphertext), 12);
    return b64Encode(packed);
  }, [deriveCallKey]);

  // Decrypt signal
  const decryptSignal = useCallback(async (peerId: string, encrypted: string): Promise<object | null> => {
    if (!encrypted) return {};
    try {
      const key = await deriveCallKey(peerId);
      const packed = b64Decode(encrypted);
      const plaintext = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: packed.slice(0, 12) },
        key,
        packed.slice(12)
      );
      return JSON.parse(new TextDecoder().decode(plaintext));
    } catch {
      // Fallback to plain JSON (unencrypted legacy)
      try { return JSON.parse(encrypted); } catch { return null; }
    }
  }, [deriveCallKey]);

  // Unlock remote audio element inside user-gesture context (button click)
  const unlockAudio = useCallback(() => {
    const audio = remoteAudioRef.current;
    if (!audio) return;
    audio.muted = false;
    audio.play().catch(() => { /* no srcObject yet, ignore */ });
  }, []);

  // Send signal
  const sendSignal = useCallback(async (to: string, signalType: CallSignalType, data: object) => {
    const encryptedPayload = await encryptSignal(to, data);
    console.log("[useGlobalCall] Sending signal:", signalType, "to:", to);
    wsClient.send({
      type: "CALL_SIGNAL",
      to,
      signalType,
      payload: encryptedPayload,
    });
  }, [encryptSignal]);

  // End call – defined early so createPeerConnection / answerCall / rejectCall can reference it
  const endCall = useCallback(async () => {
    console.log("[useGlobalCall] Ending call");

    stopRingtone();
    cancelNotification(9999);

    const cs = callStateRef.current;
    if (cs.peerId && cs.status !== "idle") {
      try { await sendSignal(cs.peerId, "CALL_END", {}); } catch {}
    }

    pcRef.current?.close();
    pcRef.current = null;

    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;

    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }

    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
      remoteAudioRef.current.pause();
    }

    setCallState(initialState);
    setIsMuted(false);
    setLocalStream(null);
    setRemoteStream(null);
  }, [sendSignal]);

  // Create peer connection
  const createPeerConnection = useCallback((peerId: string) => {
    console.log("[useGlobalCall] Creating peer connection to:", peerId);
    const pc = new RTCPeerConnection(RTC_CONFIG);

    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        console.log("[useGlobalCall] ICE candidate:", event.candidate.type);
        await sendSignal(peerId, "CALL_ICE", { candidate: event.candidate.toJSON() });
      }
    };

    pc.oniceconnectionstatechange = () => {
      const s = pc.iceConnectionState;
      console.log("[useGlobalCall] ICE state:", s);
      if (s === "connected" || s === "completed") {
        setCallState((prev) => ({ ...prev, status: "connected", startTime: prev.startTime ?? Date.now() }));
      } else if (s === "failed") {
        console.error("[useGlobalCall] ICE failed");
        endCall();
      } else if (s === "disconnected") {
        // Give 5s to recover before hanging up
        setTimeout(() => { if (pcRef.current?.iceConnectionState === "disconnected") endCall(); }, 5000);
      }
    };

    pc.ontrack = (event) => {
      console.log("[useGlobalCall] Remote track:", event.track.kind);
      if (event.track.kind === "audio") {
        const audio = remoteAudioRef.current;
        if (audio) {
          audio.srcObject = event.streams[0];
          audio.muted = false;
          audio.volume = 1.0;
          audio.play().catch((e) => console.warn("[useGlobalCall] Audio play failed:", e));
        }
      }
      if (event.track.kind === "video") {
        setRemoteStream(event.streams[0]);
      }
    };

    pcRef.current = pc;
    return pc;
  }, [sendSignal]);

  // Start call
  const startCall = useCallback(async (recipientId: string, peerName?: string, withVideo = false) => {
    if (callState.status !== "idle") {
      console.warn("[useGlobalCall] Call already in progress");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      alert("Voice calls not supported on this device");
      return;
    }

    console.log("[useGlobalCall] Starting call to:", recipientId, withVideo ? "(video)" : "(audio)");
    setCallState({
      status: "calling",
      peerId: recipientId,
      peerName: peerName || recipientId.slice(0, 8),
      isInitiator: true,
      isVideoCall: withVideo,
      startTime: null,
      duration: 0,
    });

    try {
      unlockAudio(); // Unlock audio while inside user-gesture context

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: withVideo ? { facingMode: "user", width: 640, height: 480 } : false,
      });
      localStreamRef.current = stream;
      if (withVideo) setLocalStream(stream);

      const pc = createPeerConnection(recipientId);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: withVideo });
      await pc.setLocalDescription(offer);
      await sendSignal(recipientId, "CALL_OFFER", { sdp: pc.localDescription, isVideoCall: withVideo });
    } catch (err) {
      console.error("[useGlobalCall] Failed to start call:", err);
      alert("Could not start call: " + (err instanceof Error ? err.message : String(err)));
      endCall();
    }
  }, [callState.status, createPeerConnection, sendSignal]);

  // Answer call - must be called from user-gesture context (button click)
  const answerCall = useCallback(async () => {
    const cs = callStateRef.current;
    if (cs.status !== "ringing" || !cs.peerId) return;

    stopRingtone();
    cancelNotification(9999);
    console.log("[useGlobalCall] Answering call from:", cs.peerId.slice(0, 8));

    try {
      unlockAudio(); // Unlock audio while in user-gesture context

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: cs.isVideoCall ? { facingMode: "user", width: 640, height: 480 } : false,
      });
      localStreamRef.current = stream;
      if (cs.isVideoCall) setLocalStream(stream);

      const pc = pcRef.current;
      if (!pc) { console.error("[useGlobalCall] No peer connection"); return; }

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await sendSignal(cs.peerId, "CALL_ANSWER", { sdp: pc.localDescription });
      setCallState((s) => ({ ...s, status: "connected", startTime: Date.now() }));
    } catch (err) {
      console.error("[useGlobalCall] Failed to answer:", err);
      endCall();
    }
  }, [unlockAudio, sendSignal, endCall]);

  // Reject call
  const rejectCall = useCallback(async () => {
    stopRingtone();
    cancelNotification(9999);
    const cs = callStateRef.current;
    if (cs.peerId) await sendSignal(cs.peerId, "CALL_REJECT", {});
    endCall();
  }, [sendSignal, endCall]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const track = localStreamRef.current.getAudioTracks()[0];
      if (track) {
        track.enabled = !track.enabled;
        setIsMuted(!track.enabled);
      }
    }
  }, []);

  // Toggle video
  const toggleVideo = useCallback(() => {
    if (localStreamRef.current) {
      const track = localStreamRef.current.getVideoTracks()[0];
      if (track) {
        track.enabled = !track.enabled;
        setIsVideoEnabled(track.enabled);
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

  // Handle incoming signals - THIS IS THE CRITICAL GLOBAL HANDLER
  const handleSignal = useCallback(async (signal: WsCallSignal) => {
    console.log("[useGlobalCall] Received signal:", signal.signalType, "from:", signal.from);

    const payload = await decryptSignal(signal.from, signal.payload);

    switch (signal.signalType) {
      case "CALL_OFFER": {
        if (callState.status !== "idle") {
          // Busy
          wsClient.send({
            type: "CALL_SIGNAL",
            to: signal.from,
            signalType: "CALL_BUSY",
            payload: "",
          });
          return;
        }

        const isVideoCall = !!(payload && (payload as any).isVideoCall === true);
        console.log("[useGlobalCall] Incoming call from:", signal.from, isVideoCall ? "(video)" : "(audio)");
        
        // Create peer connection BEFORE setting state
        const pc = createPeerConnection(signal.from);
        
        // Set remote description with the offer
        if (payload && (payload as any).sdp) {
          await pc.setRemoteDescription(new RTCSessionDescription((payload as any).sdp));
        }

        // NOW set state to ringing
        setCallState({
          status: "ringing",
          peerId: signal.from,
          peerName: signal.from.slice(0, 8),
          isInitiator: false,
          isVideoCall,
          startTime: null,
          duration: 0,
        });

        // Start ringtone and show notification
        startRingtone();
        showCallNotification(signal.from.slice(0, 8));
        break;
      }

      case "CALL_ANSWER": {
        if (pcRef.current && payload && (payload as any).sdp) {
          console.log("[useGlobalCall] Got answer, setting remote description");
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
            console.warn("[useGlobalCall] Failed to add ICE:", e);
          }
        }
        break;
      }

      case "CALL_END":
      case "CALL_REJECT":
        console.log("[useGlobalCall] Call ended by peer");
        endCall();
        break;

      case "CALL_BUSY":
        console.log("[useGlobalCall] Peer is busy");
        endCall();
        break;
    }
  }, [callState.status, createPeerConnection, decryptSignal, endCall]);

  // Subscribe to ALL call signals globally
  useEffect(() => {
    console.log("[useGlobalCall] Setting up global call signal listener");
    const unsubscribe = wsClient.onMessage((packet) => {
      if (packet.type === "CALL_SIGNAL") {
        handleSignal(packet as WsCallSignal);
      }
    });

    return () => unsubscribe();
  }, [handleSignal]);

  // Duration timer
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

  // Create audio element
  useEffect(() => {
    const audio = new Audio();
    audio.autoplay = true;
    audio.setAttribute("playsinline", "true");
    audio.muted = false;
    audio.volume = 1.0;
    remoteAudioRef.current = audio;
    document.body.appendChild(audio);

    return () => {
      audio.srcObject = null;
      audio.pause();
      audio.remove();
    };
  }, []);


  return {
    callState,
    isMuted,
    isSpeakerOn,
    isVideoEnabled,
    localStream,
    remoteStream,
    startCall,
    answerCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleSpeaker,
    toggleVideo,
  };
}
