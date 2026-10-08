"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BookOpen, CalendarClock, CalendarDays, CheckSquare, FileText, Home, Menu, Plus, Settings, X } from "lucide-react";
import { Avatar, type Founder } from "./people";
import { openCapture } from "./capture";
import { useShortcut } from "./shortcut";

const NAV = [
  { href: "/", label: "Home", icon: Home, badge: true },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/meetings", label: "Meetings", icon: CalendarDays },
  { href: "/timeline", label: "Timeline", icon: CalendarClock },
  { href: "/brief", label: "Brief", icon: BookOpen },
  { href: "/docs", label: "Docs", icon: FileText },
];

function NavLinks({ reviewCount, onNavigate }: { reviewCount: number; onNavigate?: () => void }) {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV.map(({ href, label, icon: Icon, badge }) => (
        <Link
          key={href}
          href={href}
          onClick={onNavigate}
          className={`flex items-center gap-2.5 h-9 px-2.5 rounded-md text-sm transition-colors ${
            active(href) ? "bg-sunken text-ink font-medium" : "text-ink-2 hover:text-ink hover:bg-sunken"
          }`}
        >
          <Icon className="w-4 h-4 shrink-0" aria-hidden />
          <span className="flex-1">{label}</span>
          {badge && reviewCount > 0 && (
            <span className="min-w-5 h-5 px-1.5 rounded-full bg-ink text-canvas text-xs font-medium inline-flex items-center justify-center tabular">
              {reviewCount}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}

function CaptureButton({ onDone }: { onDone?: () => void }) {
  const hint = useShortcut("K");
  return (
    <button
      onClick={() => {
        onDone?.();
        openCapture();
      }}
      className="w-full h-9 px-2.5 rounded-md border border-line bg-surface text-sm text-ink-2 hover:text-ink hover:border-line-strong inline-flex items-center gap-2"
    >
      <Plus className="w-4 h-4" aria-hidden />
      <span className="flex-1 text-left">Capture or search</span>
      {hint && <kbd className="text-xs text-ink-3 font-sans">{hint}</kbd>}
    </button>
  );
}

export function Shell({ user, reviewCount, children }: { user: Founder; reviewCount: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const footer = (
    <div className="mt-auto pt-4 border-t border-line flex items-center gap-2">
      <Avatar user={user} size={26} />
      <span className="text-sm truncate flex-1">{user.name ?? user.email}</span>
      <Link href="/settings" aria-label="Settings" className="p-1.5 rounded-md text-ink-2 hover:text-ink hover:bg-sunken" onClick={() => setOpen(false)}>
        <Settings className="w-4 h-4" />
      </Link>
    </div>
  );
  return (
    <div className="min-h-dvh md:flex">
      <aside className="hidden md:flex flex-col w-56 shrink-0 h-dvh sticky top-0 border-r border-line bg-canvas px-3 py-4 gap-4">
        <Link href="/" className="px-2.5 font-semibold tracking-tight">Startup HQ</Link>
        <CaptureButton />
        <NavLinks reviewCount={reviewCount} />
        {footer}
      </aside>

      <header className="md:hidden sticky top-0 z-30 flex items-center gap-2 h-12 px-4 border-b border-line bg-canvas/95 backdrop-blur">
        <button aria-label="Open menu" onClick={() => setOpen(true)} className="p-1.5 -ml-1.5 rounded-md hover:bg-sunken">
          <Menu className="w-5 h-5" />
        </button>
        <Link href="/" className="font-semibold">Startup HQ</Link>
        {reviewCount > 0 && (
          <Link href="/" className="ml-auto text-xs font-medium px-2 h-6 inline-flex items-center rounded-full bg-ink text-canvas">
            {reviewCount} need you
          </Link>
        )}
      </header>
      {open && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="relative w-72 max-w-[85vw] h-full bg-canvas px-3 py-4 flex flex-col gap-4 shadow-xl">
            <div className="flex items-center justify-between px-2.5">
              <span className="font-semibold">Startup HQ</span>
              <button aria-label="Close menu" onClick={() => setOpen(false)} className="p-1.5 rounded-md hover:bg-sunken"><X className="w-5 h-5" /></button>
            </div>
            <CaptureButton onDone={() => setOpen(false)} />
            <NavLinks reviewCount={reviewCount} onNavigate={() => setOpen(false)} />
            {footer}
          </div>
        </div>
      )}

      <main className="flex-1 min-w-0 px-4 md:px-8 py-6 md:py-8 pb-28">{children}</main>
    </div>
  );
}

/**
 * Picks up changes other users and their AIs make. Refreshes server data every
 * 30 s while the tab is visible, and never while someone is typing.
 */
export function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      const el = document.activeElement;
      if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT" || (el as HTMLElement).isContentEditable)) return;
      router.refresh();
    };
    const id = setInterval(tick, seconds * 1000);
    const onVisible = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, seconds]);
  return null;
}
