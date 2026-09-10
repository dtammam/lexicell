<script lang="ts">
  let {
    onBack,
    readable,
    onToggleReadable,
    sfxMuted,
    sfxVolume,
    musicMuted,
    musicVolume,
    onToggleSfxMuted,
    onSetSfxVolume,
    onToggleMusicMuted,
    onSetMusicVolume,
    build,
    sha,
  }: {
    onBack: () => void;
    readable: boolean;
    onToggleReadable: () => void;
    sfxMuted: boolean;
    sfxVolume: number;
    musicMuted: boolean;
    musicVolume: number;
    onToggleSfxMuted: () => void;
    onSetSfxVolume: (v: number) => void;
    onToggleMusicMuted: () => void;
    onSetMusicVolume: (v: number) => void;
    build: number | null;
    sha: string;
  } = $props();

  function onSfxInput(e: Event) {
    onSetSfxVolume(Number((e.currentTarget as HTMLInputElement).value) / 100);
  }
  function onMusicInput(e: Event) {
    onSetMusicVolume(Number((e.currentTarget as HTMLInputElement).value) / 100);
  }

  // Submit a bug: a mailto with the build and sha baked into the subject and body, so a report
  // arrives already stamped with the version the player was on. The version reads the release
  // note's build (what the title screen shows) and the build sha.
  const version = $derived(build != null ? `build ${build}, ${sha}` : sha);
  const bugHref = $derived.by(() => {
    const subject = `Lexicell bug (${version})`;
    const body = `What happened:\n\n\nWhat I expected:\n\n\nVersion: ${version}`;
    return `mailto:dean@tamm.am?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  });
</script>

<section class="settings">
  <header>
    <h2>Settings</h2>
    <button class="btn" onclick={onBack}>Back</button>
  </header>

  <div class="body">
    <h3>Sound effects</h3>
    <button class="btn" class:life={!sfxMuted} onclick={onToggleSfxMuted}>{sfxMuted ? 'Sound effects: off' : 'Sound effects: on'}</button>
    <label class="volume" class:off={sfxMuted}>
      <span>Volume</span>
      <input type="range" min="0" max="100" step="1" value={Math.round(sfxVolume * 100)} oninput={onSfxInput} disabled={sfxMuted} aria-label="Sound effects volume" />
    </label>

    <h3>Music</h3>
    <button class="btn" class:life={!musicMuted} onclick={onToggleMusicMuted}>{musicMuted ? 'Music: off' : 'Music: on'}</button>
    <label class="volume" class:off={musicMuted}>
      <span>Volume</span>
      <input type="range" min="0" max="100" step="1" value={Math.round(musicVolume * 100)} oninput={onMusicInput} disabled={musicMuted} aria-label="Music volume" />
    </label>

    <h3>Legible text</h3>
    <p>The pixel type is the game's voice. If it costs you letters, switch it off; the choice stays on this device.</p>
    <button class="btn" class:life={readable} onclick={onToggleReadable}>{readable ? 'Readable type: on' : 'Readable type: off'}</button>

    <h3>Submit a bug</h3>
    <p>Found something wrong? Reach out at dean@tamm.am. The button opens an email prefilled with what to say and the build you are on.</p>
    <a class="btn" href={bugHref}>Report a bug</a>
    <p class="stamp">{version}</p>
  </div>
</section>

<style>
  .settings {
    display: flex;
    flex-direction: column;
    min-height: 0;
    gap: var(--s3);
  }
  header {
    flex: none;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--s3);
  }
  h2 {
    margin: 0;
    font-family: var(--font-head);
    font-weight: 400;
    font-size: var(--head);
  }
  h3 {
    margin: var(--s2) 0 0;
    font-family: var(--font-head);
    font-weight: 400;
    font-size: var(--name);
    color: var(--muted);
  }
  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--s2);
    font-size: var(--text);
    line-height: 1.4;
    padding-right: var(--s1);
  }
  p {
    margin: 0;
    color: var(--ink);
  }
  .stamp {
    color: var(--muted);
    font-family: var(--font-hud);
    font-size: var(--hud-s);
    margin-top: var(--s1);
  }
  /* A link styled exactly like the other buttons, so the bug report reads as one of the controls. */
  a.btn {
    display: inline-block;
    width: fit-content;
    text-decoration: none;
  }
  .volume {
    display: flex;
    align-items: center;
    gap: var(--s3);
    font-family: var(--font-ui);
    font-size: var(--text);
    color: var(--ink);
    margin-top: var(--s1);
  }
  .volume.off {
    color: var(--muted);
  }
  .volume input[type='range'] {
    flex: 1;
    min-width: 0;
    height: 12px;
    accent-color: var(--life);
    touch-action: manipulation;
    cursor: pointer;
  }
  .volume input[type='range']:disabled {
    cursor: default;
    opacity: 0.5;
  }
</style>
