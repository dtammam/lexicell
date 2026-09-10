/**
 * Lexicell's audio engine (Dean, 2026-09-10): procedural Web Audio sound effects plus a gapless
 * music loop, all synthesized or decoded in the browser. No audio library ships to the device
 * (CLAUDE.md dependency rule): this is the native Web Audio API and nothing else.
 *
 * The effects are deliberately soft (Dean, 2026-09-10, after a first bleepy pass: "too rough, too
 * abrupt, too saw-wave-y, I need it subtle, calm, not annoying"). So: sine bodies, muffled filtered
 * noise for the tactile thup of a card on felt, gentle attacks and long soft releases, a lowpass over
 * the whole bus so nothing is bright, low gains, and a small reverb for air so nothing is dry. The
 * per-effect parameters in renderSfx are the one place to tune by ear; this exact synthesis was
 * approved from the tap-to-hear Sound Kit before it landed here.
 *
 * Everything is guarded. If window.AudioContext is absent (tests, SSR) every method is a safe
 * no-op and never throws, so importing this module in a unit test does nothing. The mapping from
 * game state to effect names lives in audio-events.ts, which is pure and tested; this file is the
 * output stage and is not unit-tested (jsdom has no audio).
 *
 * The AudioContext is created lazily on the first user gesture (unlock()), because browsers,
 * iOS Safari especially, refuse to start audio before one.
 *
 * Two independent user buses (Dean, 2026-09-10, Settings page): sound effects and music each carry
 * their own mute and volume. The master node is a fixed unity passthrough; the two user gains below
 * it are what the settings drive, so muting one never touches the other.
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

/** A soft sine (or triangle) body: gentle attack, long exponential release, its own lowpass. */
interface ToneOpts {
  readonly freq: number;
  /** Optional exponential glide target across dur. */
  readonly to?: number;
  readonly dur?: number;
  readonly gain?: number;
  readonly attack?: number;
  /** Defaults to dur; the fall to silence after the attack. */
  readonly release?: number;
  readonly type?: OscillatorType;
  readonly cutoff?: number;
  readonly detune?: number;
}

/** A short, filtered noise burst: the tactile thup, kept dark by a lowpass. */
interface NoiseOpts {
  readonly dur?: number;
  readonly cutoff?: number;
  readonly q?: number;
  readonly gain?: number;
  readonly attack?: number;
  readonly release?: number;
  /** Optional lowpass sweep target across dur, for a soft card-flip. */
  readonly sweepTo?: number;
}

/** How quickly a user gain changes settle (setTargetAtTime time constant), so mute/volume never click. */
const GAIN_SETTLE = 0.02;
const MUSIC_FADE = 1.2;
/**
 * Background music level on its own bus, kept low on purpose (Dean, 2026-09-10: "quiet enough so
 * the other sounds shine through"). This is the baseline balance of music against effects; the
 * music user volume scales it, so the effective music gain is MUSIC_LEVEL * musicVolume.
 */
const MUSIC_LEVEL = 0.37;
/** A gentle safety lowpass over the whole effects bus, so nothing is ever harsh. */
const BUS_LOWPASS = 6000;

/**
 * Loop points for theme.mp3 ("Before the Surge"), in seconds, from a self-similarity analysis of the
 * decoded waveform (RMS envelope plus zero-crossing-constrained cross-correlation; see the PR). The
 * track is through-composed: a quiet fade-in (0 to ~6.4s), a long dynamic body, then an outro fade
 * (from ~200.7s to silence at 212s). It does not loop end to start. So we play from 0 with loop = true
 * and set loopStart/loopEnd to the body: the quiet intro plays once, then [LOOP_START, LOOP_END] repeats
 * forever and the ending is never reached. Both endpoints are rising zero-crossings at matched loudness,
 * so the wrap does not click or jump in level.
 */
const LOOP_START = 6.440862;
const LOOP_END = 200.685669;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

type ACtor = typeof AudioContext;
function audioContextCtor(): ACtor | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { AudioContext?: ACtor; webkitAudioContext?: ACtor };
  return w.AudioContext ?? w.webkitAudioContext;
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** Music fade envelope (0..1); a separate user gain below it carries level and volume. */
  private musicGain: GainNode | null = null;
  /** Music user bus: MUSIC_LEVEL * musicVolume, forced to 0 when music is muted. */
  private musicUserGain: GainNode | null = null;
  /** The effects bus: voices feed sfxDry and the reverb; both sum through a soft lowpass. */
  private sfxDry: GainNode | null = null;
  private sfxWet: GainNode | null = null;
  private verb: ConvolverNode | null = null;
  /** Effects user bus: sfxVolume, forced to 0 when effects are muted. */
  private sfxUserGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private sfxMuted = false;
  private sfxVolume = 0.7;
  private musicMuted = false;
  private musicVolume = 0.7;

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
      master.gain.value = 1; // fixed unity passthrough; the two user gains below it do the mixing
      master.connect(ctx.destination);

      // Music bus: source -> fade envelope -> user gain (level*volume, 0 when muted) -> master.
      const musicUserGain = ctx.createGain();
      musicUserGain.gain.value = this.musicMuted ? 0 : MUSIC_LEVEL * this.musicVolume;
      musicUserGain.connect(master);
      const musicGain = ctx.createGain();
      musicGain.gain.value = 0; // fades 0..1 when a track starts and back to 0 when it stops
      musicGain.connect(musicUserGain);

      // Effects bus: a soft lowpass, then the user gain (volume, 0 when muted); a dry path and a
      // small reverb both feed the lowpass.
      const sfxUserGain = ctx.createGain();
      sfxUserGain.gain.value = this.sfxMuted ? 0 : this.sfxVolume;
      sfxUserGain.connect(master);
      const busLp = ctx.createBiquadFilter();
      busLp.type = 'lowpass';
      busLp.frequency.value = BUS_LOWPASS;
      busLp.connect(sfxUserGain);
      const sfxDry = ctx.createGain();
      sfxDry.gain.value = 0.9;
      sfxDry.connect(busLp);
      const verb = ctx.createConvolver();
      verb.buffer = this.impulse(ctx, 1.7, 2.6);
      const sfxWet = ctx.createGain();
      sfxWet.gain.value = 0.22;
      verb.connect(sfxWet);
      sfxWet.connect(busLp);

      this.ctx = ctx;
      this.master = master;
      this.musicGain = musicGain;
      this.musicUserGain = musicUserGain;
      this.sfxDry = sfxDry;
      this.sfxWet = sfxWet;
      this.verb = verb;
      this.sfxUserGain = sfxUserGain;
      void ctx.resume().catch(() => undefined);
      if (this.wantMusic) this.playMusicSource();
    } catch {
      // A browser that refuses construction gets a silent, still-functional no-op engine.
      this.ctx = null;
    }
  }

  setSfxMuted(muted: boolean): void {
    this.sfxMuted = muted;
    this.applySfxGain();
  }

  setSfxVolume(volume: number): void {
    this.sfxVolume = clamp01(volume);
    this.applySfxGain();
  }

  setMusicMuted(muted: boolean): void {
    this.musicMuted = muted;
    this.applyMusicGain();
  }

  setMusicVolume(volume: number): void {
    this.musicVolume = clamp01(volume);
    this.applyMusicGain();
  }

  private applySfxGain(): void {
    if (!this.ctx || !this.sfxUserGain) return;
    const target = this.sfxMuted ? 0 : this.sfxVolume;
    this.sfxUserGain.gain.setTargetAtTime(target, this.ctx.currentTime, GAIN_SETTLE);
  }

  private applyMusicGain(): void {
    if (!this.ctx || !this.musicUserGain) return;
    const target = this.musicMuted ? 0 : MUSIC_LEVEL * this.musicVolume;
    this.musicUserGain.gain.setTargetAtTime(target, this.ctx.currentTime, GAIN_SETTLE);
  }

  /** Synthesize and play a named effect. No-op before unlock, or when effects are muted. */
  playSfx(name: SfxName): void {
    if (!this.ctx || !this.sfxDry || this.sfxMuted) return;
    this.renderSfx(name, this.ctx.currentTime + 0.01);
  }

  /**
   * The kit. Each effect is a small arrangement of soft tones and muffled noise, offset in seconds
   * from t. These parameters are the approved feel; tune here by ear.
   */
  private renderSfx(name: SfxName, t: number): void {
    switch (name) {
      case 'tileSelect':
        this.noise(t, { dur: 0.05, cutoff: 1400, gain: 0.09, release: 0.06 });
        this.tone(t, { freq: 320, dur: 0.09, gain: 0.05, cutoff: 1200, release: 0.1 });
        break;
      case 'tileDeselect':
        this.noise(t, { dur: 0.05, cutoff: 1000, gain: 0.08, release: 0.06 });
        this.tone(t, { freq: 240, dur: 0.09, gain: 0.045, cutoff: 1000, release: 0.1 });
        break;
      case 'wordLand':
        this.tone(t, { freq: 392, dur: 0.5, gain: 0.11, attack: 0.02, cutoff: 2200, release: 0.45 });
        this.tone(t + 0.06, { freq: 587, dur: 0.5, gain: 0.09, attack: 0.02, cutoff: 2400, release: 0.5 });
        this.noise(t, { dur: 0.06, cutoff: 1600, gain: 0.05, release: 0.1 });
        break;
      case 'itemPick':
        this.noise(t, { dur: 0.14, cutoff: 700, sweepTo: 2200, gain: 0.1, release: 0.16 });
        this.tone(t + 0.02, { freq: 330, to: 440, dur: 0.22, gain: 0.08, cutoff: 2000, release: 0.25 });
        break;
      case 'damage':
        this.noise(t, { dur: 0.2, cutoff: 320, gain: 0.14, attack: 0.004, release: 0.22 });
        this.tone(t, { freq: 110, to: 80, dur: 0.24, gain: 0.12, cutoff: 500, release: 0.28 });
        break;
      case 'defeat':
        this.tone(t, { freq: 392, to: 196, dur: 0.4, gain: 0.11, cutoff: 1800, release: 0.4 });
        this.noise(t, { dur: 0.08, cutoff: 1000, gain: 0.05, release: 0.14 });
        break;
      case 'win': {
        const notes = [392, 494, 587];
        notes.forEach((freq, i) => {
          this.tone(t + i * 0.12, { freq, dur: 0.7, gain: 0.1, attack: 0.03, cutoff: 2400, release: 0.7 });
        });
        this.tone(t + 0.36, { freq: 784, dur: 0.8, gain: 0.08, attack: 0.04, cutoff: 2600, release: 0.9 });
        break;
      }
      case 'lose':
        this.tone(t, { freq: 220, to: 130, dur: 0.8, gain: 0.11, attack: 0.03, cutoff: 1200, release: 0.9 });
        this.tone(t + 0.05, { freq: 164, to: 98, dur: 0.9, gain: 0.07, attack: 0.03, cutoff: 900, release: 1.0 });
        break;
      case 'curseTaken':
        this.tone(t, { freq: 130, dur: 0.5, gain: 0.11, attack: 0.02, cutoff: 900, release: 0.5 });
        this.tone(t, { freq: 138, dur: 0.5, gain: 0.06, attack: 0.02, cutoff: 900, release: 0.5 });
        this.noise(t, { dur: 0.12, cutoff: 500, gain: 0.05, release: 0.2 });
        break;
      case 'tap':
        this.noise(t, { dur: 0.03, cutoff: 1500, gain: 0.06, release: 0.05 });
        break;
    }
  }

  /** Route a finished voice into both the dry path and the reverb. */
  private sfxSend(node: AudioNode): void {
    if (this.sfxDry) node.connect(this.sfxDry);
    if (this.verb) node.connect(this.verb);
  }

  private tone(t: number, o: ToneOpts): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const dur = o.dur ?? 0.3;
    const gainVal = o.gain ?? 0.14;
    const attack = o.attack ?? 0.014;
    const release = o.release ?? dur;
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t + dur);
    if (o.detune) osc.detune.value = o.detune;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = o.cutoff ?? 2600;
    lp.Q.value = 0.4;
    const gain = ctx.createGain();
    const end = this.envelope(gain, t, gainVal, attack, release);
    osc.connect(lp).connect(gain);
    this.sfxSend(gain);
    osc.start(t);
    osc.stop(end + 0.02);
  }

  private noise(t: number, o: NoiseOpts): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const dur = o.dur ?? 0.09;
    const gainVal = o.gain ?? 0.12;
    const attack = o.attack ?? 0.006;
    const release = o.release ?? dur;
    const src = ctx.createBufferSource();
    src.buffer = this.getNoiseBuffer(ctx);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(o.cutoff ?? 1200, t);
    lp.Q.value = o.q ?? 0.7;
    if (o.sweepTo !== undefined) lp.frequency.exponentialRampToValueAtTime(Math.max(1, o.sweepTo), t + dur);
    const gain = ctx.createGain();
    const end = this.envelope(gain, t, gainVal, attack, release);
    src.connect(lp).connect(gain);
    this.sfxSend(gain);
    src.start(t);
    src.stop(end + 0.05);
  }

  /**
   * A soft attack then an exponential fall to silence. exponentialRamp cannot reach 0, so it falls
   * to a floor and a final setValueAtTime snaps it, which never clicks because the floor is tiny.
   * Returns the time the voice is done.
   */
  private envelope(gain: GainNode, t: number, peak: number, attack: number, release: number): number {
    const end = t + attack + release;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(peak, t + attack);
    gain.gain.setValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    gain.gain.setValueAtTime(0, end);
    return end;
  }

  /** One second of white noise, cached and reused across every noisy effect. */
  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer) return this.noiseBuffer;
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.7;
    this.noiseBuffer = buf;
    return buf;
  }

  /** A soft, exponentially decaying, darkened noise impulse for the small reverb. */
  private impulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
    const rate = ctx.sampleRate;
    const len = Math.max(1, Math.floor(rate * seconds));
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02; // cheap lowpass -> a darker tail
        d[i] = last * Math.pow(1 - i / len, decay);
      }
    }
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
    // The quiet intro plays once, then only the body [LOOP_START, LOOP_END] repeats (the outro is never
    // reached). Guard against a buffer that is somehow too short for these points: fall back to looping
    // the whole thing rather than looping a zero- or negative-length window.
    if (LOOP_END > LOOP_START && this.musicBuffer.duration >= LOOP_END) {
      src.loopStart = LOOP_START;
      src.loopEnd = LOOP_END;
    }
    src.connect(this.musicGain);
    const now = ctx.currentTime;
    // The fade envelope rises to unity; the music user gain below it sets the actual level and mute.
    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setValueAtTime(Math.max(0.0001, this.musicGain.gain.value), now);
    this.musicGain.gain.linearRampToValueAtTime(1, now + MUSIC_FADE);
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
