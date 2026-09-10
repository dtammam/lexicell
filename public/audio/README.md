# Music track

Drop `theme.mp3` here. Nothing in the repo ships one; the game plays music only
when this file is present.

- A 1 to 3 minute loop. It loops seamlessly, so the end should meet the start.
- MP3 at roughly 160 to 192 kbps. Or send a WAV/FLAC master to be encoded to MP3
  before it lands here.
- The engine (`src/ui/audio.ts`) fetches it from `${BASE_URL}audio/theme.mp3`,
  decodes it with the Web Audio API into an AudioBuffer, and loops that buffer
  gaplessly (a looped AudioBufferSourceNode wraps at the sample, with no gap and
  no click, unlike an `<audio loop>` restart).
- If the file is absent, music simply does not play: the fetch 404s, the engine
  stays silently off, and sound effects and the rest of the game are unaffected.
- Because the service worker precaches every built asset, dropping the file in
  makes it cached for offline once a build ships it.
