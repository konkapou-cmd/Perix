/**
 * Agora Service - Web Stub
 * Video/Voice calls are not supported on web platform
 * This provides a mock implementation to prevent import errors
 */

class AgoraServiceWeb {
  private initialized = false;
  private eventCallback: ((event: any) => void) | null = null;

  async initialize(): Promise<boolean> {
    console.log("[Agora Web] Video calls are not supported on web platform");
    this.initialized = true;
    return true;
  }

  setEventCallback(callback: (event: any) => void) {
    this.eventCallback = callback;
  }

  async joinVoiceCall(channel: string, token: string, uid: number): Promise<boolean> {
    console.warn("[Agora Web] Voice calls are not supported on web");
    this.eventCallback?.({ error: "Voice calls not supported on web" });
    return false;
  }

  async joinVideoCall(channel: string, token: string, uid: number): Promise<boolean> {
    console.warn("[Agora Web] Video calls are not supported on web");
    this.eventCallback?.({ error: "Video calls not supported on web" });
    return false;
  }

  async leaveChannel(): Promise<void> {
    console.log("[Agora Web] Leave channel (no-op on web)");
  }

  async toggleMute(): Promise<boolean> {
    return false;
  }

  async toggleSpeaker(): Promise<boolean> {
    return false;
  }

  async toggleCamera(): Promise<boolean> {
    return false;
  }

  async switchCamera(): Promise<void> {
    // No-op on web
  }

  destroy(): void {
    this.initialized = false;
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}

const agoraService = new AgoraServiceWeb();
export default agoraService;
