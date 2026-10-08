---
name: startup-hq
description: "Run the team's Startup HQ workspace: company brief, goals, tasks, meeting transcripts → notes, decisions, agenda."
version: 1.0.0
author: Raiko Evestus (built with Claude Code)
license: MIT
platforms: [linux, macos]
metadata:
  hermes:
    tags: [startup, tasks, meetings, notes, decisions, mcp]
    category: productivity
---

# Startup HQ

Startup HQ is the shared workspace of a three-person startup team: a living company brief,
goals and roadmap, tasks, meeting notes, a decision log, the next meeting's agenda, weekly
summaries and their Google Drive folder.
Hermes reaches it through the `startup_hq` MCP server (configured in
`~/.hermes/config.yaml` with a personal token from Settings → Personal tokens).
Everything Hermes writes is labelled "Raiko's Hermes" and tinted in Raiko's colour.

## Always

- Start with `get_overview`: it returns the company brief, the users, open work, overdue
  tasks, recent decisions, the next agenda and last week's activity.
- Write in the language Raiko is writing to you in. When working from a transcript alone,
  use the transcript's language. The app's own menus stay English; that is not your concern.
- Link tasks to the goal they serve (`goal: "G-2"`). Goals: `list_goals`, `create_goal`,
  `update_goal` (horizon now / next / later, status achieved when done).
- Keep the company brief current: after a goal is achieved, a key task is done, a decision
  is made or a meeting is summarised, call `get_brief`, then update the story with
  `edit_block` / `append_to_note` on its `noteId`, or `brief_reviewed` if it is still right.
- Checklists in notes are markdown `- [ ] item`; tick with `toggle_checklist_item`.
- Refer to tasks as `T-<n>` and decisions as `D-<n>`.
- Check `list_decisions` before suggesting something that may already be decided.
- You cannot overwrite text a person wrote. `edit_block` / `update_task` on human text
  file a suggestion instead; say so to Raiko rather than retrying.
- Tasks you *infer* (from a meeting, an email) are created with `status: "proposed"`.
  Tasks Raiko *asks for* are `"todo"`.
- Never delete. Drop a task with `status: "dropped"` if asked.

## After a meeting (transcript ready)

Meetings are held in Estonian on Discord; Raiko produces the transcripts.

1. `create_meeting` with `title`, `date` (YYYY-MM-DD) and the full `transcript`.
2. Read it back with `get_meeting` (`include_transcript: true`) if needed.
3. `save_meeting_outcome` in one call:
   - `summary`: markdown in the transcript's language, using exactly the sections in
     `get_meeting` → `summaryFormat` (headings translated), bullets over prose.
   - `decisions`: only what was actually agreed, each with a one-line rationale.
   - `action_items`: imperative titles, assignee by user name/email only when someone
     clearly took it, `due` only when a date was said.
   - `follow_ups`: open questions for the next agenda.
4. Tell Raiko: N decisions, N proposed tasks (they wait for confirmation in Review).
5. Update the company brief if the meeting changed the picture.

## Useful asks

- "What's on me this week?" → `list_tasks` with `assignee: "me"`.
- "Remind me what we decided about X" → `list_decisions` with `search`.
- "Put X on the next agenda" → `add_agenda_item`.
- "Read the pitch deck in Drive" → `drive_search`, then `drive_read`.
- Progress notes on a task → `comment_on_task` (append-only, never overwritten).

## Timeline: dates from WhatsApp

The HFE WhatsApp digest (every 15 min) is where dates turn up. For each message that
announces an **event, a deadline or an opportunity with an apply-by date**:

1. `scripts/hq.sh list_events '{"include_proposed": true, "past_days": 7}'` and skip it if
   it is already there (the server also drops same-day duplicates with similar titles).
2. `scripts/hq.sh propose_event` with:
   - `title` in the language of the message, short and specific ("HFE Demo Day").
   - `kind`: `event` (something to attend), `deadline` (something due),
     `opportunity` (a call/programme; `when` = the apply-by date).
   - `importance`: `mandatory` only when the message says attendance/submission is
     compulsory or required for the teams; `recommended` when organisers urge it;
     otherwise `optional`.
   - `when`: `"YYYY-MM-DD"` (all day) or `"YYYY-MM-DD HH:MM"` as written in the message,
     and `timezone` where it happens (HFE events: `Europe/Tallinn`; online events: the
     organiser's zone if stated). Never convert times yourself.
   - `location`, `url` if given; `description`: 1-2 sentences on what it is / what to do.
   - `source`: `"WhatsApp · <chat name>, <d Mon>"`; `source_quote`: the one announcing
     line, verbatim, at most ~300 characters. No other chat content.
3. Never confirm your own proposals; a person does that in the app. Don't propose
   chit-chat, past events, or vague "soon" with no date.
4. Mention in the digest which events you proposed (E-numbers).

## Without MCP

`scripts/hq.sh <tool> '<json>'` wraps this (needs `STARTUP_HQ_URL` and `STARTUP_HQ_TOKEN`
in `~/.hermes/.env`). Every tool is also plain HTTP: `POST $STARTUP_HQ_URL/api/v1/tools/<tool_name>` with
`Authorization: Bearer $STARTUP_HQ_TOKEN` and the tool's arguments as JSON.
`GET $STARTUP_HQ_URL/api/v1/tools` lists them with their schemas.
