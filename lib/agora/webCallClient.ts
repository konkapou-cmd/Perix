/**
 * Agora Web call client built on agora-rtc-sdk-ng.
 * Web-only module — always imported dynamically so native bundling is unaffected.
 */
type WebCallEvents = {
  onJoined?: () => void;
  onRemoteJoined?: (uid: number) => void;
  onRemoteLeft?: (uid: number) => void;
  onDisconnected?: () => void;
  onError?: (message: string) => void;
};

type TrackState = {
  isMuted: boolean;
  isVideoEnabled: boolean;
};

export class AgoraWebCallClient {
  private client: any = null;
  private audioTrack: any = null;
  private cameraTrack: any = null;
  private events: WebCallEvents = {};
  private joined = false;

  setEvents(events: WebCallEvents) {
    this.events = events;
  }

  async join(channel: string, token: string, uid: number, enableVideo: boolean, appId: string): Promise<void> {
    const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;
    if (!this.client) {
      this.client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
      this.bindClientEvents();
    }
    if (this.joined) return;

    await this.client.join(appId, channel, token, uid);

    this.audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
    await this.client.publish(this.audioTrack);

    if (enableVideo) {
      this.cameraTrack = await AgoraRTC.createCameraVideoTrack();
      await this.client.publish(this.cameraTrack);
    }

    this.joined = true;
    this.events.onJoined?.();
  }

  private bindClientEvents() {
    const client = this.client;
    client.on("user-published", async (user: any, mediaType: "audio" | "video") => {
      try {
        await client.subscribe(user, mediaType);
        if (mediaType === "video") {
          this.events.onRemoteJoined?.(Number(user.uid));
        }
        if (mediaType === "audio") {
          user.audioTrack?.play();
        }
      } catch (e) {
        console.warn("[Agora Web] subscribe failed", e);
      }
    });
    client.on("user-unpublished", (user: any, mediaType: "audio" | "video") => {
      if (mediaType === "video") {
        this.events.onRemoteLeft?.(Number(user.uid));
      }
    });
    client.on("user-left", (user: any) => {
      this.events.onRemoteLeft?.(Number(user.uid));
    });
    client.on("connection-state-change", (curState: string) => {
      if (curState === "DISCONNECTED" || curState === "FAILED") {
        this.joined = false;
        this.events.onDisconnected?.();
      }
    });
  }

  getRemoteTrack(uid: number): any {
    return this.client?.remoteUsers?.find((u: any) => Number(u.uid) === uid)?.videoTrack ?? null;
  }

  getLocalVideoTrack(): any {
    return this.cameraTrack;
  }

  playLocalVideo(element: HTMLElement) {
    this.cameraTrack?.play(element);
  }

  playRemoteVideo(uid: number, element: HTMLElement) {
    const track = this.getRemoteTrack(uid);
    track?.play(element);
  }

  toggleMute(): boolean {
    if (!this.audioTrack) return false;
    const next = this.audioTrack.enabled;
    this.audioTrack.setEnabled(!next);
    return !next;
  }

  isMuted(): boolean {
    return this.audioTrack ? !this.audioTrack.enabled : false;
  }

  toggleVideo(): boolean {
    if (!this.cameraTrack) return false;
    const next = this.cameraTrack.enabled;
    this.cameraTrack.setEnabled(!next);
    return !next;
  }

  isVideoEnabled(): boolean {
    return this.cameraTrack ? this.cameraTrack.enabled : false;
  }

  toggleSpeaker(): boolean {
    // Web uses the default output device; keep a stateful no-op for UI parity.
    return true;
  }

  async leave(): Promise<void> {
    try {
      this.audioTrack?.close();
      this.cameraTrack?.close();
      if (this.client && this.joined) {
        await this.client.leave();
      }
    } catch (e) {
      console.warn("[Agora Web] leave error", e);
    } finally {
      this.audioTrack = null;
      this.cameraTrack = null;
      this.joined = false;
    }
  }

  destroy(): void {
    this.leave();
    this.client?.removeAllListeners?.();
    this.client = null;
  }
}

let webCallClient: AgoraWebCallClient | null = null;

export function getWebCallClient(): AgoraWebCallClient {
  if (!webCallClient) {
    webCallClient = new AgoraWebCallClient();
  }
  return webCallClient;
}

export function releaseWebCallClient(): void {
  webCallClient?.destroy();
  webCallClient = null;
}
