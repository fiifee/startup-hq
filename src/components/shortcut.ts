"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};
const isMac = () => /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);

/**
 * Format a Cmd/Ctrl shortcut for the viewer's OS: "⌘J" / "⌘ Enter" on Apple,
 * "Ctrl+J" / "Ctrl+Enter" elsewhere. Null during server render, so no hint is
 * shown until the platform is known.
 */
export function useShortcut(key: string): string | null {
  const mac = useSyncExternalStore(noop, isMac, () => null);
  if (mac === null) return null;
  return mac ? `⌘${key.length > 1 ? " " : ""}${key}` : `Ctrl+${key}`;
}
