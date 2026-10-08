/**
 * Links on events: find them in text, name them, and tell a join link (the
 * video call) apart from the rest. Runs on the server and in the browser.
 */
export type EventLink = { label: string; url: string };

const JOIN_HOSTS: [RegExp, string][] = [
  [/(^|\.)zoom\.(us|com)$/, "Zoom"],
  [/(^|\.)teams\.(microsoft|live)\.com$/, "Teams"],
  [/^meet\.google\.com$/, "Google Meet"],
  [/(^|\.)webex\.com$/, "Webex"],
  [/(^|\.)whereby\.com$/, "Whereby"],
  [/^meet\.jit\.si$/, "Jitsi"],
  [/(^|\.)gotomeeting\.com$/, "GoTo Meeting"],
  [/^(www\.)?discord\.(gg|com)$/, "Discord"],
];

function host(url: string) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/** "Zoom", "Teams", … for a video-call link; null for anything else. */
export function joinService(url: string): string | null {
  const h = host(url);
  // Teams links often go through the safelinks/aka redirectors; keep it simple.
  if (h === "teams.microsoft.com" || h.endsWith(".teams.microsoft.com")) return "Teams";
  for (const [re, name] of JOIN_HOSTS) if (re.test(h)) return name;
  return null;
}

export function isJoinLink(url: string) {
  return joinService(url) !== null;
}

/** A readable default label: the call service, what the link is for, else the site. */
export function labelFor(url: string) {
  const service = joinService(url);
  if (service) return `Join ${service}`;
  const h = host(url).replace(/^www\./, "");
  const path = url.toLowerCase();
  if (/regist|signup|sign-up|rsvp|tickets?|eventbrite|lu\.ma|luma\.com|forms\.gle|docs\.google\.com\/forms|typeform/.test(path)) return `Register · ${h}`;
  if (/apply|application|taotlus/.test(path)) return `Apply · ${h}`;
  if (/\.pdf($|\?)/.test(path)) return `PDF · ${h}`;
  if (/agenda|programm?e?|schedule|ajakava/.test(path)) return `Agenda · ${h}`;
  if (h === "docs.google.com" || h === "drive.google.com") return "Google Drive file";
  return h || "Link";
}

/** Every http(s) URL in the text, cleaned of trailing punctuation, in order, once each. */
export function extractUrls(text: string): string[] {
  const found = text.match(/https?:\/\/[^\s<>"'()\[\]]+/gi) ?? [];
  const cleaned = found.map((u) => u.replace(/[.,;:!?*>)\]]+$/, ""));
  return [...new Set(cleaned)];
}

/**
 * Outlook "safelinks" and Google redirect wrappers hide the real address (and
 * hide that it is a Zoom/Teams link). Return the address inside them.
 */
export function unwrap(url: string): string {
  try {
    const u = new URL(url);
    const h = u.hostname.toLowerCase();
    const inner =
      (h.endsWith("safelinks.protection.outlook.com") && u.searchParams.get("url")) ||
      ((h === "www.google.com" || h === "google.com") && u.pathname === "/url" && (u.searchParams.get("q") || u.searchParams.get("url"))) ||
      null;
    return inner && /^https?:\/\//i.test(inner) ? inner : url;
  } catch {
    return url;
  }
}

/** Keep valid http(s) links, drop duplicates, fill missing labels; join links first. */
export function cleanLinks(links: { label?: string | null; url: string }[]): EventLink[] {
  const seen = new Set<string>();
  const out: EventLink[] = [];
  for (const l of links) {
    const url = l.url ? unwrap(l.url.trim()) : "";
    if (!url || !/^https?:\/\//i.test(url) || !host(url) || seen.has(url)) continue;
    seen.add(url);
    out.push({ label: l.label?.trim().slice(0, 80) || labelFor(url), url });
  }
  return out.sort((a, b) => Number(isJoinLink(b.url)) - Number(isJoinLink(a.url)));
}

/** All links of a stored event (the old single `url` included). */
export function eventLinks(e: { url?: string | null; links?: unknown }): EventLink[] {
  const list = Array.isArray(e.links) ? (e.links as EventLink[]) : [];
  return cleanLinks([...list, ...(e.url ? [{ label: "", url: e.url }] : [])]);
}
