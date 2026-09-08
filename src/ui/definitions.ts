/**
 * Word definitions, loaded lazily as their own chunk (definitions.txt is ~6 MB raw)
 * and parsed into a Map on first use. Unknown words resolve to null, never throw:
 * WordNet defines about 60% of ENABLE and a missing gloss is not an error.
 */
let table: Promise<Map<string, string>> | undefined;

function parse(text: string): Map<string, string> {
  const map = new Map<string, string>();
  let start = 0;
  while (start < text.length) {
    let end = text.indexOf('\n', start);
    if (end < 0) end = text.length;
    const tab = text.indexOf('\t', start);
    if (tab > start && tab < end) map.set(text.slice(start, tab), text.slice(tab + 1, end));
    start = end + 1;
  }
  return map;
}

export function loadDefinitions(): Promise<Map<string, string>> {
  table ??= import('./definitions-data').then(({ default: text }) => parse(text));
  return table;
}

export async function defineWord(word: string): Promise<string | null> {
  const map = await loadDefinitions();
  return map.get(word.toLowerCase()) ?? null;
}

/** Deterministic word of the day: the same word for everyone on the same date, from the defined words only. */
export async function wordOfTheDay(date: Date, minLength = 5, maxLength = 8): Promise<{ word: string; gloss: string } | null> {
  const map = await loadDefinitions();
  const candidates = Array.from(map.keys()).filter((w) => w.length >= minLength && w.length <= maxLength);
  if (candidates.length === 0) return null;
  const day = Math.floor(date.getTime() / 86_400_000);
  // Multiplicative hash of the day number; no engine RNG involved, this is presentation only.
  const index = Math.abs(Math.imul(day, 2654435761) >>> 0) % candidates.length;
  const word = candidates[index];
  if (word === undefined) return null;
  return { word, gloss: map.get(word) ?? '' };
}
