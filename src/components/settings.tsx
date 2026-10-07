"use client";

import { useState } from "react";
import { Check, Copy, Trash2 } from "lucide-react";
import {
  addFounderAction, createApiTokenAction, deleteAiKeyAction, disconnectDriveAction, removeFounderAction, revokeApiTokenAction,
  revokeGrantAction, saveAiKeyAction, setAiModelAction, setDigestUserAction, setDriveFolderAction, updateProfileAction,
} from "@/app/actions";
import { Avatar, type Founder } from "./people";
import { btnDanger, btnPrimary, btnSecondary, btnSmall, FOUNDER_COLORS, hintCls, inputCls, labelCls, relative, selectCls } from "./ui";
import { useAction } from "./use-action";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className={btnSmall}
    >
      {done ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {done ? "Copied" : label}
    </button>
  );
}

export function CodeBlock({ code }: { code: string }) {
  return (
    <div className="relative group">
      <pre className="bg-sunken rounded-md p-3 pr-20 text-xs font-mono overflow-x-auto whitespace-pre">{code}</pre>
      <div className="absolute top-1.5 right-1.5"><CopyButton text={code} /></div>
    </div>
  );
}

export function ProfileForm({ user }: { user: Founder }) {
  const { pending, run } = useAction();
  const [name, setName] = useState(user.name ?? "");
  const [color, setColor] = useState(user.color);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => updateProfileAction({ name, color }), "Saved");
      }}
      className="space-y-4"
    >
      <div>
        <label htmlFor="name" className={labelCls}>Name</label>
        <input id="name" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
      </div>
      <fieldset>
        <legend className={labelCls}>Your colour</legend>
        <div className="flex gap-2 flex-wrap">
          {FOUNDER_COLORS.map((c) => (
            <button key={c} type="button" onClick={() => setColor(c)} aria-label={`Colour ${c}`} aria-pressed={color === c} className={`w-9 h-9 rounded-full border-2 ${color === c ? "border-ink" : "border-transparent"}`} style={{ background: c }} />
          ))}
        </div>
        <p className={hintCls}>Everything you and your AI write is marked in this colour.</p>
        <div className="mt-2 px-3 py-2 rounded-r-md ai-tint text-sm" style={{ ["--who" as string]: color }}>✦ This is how text from your AI looks.</div>
      </fieldset>
      <button disabled={pending} className={btnPrimary}>Save</button>
    </form>
  );
}

const PROVIDER_OPTIONS = [
  { id: "anthropic", label: "Claude (Anthropic)", model: "claude-sonnet-5-5", keyUrl: "https://console.anthropic.com/settings/keys" },
  { id: "openai", label: "ChatGPT (OpenAI)", model: "gpt-5.5", keyUrl: "https://platform.openai.com/api-keys" },
  { id: "google", label: "Gemini (Google)", model: "gemini-flash-latest", keyUrl: "https://aistudio.google.com/apikey" },
  { id: "deepseek", label: "DeepSeek V4.1 Flash", model: "deepseek-flash", keyUrl: "https://platform.deepseek.com/api_keys" },
] as const;

export function AiKeys({ keys }: { keys: { provider: string; model: string; last4: string }[] }) {
  const { pending, run } = useAction();
  const [provider, setProvider] = useState<(typeof PROVIDER_OPTIONS)[number]["id"]>("anthropic");
  const [key, setKey] = useState("");
  const opt = PROVIDER_OPTIONS.find((p) => p.id === provider)!;
  return (
    <div className="space-y-4">
      {keys.length > 0 && (
        <ul className="divide-y divide-line border border-line rounded-md">
          {keys.map((k) => (
            <li key={k.provider} className="flex items-center gap-3 px-3 py-2 flex-wrap">
              <span className="font-medium text-sm w-40">{PROVIDER_OPTIONS.find((p) => p.id === k.provider)?.label}</span>
              <span className="text-sm text-ink-3 font-mono">…{k.last4}</span>
              <input
                defaultValue={k.model}
                aria-label="Model"
                onBlur={(e) => e.target.value !== k.model && run(() => setAiModelAction(k.provider as never, e.target.value), "Model updated")}
                className="h-8 px-2 rounded border border-line bg-surface text-sm font-mono flex-1 min-w-[160px]"
              />
              <button aria-label="Remove key" onClick={() => run(() => deleteAiKeyAction(k.provider as never))} className="p-1.5 rounded text-ink-3 hover:text-danger hover:bg-sunken"><Trash2 className="w-4 h-4" /></button>
            </li>
          ))}
        </ul>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(() => saveAiKeyAction({ provider, key }), "Key saved", () => setKey(""));
        }}
        className="space-y-2"
      >
        <div className="flex gap-2 flex-wrap">
          <select value={provider} onChange={(e) => setProvider(e.target.value as never)} aria-label="Provider" className={selectCls}>
            {PROVIDER_OPTIONS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Paste your API key" aria-label="API key" className={`${inputCls} flex-1 min-w-[220px] font-mono`} />
          <button disabled={pending || !key.trim()} className={btnPrimary}>Save key</button>
        </div>
        <p className={hintCls}>
          Get one at <a href={opt.keyUrl} target="_blank" rel="noreferrer" className="underline">{opt.keyUrl.replace("https://", "")}</a>. Default model: <code className="font-mono">{opt.model}</code>.
          Keys are encrypted and only used for your own requests.
        </p>
      </form>
    </div>
  );
}

export function ApiTokens({ tokens, mcpUrl }: { tokens: { id: string; name: string; agent: string; prefix: string; lastUsedAt: Date | null; createdAt: Date }[]; mcpUrl: string }) {
  const { pending, run } = useAction();
  const [name, setName] = useState("Hermes");
  const [agent, setAgent] = useState("Hermes");
  const [created, setCreated] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      {created && (
        <div className="rounded-md border-2 border-accent p-3 space-y-2">
          <p className="text-sm font-medium">Copy this token now. It is shown only once.</p>
          <CodeBlock code={created} />
          <p className="text-sm text-ink-2">Hermes: add this to <code className="font-mono">~/.hermes/config.yaml</code>, then restart Hermes.</p>
          <CodeBlock code={`mcp_servers:\n  startup_hq:\n    url: ${mcpUrl}\n    headers:\n      Authorization: "Bearer ${created}"`} />
        </div>
      )}
      {tokens.length > 0 && (
        <ul className="divide-y divide-line border border-line rounded-md">
          {tokens.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-3 py-2 text-sm flex-wrap">
              <span className="font-medium">{t.name}</span>
              <span className="text-ink-2">writes as “{t.agent}”</span>
              <span className="font-mono text-ink-3">{t.prefix}…</span>
              <span className="text-ink-3 ml-auto">{t.lastUsedAt ? `used ${relative(t.lastUsedAt)}` : "never used"}</span>
              <button onClick={() => confirm(`Revoke "${t.name}"? Anything using it stops working.`) && run(() => revokeApiTokenAction(t.id))} className="text-danger text-sm hover:underline">Revoke</button>
            </li>
          ))}
        </ul>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(() => createApiTokenAction({ name, agent }), undefined, (r) => setCreated((r as { data?: { token: string } }).data?.token ?? null));
        }}
        className="flex gap-2 flex-wrap items-end"
      >
        <div className="flex-1 min-w-[160px]">
          <label htmlFor="tname" className={labelCls}>What is it for</label>
          <input id="tname" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </div>
        <div className="flex-1 min-w-[140px]">
          <label htmlFor="tagent" className={labelCls}>AI name shown on its work</label>
          <input id="tagent" value={agent} onChange={(e) => setAgent(e.target.value)} className={inputCls} />
        </div>
        <button disabled={pending} className={btnPrimary}>Create token</button>
      </form>
    </div>
  );
}

export function Grants({ grants }: { grants: { id: string; agent: string; clientName: string; lastUsedAt: Date | null; createdAt: Date }[] }) {
  const { run } = useAction();
  if (!grants.length) return <p className="text-sm text-ink-3">No AI apps connected yet.</p>;
  return (
    <ul className="divide-y divide-line border border-line rounded-md">
      {grants.map((g) => (
        <li key={g.id} className="flex items-center gap-3 px-3 py-2 text-sm flex-wrap">
          <span className="font-medium">{g.agent}</span>
          <span className="text-ink-3">{g.clientName}</span>
          <span className="text-ink-3 ml-auto">{g.lastUsedAt ? `used ${relative(g.lastUsedAt)}` : `connected ${relative(g.createdAt)}`}</span>
          <button onClick={() => confirm(`Disconnect ${g.agent}?`) && run(() => revokeGrantAction(g.id))} className="text-danger text-sm hover:underline">Disconnect</button>
        </li>
      ))}
    </ul>
  );
}

export function Founders({ founders, meId, isOwner }: { founders: (Founder & { joinedAt: Date | null; isOwner: boolean })[]; meId: string; isOwner: boolean }) {
  const { pending, run } = useAction();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const used = new Set(founders.map((f) => f.color));
  return (
    <div className="space-y-4">
      <ul className="divide-y divide-line border border-line rounded-md">
        {founders.map((f) => (
          <li key={f.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <Avatar user={f} size={26} />
            <span className="flex-1">
              {f.name ?? f.email} <span className="text-ink-3">{f.email}</span>
            </span>
            <span className="text-ink-3">{f.isOwner ? "Owner" : f.joinedAt ? "Joined" : "Invited"}</span>
            {isOwner && f.id !== meId && (
              <button onClick={() => confirm(`Remove ${f.email}? Their work stays, unattributed.`) && run(() => removeFounderAction(f.id))} className="text-danger hover:underline">Remove</button>
            )}
          </li>
        ))}
      </ul>
      {isOwner && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(() => addFounderAction({ email, name, color: FOUNDER_COLORS.find((c) => !used.has(c)) }), "Added. They can sign in with Google now.", () => {
              setEmail("");
              setName("");
            });
          }}
          className="flex gap-2 flex-wrap"
        >
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="Name" className={`${inputCls} w-40`} />
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="their.gmail@gmail.com" aria-label="Email" className={`${inputCls} flex-1 min-w-[220px]`} />
          <button disabled={pending || !email} className={btnPrimary}>Add founder</button>
        </form>
      )}
    </div>
  );
}

export function FolderPicker({ current }: { current: string | null }) {
  const { pending, run } = useAction();
  const [value, setValue] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => setDriveFolderAction(value), "Folder set", () => setValue(""));
      }}
      className="space-y-2"
    >
      <label htmlFor="folder" className={labelCls}>{current ? "Change the shared folder" : "Choose the shared folder"}</label>
      <div className="flex gap-2">
        <input id="folder" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Paste the folder's link from Google Drive" className={inputCls} />
        <button disabled={pending || !value.trim()} className={btnPrimary}>Set</button>
      </div>
    </form>
  );
}

export function DriveDisconnect() {
  const { pending, run } = useAction();
  return (
    <button disabled={pending} onClick={() => confirm("Disconnect Google Drive for everyone?") && run(() => disconnectDriveAction())} className={btnDanger}>
      Disconnect
    </button>
  );
}

export function DigestToggle({ isMine, hasKey, otherName }: { isMine: boolean; hasKey: boolean; otherName: string | null }) {
  const { pending, run } = useAction();
  return (
    <div className="space-y-2">
      <p className="text-sm text-ink-2">
        {isMine ? "Your key writes the Monday summary." : otherName ? `${otherName}'s key writes the Monday summary.` : "No key chosen: the Monday summary lists facts without an AI-written overview."}
      </p>
      <button disabled={pending || (!hasKey && !isMine)} onClick={() => run(() => setDigestUserAction(!isMine))} className={btnSecondary}>
        {isMine ? "Stop using my key" : "Use my key for it"}
      </button>
    </div>
  );
}
