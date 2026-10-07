import { AiKeys, ApiTokens, CodeBlock, DigestToggle, DriveDisconnect, FolderPicker, Founders, Grants, ProfileForm } from "@/components/settings";
import { btnPrimary, btnSecondary, cardCls, h1Cls, h2Cls } from "@/components/ui";
import { requestOrigin, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { driveStatus } from "@/lib/google";
import { listFounders } from "@/lib/services/people";

export const metadata = { title: "Settings" };

function Section({ id, title, intro, children }: { id: string; title: string; intro?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className={`${cardCls} p-4 md:p-5 space-y-4 scroll-mt-20`}>
      <div>
        <h2 className={h2Cls}>{title}</h2>
        {intro && <div className="text-sm text-ink-2 mt-1 space-y-1">{intro}</div>}
      </div>
      {children}
    </section>
  );
}

export default async function SettingsPage(props: PageProps<"/settings">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const base = await requestOrigin();
  const mcpUrl = `${base}/api/mcp`;
  const [founders, keys, tokens, grants, drive, digest] = await Promise.all([
    listFounders(),
    db.aiKey.findMany({ where: { userId: user.id }, select: { provider: true, model: true, last4: true } }),
    db.apiToken.findMany({ where: { userId: user.id, revokedAt: null }, orderBy: { createdAt: "desc" } }),
    db.oAuthGrant.findMany({ where: { userId: user.id, revokedAt: null }, include: { client: true }, orderBy: { createdAt: "desc" } }),
    driveStatus(),
    db.setting.findUnique({ where: { key: "digest.userId" } }),
  ]);
  const digestOwner = founders.find((f) => f.id === digest?.value);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className={h1Cls}>Settings</h1>

      <Section id="connect" title="Connect your AI" intro={<p>Plug your own Claude, ChatGPT, Gemini or Hermes into Startup HQ. It acts as you, on your subscription, and everything it writes is marked “{user.name?.split(" ")[0] ?? "your"}’s &lt;AI&gt;” in your colour.</p>}>
        <div className="space-y-1">
          <span className="text-sm font-medium">Server URL</span>
          <CodeBlock code={mcpUrl} />
        </div>
        <details className="border border-line rounded-md">
          <summary className="px-3 py-2.5 cursor-pointer font-medium text-sm">Claude (web, desktop and phone apps)</summary>
          <ol className="px-4 pb-3 text-sm space-y-1 list-decimal pl-8">
            <li>Open Claude → Settings → Connectors → Add custom connector.</li>
            <li>Name it “Startup HQ” and paste the server URL above.</li>
            <li>Click Connect, sign in with Google here, and approve.</li>
          </ol>
          <p className="px-4 pb-3 text-sm text-ink-2">Claude Code: run the command below, then <code className="font-mono">/mcp</code> to sign in.</p>
          <div className="px-4 pb-3"><CodeBlock code={`claude mcp add --transport http startup-hq ${mcpUrl}`} /></div>
        </details>
        <details className="border border-line rounded-md">
          <summary className="px-3 py-2.5 cursor-pointer font-medium text-sm">ChatGPT</summary>
          <ol className="px-4 pb-3 text-sm space-y-1 list-decimal pl-8">
            <li>ChatGPT → Settings → Apps &amp; Connectors → Advanced settings → turn on Developer mode.</li>
            <li>Create a connector: name “Startup HQ”, the server URL above, authentication OAuth.</li>
            <li>Sign in with Google here and approve. In a chat, enable the connector from the + menu.</li>
          </ol>
          <p className="px-4 pb-3 text-sm text-ink-2">Needs a paid ChatGPT plan; menu names change often.</p>
        </details>
        <details className="border border-line rounded-md">
          <summary className="px-3 py-2.5 cursor-pointer font-medium text-sm">Gemini</summary>
          <p className="px-4 pb-2 text-sm">Gemini CLI is free with a personal Google account. Add this to <code className="font-mono">~/.gemini/settings.json</code>, then run <code className="font-mono">/mcp auth startup-hq</code>.</p>
          <div className="px-4 pb-3"><CodeBlock code={JSON.stringify({ mcpServers: { "startup-hq": { httpUrl: mcpUrl } } }, null, 2)} /></div>
        </details>
        <details className="border border-line rounded-md" open={sp.tab === "hermes"}>
          <summary className="px-3 py-2.5 cursor-pointer font-medium text-sm">Hermes, scripts and other agents</summary>
          <p className="px-4 pb-2 text-sm">These use a personal token instead of a sign-in. Create one below; the Hermes config snippet appears with it.</p>
          <p className="px-4 pb-2 text-sm text-ink-2">Every tool also works over plain HTTP:</p>
          <div className="px-4 pb-3"><CodeBlock code={`curl -X POST ${base}/api/v1/tools/create_task \\\n  -H "Authorization: Bearer shq_..." -H "content-type: application/json" \\\n  -d '{"title": "Call the bank", "assignee": "me", "due": "2026-10-10"}'`} /></div>
        </details>
      </Section>

      <Section id="apps" title="Connected AI apps" intro="Claude, ChatGPT and Gemini sessions that signed in as you.">
        <Grants grants={grants.map((g) => ({ id: g.id, agent: g.agent, clientName: g.client.name, lastUsedAt: g.lastUsedAt, createdAt: g.createdAt }))} />
      </Section>

      <Section id="tokens" title="Personal tokens" intro="For Hermes and anything that takes a fixed header.">
        <ApiTokens tokens={tokens} mcpUrl={mcpUrl} />
      </Section>

      <Section id="ai-keys" title="Your AI keys" intro={<p>Used by the in-app <strong>Ask AI</strong> button and “Summarise with my AI”. Only your requests use your key.</p>}>
        <AiKeys keys={keys} />
      </Section>

      <Section id="weekly" title="Monday summary">
        <DigestToggle isMine={digest?.value === user.id} hasKey={keys.length > 0} otherName={digestOwner && digestOwner.id !== user.id ? (digestOwner.name ?? digestOwner.email) : null} />
      </Section>

      <Section id="profile" title="You">
        <ProfileForm user={user} />
      </Section>

      <Section id="founders" title="Founders" intro={user.isOwner ? "Add co-founders by their Google email. They sign in with Google." : undefined}>
        <Founders founders={founders} meId={user.id} isOwner={user.isOwner} />
      </Section>

      {user.isOwner && (
        <Section id="drive" title="Google Drive" intro="Connected with the Google account that owns the shared folder.">
          {sp.drive === "norefresh" && <p className="text-sm text-danger">Google did not grant offline access. Remove the app at myaccount.google.com/permissions and connect again.</p>}
          {drive.connected ? (
            <>
              <p className="text-sm">Connected as <strong>{drive.email}</strong>{drive.folderName && <> · folder <strong>{drive.folderName}</strong></>}</p>
              <FolderPicker current={drive.folderId} />
              <div className="flex gap-2">
                <a href="/api/auth/drive" className={btnSecondary}>Reconnect</a>
                <DriveDisconnect />
              </div>
            </>
          ) : (
            <a href="/api/auth/drive" className={btnPrimary}>Connect Google Drive</a>
          )}
        </Section>
      )}

      <form action="/api/auth/logout" method="post">
        <button className={btnSecondary}>Sign out</button>
      </form>
    </div>
  );
}
