# Music track

`theme.mp3` ("Before the Surge", provided by Dean, 2026-09-10) is the looping
background track. The game plays it only when this file is present.

- The engine (`src/ui/audio.ts`) fetches it from `${BASE_URL}audio/theme.mp3`,
  decodes it with the Web Audio API into an AudioBuffer, and loops that buffer
  (`loop = true`) so it wraps at the sample with no gap or click.
- It plays low, under the sound effects (the `MUSIC_LEVEL` constant in
  `src/ui/audio.ts`); nudge that one number to change how loud the music sits.
- To replace it, drop a new `theme.mp3` here (MP3, or send a WAV/FLAC master to
  be encoded). If the track is composed to loop, say where its loop points are.
- The service worker precaches it, so it is available offline once a build ships.
