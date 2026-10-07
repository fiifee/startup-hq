/** "Liis: ..." or "[00:12] Liis: ..." — a transcript line, never a title. */
export function isSpeakerLine(line: string) {
  return /^\s*(\[?\d{1,2}:\d{2}(:\d{2})?\]?\s*)?[\p{L}][\p{L} .'-]{0,40}:\s/u.test(line);
}

/** Does pasted text look like a meeting transcript rather than a task or a note? Runs in the browser too. */
export function looksLikeTranscript(text: string) {
  const lines = text.split("\n").filter((l) => l.trim());
  const speakers = lines.filter(isSpeakerLine).length;
  const stamps = (text.match(/\b\d{1,2}:\d{2}(:\d{2})?\b/g) ?? []).length;
  return text.length > 1500 || (lines.length >= 6 && (speakers >= 3 || stamps >= 3));
}
