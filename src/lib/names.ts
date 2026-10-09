/**
 * Matching people by how teammates actually write them: first names, a few
 * letters of one, any capitals, with or without accents ("@ann", "mark",
 * "Anna Tamm", "a.m.tamm"). Runs on the server and in the browser.
 */
export type Named = { id: string; name: string | null; email: string };

/** Lowercase without accents: "Õnne" → "onne". */
export function fold(s: string) {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

function parts(u: Named) {
  const name = fold(u.name ?? "");
  const words = name.split(/\s+/).filter(Boolean);
  const local = fold(u.email.split("@")[0]);
  return { name, first: words[0] ?? local, words, local, emailWords: local.split(/[._-]+/) };
}

/**
 * Who a written name refers to. Exact matches win (first name, full name, last
 * name, email); otherwise a prefix of 2+ letters of any of those. May return
 * several people when it is ambiguous.
 */
export function matchUsers<T extends Named>(query: string, users: T[], minPrefix = 2): T[] {
  const q = fold(query).replace(/^@/, "");
  if (!q) return [];
  const exact = users.filter((u) => {
    const p = parts(u);
    return q === p.first || q === p.name || q === p.name.replace(/\s+/g, "") || p.words.includes(q) || q === p.local || q === fold(u.email);
  });
  if (exact.length) return exact;
  if (q.length < minPrefix) return [];
  return users.filter((u) => {
    const p = parts(u);
    return p.words.some((w) => w.startsWith(q)) || p.emailWords.some((w) => w.startsWith(q)) || p.name.startsWith(q);
  });
}

/** "Anna", or "Anna R." when two people share the first name. */
export function shortName<T extends Named>(u: T | null | undefined, all: T[] = []) {
  if (!u) return "Someone";
  const first = (u.name ?? "").split(/\s+/)[0] || u.email.split("@")[0];
  const twins = all.filter((x) => x.id !== u.id && fold((x.name ?? "").split(/\s+/)[0] || x.email.split("@")[0]) === fold(first));
  if (!twins.length) return first;
  const last = (u.name ?? "").split(/\s+/)[1];
  return last ? `${first} ${last[0]}.` : `${first} (${u.email})`;
}

/** The handle to insert after "@": the first name, joined with the last name if needed to be unique. */
export function mentionHandle<T extends Named>(u: T, all: T[]) {
  const words = (u.name ?? "").split(/\s+/).filter(Boolean);
  const first = words[0] || u.email.split("@")[0];
  return matchUsers(first, all).length === 1 ? first : words.join("") || u.email.split("@")[0];
}
