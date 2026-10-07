"use client";

import { useTransition } from "react";
import { toast } from "sonner";

type Result = { ok: true; data?: unknown } | { ok: false; error: string };

/** Run a server action, toast its error, and expose pending state. */
export function useAction() {
  const [pending, start] = useTransition();
  function run<R extends Result>(fn: () => Promise<R>, success?: string, after?: (r: R) => void) {
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error);
      else {
        if (success) toast.success(success);
        after?.(r);
      }
    });
  }
  return { pending, run };
}
