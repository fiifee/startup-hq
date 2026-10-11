/**
 * Fills an empty local database with a made-up three-person startup, for
 * screenshots and trying the app out. Everything goes through the same tools
 * the AIs use, so authorship, suggestions and the activity log are real.
 *
 *   DATABASE_URL=postgresql://…localhost…/hq npx tsx --tsconfig tsconfig.json scripts/seed-demo.ts
 *
 * Refuses to run against anything but a local database.
 */
import { ai, human, type Actor } from "@/lib/actor";
import { db } from "@/lib/db";
import { runTool } from "@/lib/tools";
import { briefNote, markBriefReviewed } from "@/lib/services/brief";
import { appendToNote } from "@/lib/services/notes";

const url = process.env.DATABASE_URL ?? "";
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
  console.error("seed-demo only runs against a local database (DATABASE_URL on localhost).");
  process.exit(1);
}

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
type Ref = { ref?: string; id?: string };
const call = (actor: Actor, name: string, args: unknown) => runTool(actor, name, args) as Promise<Ref & Record<string, unknown>>;

async function main() {
  if (await db.user.count()) throw new Error("Database is not empty; seed a fresh one.");

  const [raiko, anna, mark] = await Promise.all([
    db.user.create({ data: { email: "raiko@example.com", name: "Raiko Evestus", color: "#1d5fa8", isOwner: true, joinedAt: new Date() } }),
    db.user.create({ data: { email: "anna@example.com", name: "Anna Tamm", color: "#b5562b", joinedAt: new Date(), timezone: "Europe/Berlin" } }),
    db.user.create({ data: { email: "mark@example.com", name: "Mark Liiv", color: "#8a4fa3", joinedAt: new Date(), timezone: "Europe/Helsinki" } }),
  ]);
  const R = human(raiko.id), A = human(anna.id), M = human(mark.id);
  const rClaude = ai(raiko.id, "Claude"), rHermes = ai(raiko.id, "Hermes"), aGPT = ai(anna.id, "ChatGPT"), mGemini = ai(mark.id, "Gemini");

  // The company brief: a story people and AIs keep current.
  const brief = await briefNote();
  await appendToNote(R, brief.id, "## What we're building\nKinetic is a home-exercise app for physiotherapy patients: the physio prescribes a programme, the phone camera checks form, and the clinic sees adherence between visits.");
  await appendToNote(rClaude, brief.id, "## Where we are\nSeven clinics in Tallinn and Tartu are piloting the app with 140 patients. Week-4 adherence is 71% against a 40% baseline from paper handouts. Next: turn two pilots into paying contracts and apply to the EU health accelerator.");
  await appendToNote(A, brief.id, "## Team\n- **Raiko**: product and engineering\n- **Anna**: clinical partnerships, based in Berlin\n- **Mark**: pose-estimation model, based in Helsinki");

  // Goals and roadmap.
  const g1 = await call(R, "create_goal", { title: "Two paying clinics", horizon: "now", target: day(50), owner: "Anna", description: "Convert pilots to annual contracts at €290/month per clinic." });
  const g2 = await call(M, "create_goal", { title: "Form check on budget phones", horizon: "now", target: day(35), owner: "Mark", description: "Pose model at 30 fps on a 2021 Android mid-range phone." });
  await call(rClaude, "create_goal", { title: "EU accelerator application", horizon: "next", owner: "Raiko" });
  await call(A, "create_goal", { title: "Insurance reimbursement pilot", horizon: "later" });

  // Tasks, by people and by their AIs.
  const t1 = await call(A, "create_task", { title: "Send pricing proposal to Kesklinna Physio", assignee: "Anna", due: day(3), priority: "high", status: "doing", goal: g1.ref, tags: ["sales"] });
  await call(R, "create_task", { title: "Clinic dashboard: weekly adherence export", assignee: "Raiko", due: day(9), status: "todo", goal: g1.ref });
  await call(M, "create_task", { title: "Quantise pose model to int8", assignee: "Mark", status: "doing", goal: g2.ref, tags: ["ml"] });
  await call(mGemini, "create_task", { title: "Benchmark on Galaxy A52 and Redmi Note 10", assignee: "Mark", due: day(6), status: "todo", goal: g2.ref, tags: ["ml"] });
  const t5 = await call(rClaude, "create_task", { title: "Draft data-processing agreement for clinics", assignee: "Raiko", due: day(12), status: "todo", goal: g1.ref, description: "Based on the Tartu clinic's template. Needs a GDPR Article 28 section." });
  await call(R, "create_task", { title: "Fix onboarding crash on Android 11", assignee: "Raiko", status: "done", priority: "urgent" });
  await call(A, "create_task", { title: "Collect three patient testimonials", assignee: "Anna", status: "blocked", goal: g1.ref, description: "Waiting for the consent form from legal." });
  await call(aGPT, "create_task", { title: "Shortlist accelerator programmes with health tracks", assignee: "Anna", due: day(14), status: "todo" });
  await call(R, "create_task", { title: "Record a 60-second product demo", status: "todo" });

  await call(A, "comment_on_task", { task: t1.ref, body: "Kesklinna wants a 3-month trial price first. I'd offer €190 for the trial, then the normal rate." });
  await call(rClaude, "comment_on_task", { task: t1.ref, body: "Two other pilots asked about trial pricing in last week's notes. Worth one trial offer for all clinics?" });
  await call(R, "ask_teammate", { to: ["Mark"], task: t5.ref, question: "@Mark can you check the section on where video frames are processed before Friday? I wrote that nothing leaves the phone." });
  await call(M, "ask_teammate", { to: ["Raiko"], task: t1.ref, question: "Is the trial price per clinic or per physio? I need it for the cost model by tomorrow." });

  // Decisions, made and still open.
  await call(R, "record_decision", { title: "Process video on the phone only", rationale: "Clinics will not sign if patient video leaves the device; also cheaper." });
  await call(A, "record_decision", { title: "Price per clinic, not per patient", rationale: "Physios hated counting patients in the pilot interviews." });
  await call(aGPT, "propose_decision", { question: "Do we offer a discounted 3-month trial?", context: "Two of seven pilot clinics asked for one." });
  await call(rClaude, "propose_decision", { question: "Build the iOS app before the accelerator deadline?", context: "60% of pilot patients use Android." });

  // Meeting with a transcript and an AI-written outcome.
  const meeting = await call(R, "create_meeting", {
    title: "Weekly sync",
    date: day(-4),
    transcript: "Raiko: Kesklinna asked for a trial price.\nAnna: Two others asked too. I think one trial offer for everyone.\nMark: The int8 model runs at 24 fps on the A52, I need another week.\nRaiko: Then the demo video waits until the model is faster.",
  });
  const meetingId = (meeting.id ?? meeting.meetingId) as string;
  await call(rClaude, "save_meeting_outcome", {
    meeting_id: meetingId,
    summary: "## Summary\n- Three pilot clinics want a trial price before signing.\n- Pose model reaches 24 fps on the A52; target is 30.\n\n## Next steps\n- [ ] Anna drafts one trial offer for all clinics\n- [ ] Mark profiles the slowest layers\n- [x] Raiko fixed the Android 11 crash",
    action_items: [{ title: "Profile the slowest layers of the pose model", assignee: "Mark", due: day(5) }],
    follow_ups: ["Trial length: 2 or 3 months?"],
  });
  await call(A, "add_agenda_item", { text: "Accelerator: who writes which section" });

  // Timeline: confirmed events and ones Hermes found in WhatsApp.
  const e1 = await call(R, "create_event", {
    title: "Accelerator demo day", kind: "event", importance: "mandatory", when: `${day(10)} 14:00`, ends: `${day(10)} 17:30`, timezone: "Europe/Tallinn",
    location: "Telliskivi 60a, Tallinn", links: [{ label: "Join Zoom", url: "https://zoom.us/j/0000000000" }, { label: "Agenda (PDF)", url: "https://example.com/agenda.pdf" }],
  });
  await call(A, "create_event", { title: "Health-tech grant: application deadline", kind: "deadline", importance: "recommended", when: day(18), timezone: "Europe/Brussels" });
  await call(rHermes, "propose_event", {
    title: "Investor office hours", kind: "opportunity", importance: "optional", when: `${day(5)} 10:00`, timezone: "Europe/Tallinn",
    source: "WhatsApp · Founders group", source_quote: "Office hours with two angel investors next week, 20-minute slots, sign up via the link.",
    links: [{ label: "Sign up", url: "https://example.com/office-hours" }],
  });
  await call(R, "set_attendance", { event: e1.ref, status: "going" });
  await call(A, "set_attendance", { event: e1.ref, status: "going" });
  await call(M, "set_attendance", { event: e1.ref, status: "maybe" });
  await call(A, "add_event_note", { event: e1.ref, body: "5-minute pitch slot. Bring the adherence chart from the brief." });

  // A note with a checklist.
  const note = await call(A, "create_note", { title: "Clinic onboarding checklist", content: "- [x] Sign the pilot agreement\n- [x] Create physio accounts\n- [ ] Print QR codes for patients\n- [ ] Book a 30-minute training session" });
  void note;
  await markBriefReviewed();

  console.log("Demo workspace ready. Sign in locally at /api/auth/dev?email=raiko@example.com");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
