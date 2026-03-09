// Platform-specific Agora service index
// Metro will resolve based on platform:
// - Web: agoraService.web.ts (no native dependencies)
// - Native: agoraService.native.ts (full Agora SDK)

export interface AgoraCallState {
  isJoined: boolean;
  remoteUid: number | null;
  isMuted: boolean;
  isVideoEnabled: boolean;
  isSpeakerOn: boolean;
  error?: string;
}

export type AgoraEventCallback = (state: Partial<AgoraCallState>) => void;

// Stub class for type safety - actual implementation loaded per platform
class AgoraServiceStub {
  async initialize(): Promise<boolean> { return false; }
  setEventCallback(callback: AgoraEventCallback) {}
  async joinVoiceCall(channel: string, token: string, uid: number): Promise<boolean> { return false; }
  async joinVideoCall(channel: string, token: string, uid: number): Promise<boolean> { return false; }
  async leaveChannel(): Promise<void> {}
  async toggleMute(): Promise<boolean> { return false; }
  async toggleSpeaker(): Promise<boolean> { return false; }
  async toggleCamera(): Promise<boolean> { return false; }
  async switchCamera(): Promise<void> {}
  destroy(): void {}
  isInitialized(): boolean { return false; }
}

const agoraService = new AgoraServiceStub();
export default agoraService;
