// soundEngine.js — 16-Bit Arcade Music & 6-Speed Engine / Boost / Tire / Crash Audio (Web Audio API)

class ArcadeSoundEngine {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.isStarted = false;
    this.masterGain = null;

    // Engine nodes
    this.engineOsc1 = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.engineFilter = null;

    // Tire screech nodes
    this.screechGain = null;
    this.screechFilter = null;

    // Music sequencer
    this.musicTimer = null;
    this.step = 0;
  }

  init() {
    if (this.isStarted) {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return;
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.isMuted ? 0 : 0.45;
    this.masterGain.connect(this.ctx.destination);

    this._setupEngine();
    this._setupTireScreech();
    this._start16BitMusic();

    this.isStarted = true;
  }

  setMuted(muted) {
    this.isMuted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.45, this.ctx.currentTime, 0.05);
    }
  }

  toggleMute() {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  _setupEngine() {
    const now = this.ctx.currentTime;

    this.engineOsc1 = this.ctx.createOscillator();
    this.engineOsc2 = this.ctx.createOscillator();
    this.engineOsc1.type = 'sawtooth';
    this.engineOsc2.type = 'triangle';
    this.engineOsc1.frequency.setValueAtTime(48, now);
    this.engineOsc2.frequency.setValueAtTime(24, now);

    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.setValueAtTime(180, now);
    this.engineFilter.Q.value = 3.5;

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.setValueAtTime(0.08, now);

    this.engineOsc1.connect(this.engineFilter);
    this.engineOsc2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.masterGain);

    this.engineOsc1.start(now);
    this.engineOsc2.start(now);
  }

  _setupTireScreech() {
    const now = this.ctx.currentTime;
    const bufferSize = this.ctx.sampleRate * 1.5;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;

    this.screechFilter = this.ctx.createBiquadFilter();
    this.screechFilter.type = 'bandpass';
    this.screechFilter.frequency.setValueAtTime(1450, now);
    this.screechFilter.Q.value = 8.0;

    this.screechGain = this.ctx.createGain();
    this.screechGain.gain.setValueAtTime(0, now);

    noise.connect(this.screechFilter);
    this.screechFilter.connect(this.screechGain);
    this.screechGain.connect(this.masterGain);

    noise.start(now);
  }

  // Update engine pitch based on 6-speed gearbox, boost multiplier (x1..x4), and throttle
  updateVehicleAudio({ speed, maxSpeed, gear, boostMultiplier, throttle, isSliding }) {
    if (!this.isStarted || !this.ctx) return;
    const now = this.ctx.currentTime;

    const absSpeed = Math.abs(speed);
    const gearMax = (maxSpeed / 6) * gear;
    const gearMin = (maxSpeed / 6) * (gear - 1);
    const gearProgress = Math.max(0, Math.min(1, (absSpeed - gearMin) / Math.max(1, gearMax - gearMin)));

    // RPM curve per gear + boost pitch lift
    const baseFreq = 44 + gear * 9 + gearProgress * 62 + (boostMultiplier - 1) * 14;
    const throttleBoost = Math.abs(throttle) * 12;

    this.engineOsc1.frequency.setTargetAtTime(baseFreq + throttleBoost, now, 0.05);
    this.engineOsc2.frequency.setTargetAtTime((baseFreq + throttleBoost) * 0.5, now, 0.05);

    const filterCutoff = 160 + gearProgress * 420 + (boostMultiplier - 1) * 140 + Math.abs(throttle) * 180;
    this.engineFilter.frequency.setTargetAtTime(filterCutoff, now, 0.06);

    const vol = 0.07 + Math.abs(throttle) * 0.07 + (absSpeed / maxSpeed) * 0.05;
    this.engineGain.gain.setTargetAtTime(vol, now, 0.06);

    // Tire screech volume
    const targetScreech = isSliding ? 0.12 : 0;
    this.screechGain.gain.setTargetAtTime(targetScreech, now, 0.04);
  }

  playBoostSurge(tier) {
    if (!this.isStarted || !this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    const startFreq = 220 + tier * 70;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(startFreq * 1.65, now + 0.18);

    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.21);
  }

  playCrashLaunch() {
    if (!this.isStarted || !this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;

    // 16-bit impact & comedic upward launch sweep
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.14);
    osc.frequency.exponentialRampToValueAtTime(540, now + 0.45);

    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.5);
  }

  _start16BitMusic() {
    // Upbeat 16-bit arcade driving loop (138 BPM, 16th-note grid)
    const bpm = 138;
    const stepMs = (60 / bpm / 4) * 1000;

    // Lead melody in E minor / G major arcade style (MIDI notes)
    const leadPattern = [
      64, 0, 67, 0, 71, 0, 72, 71,
      69, 0, 67, 0, 64, 0, 59, 0,
      60, 0, 64, 0, 67, 0, 69, 67,
      66, 0, 62, 0, 64, 0, 0, 0
    ];

    const bassPattern = [
      40, 40, 52, 40, 40, 40, 52, 40,
      43, 43, 55, 43, 43, 43, 55, 43,
      36, 36, 48, 36, 36, 36, 48, 36,
      38, 38, 50, 38, 40, 40, 52, 40
    ];

    const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

    this.musicTimer = setInterval(() => {
      if (!this.ctx || this.ctx.state !== 'running' || this.isMuted) return;
      const now = this.ctx.currentTime;
      const idx = this.step % 32;

      // Lead synth
      const leadNote = leadPattern[idx];
      if (leadNote > 0) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(midiToFreq(leadNote), now);
        gain.gain.setValueAtTime(0.055, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.15);
      }

      // 16-bit Bassline
      const bassNote = bassPattern[idx];
      if (bassNote > 0) {
        const bOsc = this.ctx.createOscillator();
        const bGain = this.ctx.createGain();
        bOsc.type = 'triangle';
        bOsc.frequency.setValueAtTime(midiToFreq(bassNote), now);
        bGain.gain.setValueAtTime(0.09, now);
        bGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
        bOsc.connect(bGain);
        bGain.connect(this.masterGain);
        bOsc.start(now);
        bOsc.stop(now + 0.12);
      }

      // 16-bit Hi-hat pulse every 2 steps
      if (idx % 2 === 0) {
        const hatOsc = this.ctx.createOscillator();
        const hatGain = this.ctx.createGain();
        hatOsc.type = 'square';
        hatOsc.frequency.setValueAtTime(idx % 4 === 2 ? 950 : 620, now);
        hatGain.gain.setValueAtTime(0.018, now);
        hatGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
        hatOsc.connect(hatGain);
        hatGain.connect(this.masterGain);
        hatOsc.start(now);
        hatOsc.stop(now + 0.035);
      }

      this.step++;
    }, stepMs);
  }

  destroy() {
    if (this.musicTimer) clearInterval(this.musicTimer);
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
    this.isStarted = false;
  }
}

export const soundEngine = new ArcadeSoundEngine();
export default soundEngine;
