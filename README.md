# Startup HQ

One workspace for a small startup team: a living company brief, goals and roadmap,
tasks (list and drag-and-drop board), meeting notes with checklists, a decision log, the
next meeting's agenda, weekly summaries and the shared Google Drive folder, built so that
each user's own AI (Claude, ChatGPT, Gemini, DeepSeek, Hermes) can run almost all of it.
Menus are English; AIs write in whatever language the user writes to them in.

- **AI works as you, on your subscription.** The app is an MCP server with OAuth at
  `/api/mcp`. Each founder connects their own Claude / ChatGPT / Gemini, so nobody
  spends someone else's credits. Hermes and scripts use personal tokens.
- **Everything AI does is marked.** Every row stores the founder and the agent
  ("Raiko's Claude") and is tinted in that founder's colour.
- **AI never overwrites a person.** AI edits to human-written text become suggestions a
  person accepts. Inferred tasks arrive as *proposed*. Every change is in the activity
  log and can be undone.
- **Meetings.** Paste the (Estonian) transcript; your AI writes the summary, decisions,
  proposed action items and follow-ups for the next agenda.
- **Company brief.** A story people and AIs keep up to date, next to a live "right now"
  computed from goals, tasks and decisions. It shows how many changes happened since the
  story was last updated; the Monday cron refreshes it with the volunteered key.
- **Five places**: Home (inbox, what changed, weekly summary), Tasks (list or board, group
  by goal), Meetings (next agenda on top), Brief (story, roadmap, decisions), Docs (notes
  and Drive).
- **Capture** (⌘K / Ctrl+K): one box for a task, a note, a pasted transcript or a question.
- **Background work**: per user, opt in; on their own key it summarises new transcripts,
  keeps the brief current and writes the Monday summary. Meeting summaries follow one
  format the team picks in Settings.
- **In-app assistant** (inside Capture) and "Summarise with my AI" run on the founder's own API key.

## Stack

Next.js 16 (App Router, server actions), Prisma 6 + Neon Postgres, AI SDK 7, Vercel
(fra1), Vercel Cron for the Monday summary. Google sign-in and Drive use plain OAuth
with `fetch`.

| Path | What |
|---|---|
| `src/lib/services/*` | Domain logic. Every write takes an `Actor` (founder + agent). |
| `src/lib/tools.ts` | The AI's capabilities, defined once; used by MCP, REST and the assistant. |
| `src/lib/mcp.ts`, `src/app/api/mcp` | Stateless MCP (streamable HTTP, JSON responses). |
| `src/app/api/oauth/*`, `src/app/oauth/authorize`, `.well-known/*` | OAuth 2.1 server with PKCE and dynamic client registration. |
| `src/app/api/v1/tools/[name]` | Same tools over plain HTTP with a bearer token. |
| `agent/hermes/startup-hq/SKILL.md` | Hermes skill. |

## Environment

| Variable | |
|---|---|
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | Neon (set by the Vercel integration) |
| `APP_SECRET` | 32+ random chars; encrypts stored API keys and the Drive token |
| `APP_URL` | Public origin, e.g. `https://startup-hq.vercel.app` |
| `OWNER_EMAIL` | The owner's Google email; may sign in first and add the others |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth web client |
| `CRON_SECRET` | Protects `/api/cron/weekly` |

### Google OAuth client

Google Cloud console → APIs & Services:

1. Enable the **Google Drive API**.
2. OAuth consent screen: External, app name "Startup HQ", add the scope
   `.../auth/drive`, then **Publish app** (In production). In Testing mode Google expires
   the Drive refresh token after 7 days. Unverified is fine for under 100 users; people
   see an "unverified app" warning once.
3. Credentials → OAuth client ID → Web application. Authorized redirect URI:
   `https://<APP_URL host>/api/auth/google/callback` (and
   `http://localhost:3000/api/auth/google/callback` for local dev).

## Local development

```bash
npm install
npx prisma migrate dev
npm run dev
```

Without Google credentials, `/api/auth/dev` signs in as `OWNER_EMAIL` (development only).
