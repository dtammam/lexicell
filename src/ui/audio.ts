/**
 * Lexicell's audio engine (Dean, 2026-09-10): procedural Web Audio sound effects plus a gapless
 * music loop, all synthesized or decoded in the browser. No audio library ships to the device
 * (CLAUDE.md dependency rule): this is the native Web Audio API and nothing else.
 *
 * Everything is guarded. If window.AudioContext is absent (tests, SSR) every method is a safe
 * no-op and never throws, so importing this module in a unit test does nothing. The mapping from
 * game state to effect names lives in audio-events.ts, which is pure and tested; this file is the
 * output stage and is not unit-tested (jsdom has no audio).
 *
 * The AudioContext is created lazily on the first user gesture (unlock()), because browsers,
 * iOS Safari especially, refuse to start audio before one.
 */

export type SfxName =
  | 'tileSelect'
  | 'tileDeselect'
  | 'wordLand'
  | 'damage'
  | 'defeat'
  | 'win'
  | 'lose'
  | 'itemPick'
  | 'curseTaken'
  | 'tap';

/** One oscillator voice inside an effect. Times are seconds from the moment the effect plays. */
interface Voice {
  readonly type: OscillatorType;
  readonly freq: number;
  /** Optional exponential glide target; the pitch slides from freq to this across the voice. */
  readonly glideTo?: number;
  readonly start: number;
  readonly dur: number;
  /** Peak gain, 0..1. Kept low on purpose: these stack and must never spike. */
  readonly gain: number;
}

/** A short burst of filtered white noise, for thuds and clicks. */
interface NoiseSpec {
  readonly start: number;
  readonly dur: number;
  readonly gain: number;
  /** Lowpass cutoff in Hz. Keeps the noise soft, no harsh high-frequency hiss. */
  readonly cutoff: number;
}

interface SfxSpec {
  readonly voices: readonly Voice[];
  readonly noise?: NoiseSpec;
}

/**
 * Per-effect synthesis, tuned to feel comforting and precise, not annoying. This is the one table
 * to edit when tuning by ear: frequencies in Hz, durations in seconds, gains 0..1. Notes named for
 * reference use the equal-tempered scale (A4 = 440).
 */
const SFX: Readonly<Record<SfxName, SfxSpec>> = {
  // A short high triangle blip on selecting a tile.
  tileSelect: { voices: [{ type: 'triangle', freq: 880, start: 0, dur: 0.07, gain: 0.16 }] },
  // A touch lower on deselect, so ear tells them apart.
  tileDeselect: { voices: [{ type: 'triangle', freq: 620, start: 0, dur: 0.07, gain: 0.14 }] },
  // A pleasant two-note chime when a word lands (C5 then G5).
  wordLand: {
    voices: [
      { type: 'triangle', freq: 523.25, start: 0, dur: 0.16, gain: 0.16 },
      { type: 'triangle', freq: 783.99, start: 0.08, dur: 0.18, gain: 0.16 },
    ],
  },
  // A short filtered-noise thud with a low sine underneath, for taking a hit.
  damage: {
    voices: [{ type: 'sine', freq: 130, glideTo: 90, start: 0, dur: 0.14, gain: 0.22 }],
    noise: { start: 0, dur: 0.1, gain: 0.24, cutoff: 480 },
  },
  // A descending blip when an enemy is killed.
  defeat: { voices: [{ type: 'triangle', freq: 660, glideTo: 220, start: 0, dur: 0.22, gain: 0.18 }] },
  // A short rising arpeggio on a run win (C5 E5 G5 C6).
  win: {
    voices: [
      { type: 'triangle', freq: 523.25, start: 0.0, dur: 0.12, gain: 0.16 },
      { type: 'triangle', freq: 659.25, start: 0.09, dur: 0.12, gain: 0.16 },
      { type: 'triangle', freq: 783.99, start: 0.18, dur: 0.12, gain: 0.16 },
      { type: 'triangle', freq: 1046.5, start: 0.27, dur: 0.2, gain: 0.16 },
    ],
  },
  // A low descending tone on a loss.
  lose: { voices: [{ type: 'sine', freq: 220, glideTo: 98, start: 0, dur: 0.5, gain: 0.2 }] },
  // A soft pluck when an organelle is picked up.
  itemPick: { voices: [{ type: 'triangle', freq: 440, start: 0, dur: 0.16, gain: 0.15 }] },
  // A darker, dissonant low tone for taking a cursed pick (a minor second beating low).
  curseTaken: {
    voices: [
      { type: 'sawtooth', freq: 138.59, start: 0, dur: 0.38, gain: 0.12 },
      { type: 'sine', freq: 130.81, start: 0, dur: 0.4, gain: 0.14 },
    ],
  },
  // A subtle UI click.
  tap: {
    voices: [{ type: 'triangle', freq: 1000, start: 0, dur: 0.03, gain: 0.06 }],
    noise: { start: 0, dur: 0.02, gain: 0.05, cutoff: 2200 },
  },
};

/** How quickly master gain changes settle (setTargetAtTime time constant), so mute/volume never click. */
const GAIN_SETTLE = 0.02;
const MUSIC_FADE = 1.2;

type ACtor = typeof AudioContext;
function audioContextCtor(): ACtor | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { AudioContext?: ACtor; webkitAudioContext?: ACtor };
  return w.AudioContext ?? w.webkitAudioContext;
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private muted = false;
  private volume = 0.7;

  private musicBuffer: AudioBuffer | null = null;
  private musicSource: AudioBufferSourceNode | null = null;
  private musicLoading: Promise<void> | null = null;
  /** startMusic() called before the buffer finished decoding: begin as soon as it lands. */
  private wantMusic = false;

  /** True once the AudioContext exists. Every method below is a no-op until then. */
  get ready(): boolean {
    return this.ctx !== null;
  }

  /**
   * Create and resume the AudioContext. Call from the first pointer/click; browsers block audio
   * before a gesture. Safe to call repeatedly. A no-op where Web Audio is unavailable.
   */
  unlock(): void {
    if (this.ctx) {
      // A context can be suspended again (tab backgrounded); a later gesture resumes it.
      void this.ctx.resume().catch(() => undefined);
      if (this.wantMusic) this.playMusicSource();
      return;
    }
    const Ctor = audioContextCtor();
    if (!Ctor) return;
    try {
      const ctx = new Ctor();
      const master = ctx.createGain();
      const sfxGain = ctx.createGain();
      const musicGain = ctx.createGain();
      master.gain.value = this.muted ? 0 : this.volume;
      sfxGain.gain.value = 1;
      musicGain.gain.value = 0; // music fades in when it starts
      sfxGain.connect(master);
      musicGain.connect(master);
      master.connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
      this.sfxGain = sfxGain;
      this.musicGain = musicGain;
      void ctx.resume().catch(() => undefined);
      if (this.wantMusic) this.playMusicSource();
    } catch {
      // A browser that refuses construction gets a silent, still-functional no-op engine.
      this.ctx = null;
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyMasterGain();
  }

  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
    this.applyMasterGain();
  }

  private applyMasterGain(): void {
    if (!this.ctx || !this.master) return;
    const target = this.muted ? 0 : this.volume;
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, GAIN_SETTLE);
  }

  /** Synthesize and play a named effect. No-op before unlock, or when muted. */
  playSfx(name: SfxName): void {
    if (!this.ctx || !this.sfxGain || this.muted) return;
    const spec = SFX[name];
    if (!spec) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    for (const v of spec.voices) this.playVoice(v, now);
    if (spec.noise) this.playNoise(spec.noise, now);
  }

  private playVoice(v: Voice, now: number): void {
    const ctx = this.ctx;
    const sink = this.sfxGain;
    if (!ctx || !sink) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = v.type;
    const t0 = now + v.start;
    const t1 = t0 + v.dur;
    osc.frequency.setValueAtTime(v.freq, t0);
    if (v.glideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, v.glideTo), t1);
    // A fast ADSR: a few-ms attack, then an exponential fall to silence. exponentialRamp cannot
    // reach 0, so it falls to a floor and a final setValueAtTime snaps it to 0.
    const attack = Math.min(0.008, v.dur * 0.3);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(v.gain, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t1);
    gain.gain.setValueAtTime(0, t1);
    osc.connect(gain).connect(sink);
    osc.start(t0);
    osc.stop(t1 + 0.02);
  }

  private playNoise(n: NoiseSpec, now: number): void {
    const ctx = this.ctx;
    const sink = this.sfxGain;
    if (!ctx || !sink) return;
    const src = ctx.createBufferSource();
    src.buffer = this.getNoiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = n.cutoff;
    const gain = ctx.createGain();
    const t0 = now + n.start;
    const t1 = t0 + n.dur;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(n.gain, t0 + Math.min(0.004, n.dur * 0.3));
    gain.gain.exponentialRampToValueAtTime(0.0001, t1);
    gain.gain.setValueAtTime(0, t1);
    src.connect(filter).connect(gain).connect(sink);
    src.start(t0);
    src.stop(t1 + 0.02);
  }

  /** One second of white noise, cached and reused across every noisy effect. */
  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer) return this.noiseBuffer;
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;
    return buf;
  }

  /**
   * Fetch and decode a music track into an AudioBuffer so it can loop gaplessly (decode-then-loop,
   * not <audio loop>, which restarts with a click). A 404 or a decode failure leaves music silently
   * off; SFX and the rest of the engine are unaffected. Safe to call before or after unlock.
   */
  loadMusic(url: string): Promise<void> {
    if (this.musicLoading) return this.musicLoading;
    if (typeof fetch === 'undefined') return Promise.resolve();
    this.musicLoading = (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) return; // no track dropped in yet: stay silently off
        const bytes = await res.arrayBuffer();
        const ctx = this.ctx ?? this.makeDecodeContext();
        if (!ctx) return;
        this.musicBuffer = await ctx.decodeAudioData(bytes);
        if (this.wantMusic) this.playMusicSource();
      } catch {
        // Absent file, network error, or undecodable audio: music simply does not play.
        this.musicBuffer = null;
      }
    })();
    return this.musicLoading;
  }

  /** Decode may be wanted before a gesture; a throwaway context lets us decode without playing. */
  private makeDecodeContext(): AudioContext | null {
    const Ctor = audioContextCtor();
    if (!Ctor) return null;
    try {
      return new Ctor();
    } catch {
      return null;
    }
  }

  /** Begin (or resume wanting) the looped track, fading in on the music bus. */
  startMusic(): void {
    this.wantMusic = true;
    this.playMusicSource();
  }

  private playMusicSource(): void {
    if (!this.ctx || !this.musicGain || !this.musicBuffer || this.musicSource) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.musicBuffer;
    src.loop = true; // gapless: the AudioBuffer wraps at the sample, no gap, no click
    src.connect(this.musicGain);
    const now = ctx.currentTime;
    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setValueAtTime(Math.max(0.0001, this.musicGain.gain.value), now);
    this.musicGain.gain.linearRampToValueAtTime(0.6, now + MUSIC_FADE);
    src.start();
    this.musicSource = src;
  }

  /** Fade the track out and stop it. Safe to call when nothing is playing. */
  stopMusic(): void {
    this.wantMusic = false;
    if (!this.ctx || !this.musicGain || !this.musicSource) return;
    const ctx = this.ctx;
    const src = this.musicSource;
    this.musicSource = null;
    const now = ctx.currentTime;
    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, now);
    this.musicGain.gain.linearRampToValueAtTime(0.0001, now + MUSIC_FADE);
    try {
      src.stop(now + MUSIC_FADE + 0.05);
    } catch {
      // Already stopped.
    }
  }
}

/** The single shared engine. One AudioContext for the app. */
export const audio = new AudioEngine();
