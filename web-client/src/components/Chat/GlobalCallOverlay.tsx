/**
 * GlobalCallOverlay.tsx – Shows incoming/active call UI regardless of current view
 */
import { useCallContext } from "@/contexts/CallContext";
import CallScreen from "./CallScreen";

export default function GlobalCallOverlay() {
  const {
    callState,
    isMuted,
    isSpeakerOn,
    isVideoEnabled,
    localStream,
    remoteStream,
    answerCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleSpeaker,
    toggleVideo,
  } = useCallContext();

  // Don't render anything if no active call
  if (callState.status === "idle") {
    return null;
  }

  return (
    <CallScreen
      callState={callState}
      peerName={callState.peerName || "Unknown"}
      isMuted={isMuted}
      isSpeakerOn={isSpeakerOn}
      isVideoEnabled={isVideoEnabled}
      localStream={localStream}
      remoteStream={remoteStream}
      onAnswer={answerCall}
      onReject={rejectCall}
      onEnd={endCall}
      onToggleMute={toggleMute}
      onToggleSpeaker={toggleSpeaker}
      onToggleVideo={toggleVideo}
    />
  );
}
