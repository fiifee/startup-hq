import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";

export const metadata = { title: "Sign in" };

export default async function LoginPage(props: PageProps<"/login">) {
  const sp = await props.searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/";
  if (await getUser()) redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
  const error = typeof sp.error === "string" ? sp.error : null;
  const dev = process.env.NODE_ENV !== "production" && !process.env.VERCEL;
  return (
    <main className="min-h-dvh flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Startup HQ</h1>
          <p className="text-ink-2 mt-1">Tasks, meetings and decisions for the team, run together with your AI.</p>
        </div>
        {error && <p role="alert" className="text-sm text-danger bg-danger-soft rounded-md px-3 py-2">{error}</p>}
        <a
          href={`/api/auth/google?next=${encodeURIComponent(next)}`}
          className="flex items-center justify-center gap-3 h-11 rounded-md border border-line-strong bg-surface hover:bg-sunken font-medium"
        >
          <svg aria-hidden viewBox="0 0 48 48" className="w-5 h-5">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
            <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
          </svg>
          Sign in with Google
        </a>
        <p className="text-sm text-ink-3">Only users added by the owner can sign in.</p>
        {dev && (
          <a href="/api/auth/dev" className="block text-center text-sm text-ink-2 underline">Development: sign in as the owner</a>
        )}
      </div>
    </main>
  );
}
