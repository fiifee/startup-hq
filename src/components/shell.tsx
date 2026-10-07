"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  CalendarDays, CheckSquare, FileText, FolderOpen, Gavel, Home, Inbox, ListChecks, Menu, Newspaper, Search, Settings, X, Activity, BookOpen, Target,
} from "lucide-react";
import { Avatar, type Founder } from "./people";

const NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/brief", label: "Company brief", icon: BookOpen },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/meetings", label: "Meetings", icon: CalendarDays },
  { href: "/agenda", label: "Next agenda", icon: ListChecks },
  { href: "/decisions", label: "Decisions", icon: Gavel },
  { href: "/notes", label: "Notes", icon: FileText },
  { href: "/weekly", label: "Weekly", icon: Newspaper },
  { href: "/drive", label: "Drive", icon: FolderOpen },
  { href: "/review", label: "Review", icon: Inbox, badge: true },
  { href: "/activity", label: "Activity", icon: Activity },
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

function SearchBox({ onDone }: { onDone?: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
        onDone?.();
      }}
      className="relative"
    >
      <Search className="w-4 h-4 text-ink-3 absolute left-2.5 top-1/2 -translate-y-1/2" aria-hidden />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search everything"
        aria-label="Search"
        className="w-full h-9 pl-8 pr-2 rounded-md border border-line bg-surface text-sm placeholder:text-ink-3 focus:outline-none focus:border-accent"
      />
    </form>
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
        <SearchBox />
        <NavLinks reviewCount={reviewCount} />
        {footer}
      </aside>

      <header className="md:hidden sticky top-0 z-30 flex items-center gap-2 h-12 px-4 border-b border-line bg-canvas/95 backdrop-blur">
        <button aria-label="Open menu" onClick={() => setOpen(true)} className="p-1.5 -ml-1.5 rounded-md hover:bg-sunken">
          <Menu className="w-5 h-5" />
        </button>
        <Link href="/" className="font-semibold">Startup HQ</Link>
        {reviewCount > 0 && (
          <Link href="/review" className="ml-auto text-xs font-medium px-2 h-6 inline-flex items-center rounded-full bg-ink text-canvas">
            {reviewCount} to review
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
            <SearchBox onDone={() => setOpen(false)} />
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
