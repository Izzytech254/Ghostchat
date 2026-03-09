/**
 * CallScreen.tsx – Voice/Video call UI overlay
 * ────────────────────────────────────────────
 * Full-screen overlay for outgoing, incoming, and active calls.
 * Supports both audio-only and video calls.
 */

import { useEffect, useState, useRef } from "react";
import type { CallState } from "@/types";
import {
  PhoneIcon,
  PhoneOffIcon,
  MicIcon,
  MicOffIcon,
  SpeakerIcon,
  VideoIcon,
  CloseIcon,
  LockIcon,
  ShieldIcon,
} from "@/components/UI/Icons";
import styles from "./CallScreen.module.css";

interface Props {
  callState: CallState;
  peerName: string;
  isMuted: boolean;
  isSpeakerOn: boolean;
  isVideoEnabled?: boolean;
  localStream?: MediaStream | null;
  remoteStream?: MediaStream | null;
  onAnswer: () => void;
  onReject: () => void;
  onEnd: () => void;
  onToggleMute: () => void;
  onToggleSpeaker: () => void;
  onToggleVideo?: () => void;
}

export default function CallScreen({
  callState,
  peerName,
  isMuted,
  isSpeakerOn,
  isVideoEnabled = true,
  localStream,
  remoteStream,
  onAnswer,
  onReject,
  onEnd,
  onToggleMute,
  onToggleSpeaker,
  onToggleVideo,
}: Props) {
  const [pulseAnim, setPulseAnim] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  // Bind local stream to video element when both are available
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      console.log("[CallScreen] Binding local stream to video element");
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.play().catch(console.error);
    }
  }, [localStream]);

  // Bind remote stream to video element when both are available
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      console.log("[CallScreen] Binding remote stream to video element");
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.play().catch(console.error);
    }
  }, [remoteStream]);

  // Pulse animation for ringing/calling states
  useEffect(() => {
    if (callState.status === "ringing" || callState.status === "calling") {
      const interval = setInterval(() => setPulseAnim((p) => !p), 1000);
      return () => clearInterval(interval);
    }
  }, [callState.status]);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  if (callState.status === "idle" || callState.status === "ended") {
    return null;
  }

  const isVideoCall = callState.isVideoCall;

  return (
    <div className={styles.overlay}>
      <div className={`${styles.container} ${isVideoCall ? styles.videoContainer : ""}`}>
        {/* Video elements for video calls */}
        {isVideoCall && (
          <div className={styles.videoArea}>
            <video
              ref={remoteVideoRef}
              className={styles.remoteVideo}
              autoPlay
              playsInline
              muted={false}
            />
            <video
              ref={localVideoRef}
              className={styles.localVideo}
              autoPlay
              playsInline
              muted
            />
          </div>
        )}

        {/* Avatar / Caller identity (only for audio calls or when video not connected) */}
        {(!isVideoCall || callState.status !== "connected") && (
          <>
            <div className={`${styles.avatar} ${pulseAnim ? styles.pulse : ""}`}>
              <span className={styles.avatarText}>
                {peerName.charAt(0).toUpperCase()}
              </span>
            </div>

            <h2 className={styles.peerName}>{peerName}</h2>
          </>
        )}

        {/* Status text */}
        <p className={styles.status}>
          {callState.status === "calling" && `Calling${isVideoCall ? " (video)" : ""}...`}
          {callState.status === "ringing" && `Incoming ${isVideoCall ? "video" : "voice"} call`}
          {callState.status === "connected" && (
            <>
              <span className={styles.secureBadge}>
                <LockIcon size={14} color="#22c55e" /> Encrypted
              </span>
              <span className={styles.duration}>
                {formatDuration(callState.duration)}
              </span>
            </>
          )}
        </p>

        {/* Controls */}
        <div className={styles.controls}>
          {/* Incoming call: Answer & Reject */}
          {callState.status === "ringing" && (
            <>
              <button
                className={`${styles.controlBtn} ${styles.rejectBtn}`}
                onClick={onReject}
                title="Reject"
              >
                <span className={styles.icon}>
                  <CloseIcon size={24} color="#fff" />
                </span>
                <span className={styles.label}>Decline</span>
              </button>
              <button
                className={`${styles.controlBtn} ${styles.answerBtn}`}
                onClick={onAnswer}
                title="Answer"
              >
                <span className={styles.icon}>
                  <PhoneIcon size={24} color="#fff" />
                </span>
                <span className={styles.label}>Answer</span>
              </button>
            </>
          )}

          {/* Outgoing/Connected: Mute, Video, Speaker, End */}
          {(callState.status === "calling" || callState.status === "connected") && (
            <>
              <button
                className={`${styles.controlBtn} ${isMuted ? styles.active : ""}`}
                onClick={onToggleMute}
                title={isMuted ? "Unmute" : "Mute"}
              >
                <span className={styles.icon}>
                  {isMuted ? <MicOffIcon size={24} color="#fff" /> : <MicIcon size={24} color="#fff" />}
                </span>
                <span className={styles.label}>{isMuted ? "Unmute" : "Mute"}</span>
              </button>

              {isVideoCall && onToggleVideo && (
                <button
                  className={`${styles.controlBtn} ${!isVideoEnabled ? styles.active : ""}`}
                  onClick={onToggleVideo}
                  title={isVideoEnabled ? "Camera off" : "Camera on"}
                >
                  <span className={styles.icon}>
                    <VideoIcon size={24} color="#fff" />
                  </span>
                  <span className={styles.label}>{isVideoEnabled ? "Cam On" : "Cam Off"}</span>
                </button>
              )}

              <button
                className={`${styles.controlBtn} ${styles.endBtn}`}
                onClick={onEnd}
                title="End call"
              >
                <span className={styles.icon}>
                  <PhoneOffIcon size={24} color="#fff" />
                </span>
                <span className={styles.label}>End</span>
              </button>

              <button
                className={`${styles.controlBtn} ${!isSpeakerOn ? styles.active : ""}`}
                onClick={onToggleSpeaker}
                title={isSpeakerOn ? "Speaker off" : "Speaker on"}
              >
                <span className={styles.icon}>
                  <SpeakerIcon size={24} color="#fff" />
                </span>
                <span className={styles.label}>Speaker</span>
              </button>
            </>
          )}
        </div>

        {/* Security notice */}
        <p className={styles.securityNote}>
          <ShieldIcon size={16} color="#22c55e" /> Call is end-to-end encrypted via TURN relay
        </p>
      </div>
    </div>
  );
}
