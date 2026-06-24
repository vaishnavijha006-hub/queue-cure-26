// src/queueService.js
//
// All state-changing queue operations live here, each wrapped in a SQLite
// transaction (better-sqlite3's db.transaction()). This is the concurrency
// boundary: SQLite serializes writes on a single connection, so two rapid
// "Call Next" clicks (e.g. double-click, or receptionist + a second admin
// tab) cannot both grab the same "next waiting" row. The second call simply
// sees the updated state and acts on the next-next patient.

const db = require('./db');

// ---------- Read helpers ----------

function getState() {
  return db.prepare('SELECT * FROM clinic_state WHERE id = 1').get();
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function getQueueSnapshot() {
  const date = todayStr();
  const state = getState();

  const waiting = db
    .prepare(
      `SELECT * FROM tokens
       WHERE queue_date = ? AND status = 'waiting'
       ORDER BY priority DESC, token_number ASC`
    )
    .all(date);

  const nowServing = state.now_serving_token_id
    ? db.prepare('SELECT * FROM tokens WHERE id = ?').get(state.now_serving_token_id)
    : null;

  const doneToday = db
    .prepare(`SELECT * FROM tokens WHERE queue_date = ? AND status = 'done'`)
    .all(date);

  return { state, waiting, nowServing, doneToday, date };
}

// ---------- Real average consultation time ----------
// Computed from the last N completed consultations TODAY (falls back to the
// receptionist-set manual average if fewer than 2 data points exist yet —
// e.g. first patient of the day). This satisfies "wait time computed from
// real data, not hardcoded."

function getComputedAvgConsultMinutes() {
  const state = getState();
  const date = todayStr();

  const recentDone = db
    .prepare(
      `SELECT consult_started_at, done_at FROM tokens
       WHERE queue_date = ? AND status = 'done'
         AND consult_started_at IS NOT NULL AND done_at IS NOT NULL
       ORDER BY done_at DESC LIMIT 10`
    )
    .all(date);

  if (recentDone.length < 2) {
    // Not enough real samples yet today — use receptionist's manual setting
    return { minutes: state.avg_consult_minutes, source: 'manual', sampleSize: recentDone.length };
  }

  const durationsMin = recentDone.map((r) => {
    const start = new Date(r.consult_started_at).getTime();
    const end = new Date(r.done_at).getTime();
    return Math.max(0.5, (end - start) / 60000); // floor at 30s to avoid zero/negative noise
  });

  const avg = durationsMin.reduce((a, b) => a + b, 0) / durationsMin.length;
  return { minutes: Math.round(avg * 10) / 10, source: 'computed', sampleSize: durationsMin.length };
}

// ---------- Mutations (transactional) ----------

const addPatient = db.transaction((payload) => {
  const { patientName, phone = null, priority = 0 } = payload;
  const date = todayStr();

  const maxRow = db
    .prepare(`SELECT MAX(token_number) AS maxNum FROM tokens WHERE queue_date = ?`)
    .get(date);
  const nextNumber = (maxRow.maxNum || 0) + 1;

  const info = db
    .prepare(
      `INSERT INTO tokens (token_number, patient_name, phone, priority, status, queue_date)
       VALUES (?, ?, ?, ?, 'waiting', ?)`
    )
    .run(nextNumber, patientName.trim(), phone, priority ? 1 : 0, date);

  return db.prepare('SELECT * FROM tokens WHERE id = ?').get(info.lastInsertRowid);
});

const callNext = db.transaction(() => {
  const date = todayStr();
  const state = getState();

  // Step 1: close out whoever is currently "in_consult" (mark done) —
  // mirrors real life: receptionist clicks Call Next once the current
  // patient has left the room.
  if (state.now_serving_token_id) {
    const current = db.prepare('SELECT * FROM tokens WHERE id = ?').get(state.now_serving_token_id);
    if (current && (current.status === 'called' || current.status === 'in_consult')) {
      db.prepare(
        `UPDATE tokens SET status = 'done', done_at = datetime('now'),
         consult_started_at = COALESCE(consult_started_at, called_at) WHERE id = ?`
      ).run(current.id);
    }
  }

  // Step 2: atomically pick the next waiting patient (priority first, then
  // token order) and flip them to 'called'. Because this entire function is
  // wrapped in db.transaction(), no other call can interleave between the
  // SELECT and the UPDATE — eliminating the classic "two receptionists call
  // the same patient" race condition.
  const next = db
    .prepare(
      `SELECT * FROM tokens WHERE queue_date = ? AND status = 'waiting'
       ORDER BY priority DESC, token_number ASC LIMIT 1`
    )
    .get(date);

  if (!next) {
    db.prepare(
      `UPDATE clinic_state SET now_serving_token_id = NULL, last_called_at = datetime('now') WHERE id = 1`
    ).run();
    return { called: null, queueEmpty: true };
  }

  db.prepare(
    `UPDATE tokens SET status = 'called', called_at = datetime('now'), consult_started_at = datetime('now')
     WHERE id = ?`
  ).run(next.id);

  db.prepare(
    `UPDATE clinic_state SET now_serving_token_id = ?, last_called_at = datetime('now') WHERE id = 1`
  ).run(next.id);

  const called = db.prepare('SELECT * FROM tokens WHERE id = ?').get(next.id);
  return { called, queueEmpty: false };
});

const skipToken = db.transaction((tokenId) => {
  // Receptionist marks a called-but-no-show patient as skipped; they can be
  // re-added at the back of the queue manually. Keeps the "now serving" slot
  // from being stuck forever.
  const token = db.prepare('SELECT * FROM tokens WHERE id = ?').get(tokenId);
  if (!token) return null;

  db.prepare(`UPDATE tokens SET status = 'skipped', done_at = datetime('now') WHERE id = ?`).run(tokenId);

  const state = getState();
  if (state.now_serving_token_id === tokenId) {
    db.prepare(`UPDATE clinic_state SET now_serving_token_id = NULL WHERE id = 1`).run();
  }
  return db.prepare('SELECT * FROM tokens WHERE id = ?').get(tokenId);
});

const cancelToken = db.transaction((tokenId) => {
  // Mistake-proofing: receptionist can undo an accidental "Add Patient" only
  // while the token is still 'waiting' (hasn't been called yet).
  const token = db.prepare('SELECT * FROM tokens WHERE id = ?').get(tokenId);
  if (!token || token.status !== 'waiting') return null;
  db.prepare(`UPDATE tokens SET status = 'cancelled' WHERE id = ?`).run(tokenId);
  return token;
});

const setAvgConsultMinutes = db.transaction((minutes) => {
  const safe = Math.max(1, Math.min(120, Number(minutes) || 8));
  db.prepare('UPDATE clinic_state SET avg_consult_minutes = ? WHERE id = 1').run(safe);
  return getState();
});

// ---------- Derived view for patient screen ----------

function getPositionAndWaitFor(tokenId) {
  const { waiting, nowServing } = getQueueSnapshot();
  const { minutes: avgMin, source, sampleSize } = getComputedAvgConsultMinutes();

  const idx = waiting.findIndex((t) => t.id === tokenId);
  if (idx === -1) {
    return null; // already called/done/cancelled
  }
  const aheadCount = idx; // patients strictly ahead in line
  const estWaitMinutes = Math.round(aheadCount * avgMin);

  return {
    tokensAhead: aheadCount,
    estWaitMinutes,
    avgConsultMinutes: avgMin,
    avgSource: source,
    avgSampleSize: sampleSize,
    nowServingTokenNumber: nowServing ? nowServing.token_number : null,
  };
}

module.exports = {
  getQueueSnapshot,
  getComputedAvgConsultMinutes,
  addPatient,
  callNext,
  skipToken,
  cancelToken,
  setAvgConsultMinutes,
  getPositionAndWaitFor,
  todayStr,
};
