# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A three-person health-tech startup team in an accelerator, spread across countries. They
use Startup HQ on laptops during the working day: checking what needs them, moving tasks,
answering teammates' requests, preparing and summarising meetings, and confirming events
their AIs found. Phones are occasional.

Each person also works through their own AI assistant (Claude, ChatGPT, Gemini) or agent
(Hermes), which reads and writes the workspace for them over MCP.

## Product Purpose

One shared source of truth for the team (tasks, meetings, decisions, goals, a living
company brief and a timeline of events) that the team's AIs can run, so people spend their
time on the startup instead of copying things between documents. Success: the busywork
(meeting notes, action items, dates from chats and emails) arrives on its own, and people
only confirm, decide and answer.

## Positioning

The app is an MCP server with its own OAuth, so each person's own AI works as them on
their own subscription. Every change records the person and the agent ("Anna's ChatGPT"),
AI work is tinted in that person's colour, AI edits to human text become suggestions, and
inferred items arrive as proposed until a person confirms them.

## Operating Context

- Meetings happen in Estonian on Discord; the owner pastes transcripts. The UI is English;
  AIs answer in whatever language the user writes in.
- Events arrive from WhatsApp groups through the Hermes agent, and from forwarded emails
  through Capture.
- Team members live in different time zones; each event keeps the zone it happens in.
- Dates read DD.MM.YY and times 24-hour HH:MM.
- Private workspace: only people the owner adds can sign in. The code is public on GitHub
  as the owner's portfolio piece.

## Capabilities and Constraints

- Six places: Home (inbox), Tasks (list and board), Meetings, Timeline, Brief, Docs; plus
  Settings, decisions, goals, notes, activity and search.
- Capture (⌘K / Ctrl+K) turns text into a task, note, meeting or event.
- Requests: ask a teammate for input on a task, note, decision or event; @mentions ask too;
  an AI may only draft the answer.
- Activity log with undo for every change.
- Next.js 16, React 19, Tailwind CSS 4 with design tokens, light and dark themes.

## Brand Commitments

- Name: Startup HQ.
- Each person has a colour (one is Santorini blue, #1d5fa8); AI-authored content is tinted
  in its person's colour and marked with ✦. This marking must stay recognisable.
- Menus and buttons stay in English.

## Evidence on Hand

- Demo workspace for screenshots: `npm run seed:demo` (a made-up physiotherapy startup);
  README screenshots in `docs/screenshots/`.
- Real team data lives only in production and must never appear in public material.

## Product Principles

1. People decide, AIs do the busywork: AI output is visible, attributed and reversible.
2. What needs you comes first; everything else stays out of the way until asked for.
3. One place per kind of thing; no duplicate inboxes.
4. Low ceremony: capture is one box, confirming is one click.
