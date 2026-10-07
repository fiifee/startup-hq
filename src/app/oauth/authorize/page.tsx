import { redirect } from "next/navigation";
import { AiMark } from "@/components/people";
import { btnPrimary, btnSecondary, hintCls, inputCls, labelCls } from "@/components/ui";
import { agentLabel } from "@/lib/actor";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirectAllowed } from "@/lib/oauth";
import { decideAction } from "./actions";

export const metadata = { title: "Connect an AI" };

function Problem({ message }: { message: string }) {
  return (
    <main className="min-h-dvh flex items-center justify-center px-4">
      <div className="max-w-sm space-y-2">
        <h1 className="text-xl font-semibold">Cannot connect</h1>
        <p className="text-ink-2">{message}</p>
      </div>
    </main>
  );
}

export default async function AuthorizePage(props: PageProps<"/oauth/authorize">) {
  const sp = await props.searchParams;
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const clientId = get("client_id");
  const redirectUri = get("redirect_uri");

  const client = clientId ? await db.oAuthClient.findUnique({ where: { id: clientId } }) : null;
  if (!client) return <Problem message="Unknown application. Remove the connector and add it again." />;
  if (!redirectUri || !redirectAllowed(client.redirectUris, redirectUri)) return <Problem message="The application sent a return address it did not register." />;
  if (get("response_type") !== "code") return <Problem message="Unsupported response_type." />;
  if (!get("code_challenge") || (get("code_challenge_method") && get("code_challenge_method") !== "S256")) {
    return <Problem message="The application must use PKCE (S256)." />;
  }

  const user = await getUser();
  if (!user) {
    const here = `/oauth/authorize?${new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string"))}`;
    redirect(`/login?next=${encodeURIComponent(here)}`);
  }

  const suggested = agentLabel(client.name);
  const first = user.name?.split(" ")[0] ?? user.email;
  return (
    <main className="min-h-dvh flex items-center justify-center px-4 py-10">
      <form action={decideAction} className="w-full max-w-md space-y-5">
        <div className="flex items-center gap-2" style={{ color: user.color }}>
          <AiMark className="w-6 h-6" />
          <span className="text-sm font-medium">Startup HQ</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Let {client.name} work as you?</h1>
        <ul className="text-sm text-ink-2 space-y-1.5 list-disc pl-5">
          <li>It can read and change tasks, notes, meetings, decisions and the agenda, and read the shared Drive folder and the company brief.</li>
          <li>Everything it writes is marked as <strong style={{ color: user.color }}>{first}&apos;s {suggested}</strong>, in your colour.</li>
          <li>It cannot overwrite what a person wrote; those edits wait for approval.</li>
          <li>You can disconnect it any time in Settings.</li>
        </ul>
        <div>
          <label htmlFor="agent" className={labelCls}>Name on its work</label>
          <input id="agent" name="agent" defaultValue={suggested} maxLength={40} className={inputCls} />
          <p className={hintCls}>Signed in as {user.email}.</p>
        </div>
        {(["client_id", "redirect_uri", "state", "code_challenge"] as const).map((k) => (
          <input key={k} type="hidden" name={k} value={get(k)} />
        ))}
        <div className="flex gap-2">
          <button name="decision" value="allow" className={btnPrimary}>Allow</button>
          <button name="decision" value="deny" className={btnSecondary}>Cancel</button>
        </div>
      </form>
    </main>
  );
}
