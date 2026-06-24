# Thought Process Sheet — Queue Cure '26

## 1. Framing the problem

A clinic queue is really three small pieces of state that must always agree:
1. **Who is being seen right now** (one slot, can be empty)
2. **Who is waiting, and in what order** (an ordered list)
3. **How long, realistically, does a consult take** (a number that should improve as the day goes on)

Everything else — both screens, every button, every event — is a view onto, or a mutation of, those three things. So the first decision was: **put all three in one place** (a single SQLite database on the server) and never let either frontend hold its own copy of "truth." Both screens are dumb renderers of whatever `queue:update` last told them. This avoids an entire category of bugs where the receptionist screen and patient screen drift out of sync because each tried to compute wait times locally.

## 2. Why SQLite instead of an in-memory array

An in-memory array (`let queue = []`) would be simpler to write, but:
- A receptionist's browser tab refreshing, or the Node process restarting (crash, redeploy), would silently wipe the entire day's queue. In a real clinic that's a disaster mid-morning.
- We need a **durable, timestamped log** of when each consult started and ended to compute a real average — that's naturally a database concern, not an in-memory one.

`better-sqlite3` was chosen over a hosted DB (Postgres/Mongo) because the brief is "beginner-friendly" and a hackathon judge should be able to clone the repo and run it with zero external services or signups. SQLite with WAL mode is also genuinely fine for this load — a single clinic's front desk is nowhere near SQLite's throughput ceiling.

## 3. Concurrency — the part the rubric explicitly asks about

The dangerous moment is **"Call Next."** Two ways this can go wrong:

**a) Double-click / accidental double-submit.** A receptionist taps "Call Next" twice quickly (slow tablet, nervous tap). Naively, both requests could read "patient #5 is next," and both advance the queue, silently skipping patient #6.

**b) Two receptionist tabs/devices open at once.** Same clinic, two desks, one queue. If each computes "next patient" independently before writing, they can call the same patient twice or skip one.

**How this is actually prevented here:**
`callNext()` in `queueService.js` is wrapped in `db.transaction(...)` from better-sqlite3. Under the hood, better-sqlite3 runs on a single synchronous connection — there is no `await` between the `SELECT next waiting` and the `UPDATE ... SET status = 'called'`. JavaScript's event loop can't interleave another `callNext()` call in the middle of that synchronous transaction. The second call simply runs *after* the first one has fully committed, and reads the *already-advanced* state. That's why the diagram calls this out explicitly: "No other call_next can interleave here — single SQLite writer serializes the race."

I deliberately did **not** reach for a distributed lock, Redis, or optimistic-concurrency version numbers — that's the right call at small-clinic single-server scale, but it's also the first thing I'd add if this had to run across multiple server instances behind a load balancer (at that point the SQLite-single-writer guarantee no longer holds, and I'd move to Postgres with `SELECT ... FOR UPDATE SKIP LOCKED` or a similar row-lock pattern).

## 4. Why average wait time isn't hardcoded

The rubric weights "wait time computed from real data" at 25% — second only to live sync. The naive version (`avgWait = 8` minutes, forever) fails the moment a clinic's actual pace differs, which it always will (different doctors, different specialties, different days).

The approach:
- Every token records `consult_started_at` and `done_at`.
- `getComputedAvgConsultMinutes()` looks at the **last 10 completed consults today**, computes the real average duration, and that becomes the number both screens use.
- Until there are at least 2 real samples (e.g., 8 AM, doctor hasn't finished anyone yet), it falls back to whatever the receptionist manually typed in — clearly labeled `manual` vs `computed` on both screens so nobody mistakes a guess for a measurement.
- A patient's estimated wait = `(patients ahead of them in the ordered waiting list) × (current average)`. Recomputed fresh on every `queue:update`, never cached/hardcoded per patient.

This also self-corrects through the day: if the doctor speeds up after lunch, the rolling average catches up within a few patients instead of staying stuck at the morning's pace.

## 5. Edge cases I specifically built for

| Edge case | What happens |
|---|---|
| **Receptionist calls Next with an empty queue** | `callNext()` returns `{ called: null, queueEmpty: true }`; `now_serving_token_id` is cleared; receptionist sees a friendly "Queue is empty" toast instead of a crash or a stale "now serving" card. |
| **Patient never shows up when called** | Receptionist clicks "Mark as no-show" → `token:skip`. This frees the "now serving" slot without it counting as a completed consult (so it doesn't pollute the real average with a 0-minute "consult"). |
| **Receptionist mistypes a name and wants to undo** | `token:cancel` is only allowed while a token's status is still `waiting`. Once it's been called, it can't be silently deleted — that would corrupt the historical log used for the average. This is the main "mistake-proof" mechanism. |
| **Urgent / walk-in patient** | A `priority` flag bumps a patient to the front of the waiting order (`ORDER BY priority DESC, token_number ASC`) without renumbering anyone else's token — so a patient's printed/displayed token number never silently changes underneath them. |
| **First patient of the day** | No completed consults yet → average falls back to the manually set number rather than dividing by zero or showing "NaN min." |
| **Receptionist screen left open on a shared tablet** | PIN gate on `/reception` (checked server-side via `/api/auth/receptionist`) stops a patient or passerby from accidentally calling the next token. |
| **Patient screen reconnecting (Wi-Fi blip on the waiting-room TV)** | Socket.IO's built-in reconnection fires `queue:request_state` on reconnect, so the display self-heals to the current truth instead of staying frozen on stale data. A small "Reconnecting…" banner is shown meanwhile so it's visibly not lying to patients. |
| **Two browser tabs both submit "Add Patient" with the same name** | Treated as two separate patients with two separate token numbers — token numbers, not names, are the unique identifier, which mirrors how paper tokens already work today. |
| **Clock rolls over to a new day mid-shift** | All queries filter by `queue_date = date('now')`, so token numbering and the average-consult calculation both reset cleanly at midnight without manual intervention. |

## 6. What I'd build next with more time

- **Multi-doctor / multi-room support** — right now there's one `now_serving` slot; real clinics often have 2–3 doctors running in parallel. The schema already supports this (`tokens` table doesn't assume a single room), but `clinic_state` would need to become one row per room.
- **SMS/WhatsApp ping** when a patient is 2 tokens away, instead of requiring them to watch a screen.
- **Audit log export** for the receptionist (who called what, when) for accountability disputes ("the receptionist skipped me!").
- **Authentication beyond a shared PIN** if multiple receptionists need individually attributable actions.
