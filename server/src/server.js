// src/server.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const queue = require('./queueService');

const PORT = process.env.PORT || 4000;
const RECEPTIONIST_PIN = process.env.RECEPTIONIST_PIN || '1234';
const allowedOrigins = (process.env.CLIENT_ORIGIN || '*')
  .split(',')
  .map((s) => s.trim());

const app = express();
app.use(cors({ origin: allowedOrigins.includes('*') ? '*' : allowedOrigins }));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: allowedOrigins.includes('*') ? '*' : allowedOrigins, methods: ['GET', 'POST'] },
});

// ---------- Helpers ----------

function buildFullState() {
  const { state, waiting, nowServing, doneToday, date } = queue.getQueueSnapshot();
  const avg = queue.getComputedAvgConsultMinutes();
  return {
    date,
    avgConsultMinutes: avg.minutes,
    avgSource: avg.source,
    avgSampleSize: avg.sampleSize,
    nowServing,
    waiting,
    waitingCount: waiting.length,
    doneCount: doneToday.length,
    lastCalledAt: state.last_called_at,
  };
}

// Broadcast the latest queue state to EVERY connected client (both screens).
// This single function is the live-sync mechanism: any mutation calls this
// right after committing its DB transaction.
function broadcastQueueUpdate(eventMeta = {}) {
  const payload = buildFullState();
  io.emit('queue:update', { ...payload, meta: eventMeta });
}

// ---------- REST API (used for initial load / non-socket clients) ----------

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.get('/api/queue', (req, res) => {
  res.json(buildFullState());
});

app.get('/api/queue/token/:id', (req, res) => {
  const id = Number(req.params.id);
  const position = queue.getPositionAndWaitFor(id);
  if (!position) {
    // Could be already called/done — return token status directly
    const { nowServing } = queue.getQueueSnapshot();
    return res.json({ tokensAhead: 0, called: nowServing && nowServing.id === id });
  }
  res.json(position);
});

app.post('/api/auth/receptionist', (req, res) => {
  const { pin } = req.body;
  if (pin === RECEPTIONIST_PIN) return res.json({ ok: true });
  return res.status(401).json({ ok: false, error: 'Incorrect PIN' });
});

// ---------- Socket.IO realtime events ----------
// Socket event diagram (also see /docs/socket-event-diagram.png in repo):
//
//   RECEPTIONIST CLIENT                 SERVER                  PATIENT CLIENTS
//   --------------------                ------                  ---------------
//   connect ───────────────────────────▶ |
//   "queue:request_state" ─────────────▶ |
//                                        | ── "queue:update" ──▶ (all clients, incl. sender)
//   "patient:add" {name,phone,priority}─▶ |
//                                        | ── "queue:update" ──▶ all
//   "queue:call_next" ─────────────────▶ |
//                                        | ── "queue:update" ──▶ all
//                                        | ── "queue:now_serving" {tokenNumber} ──▶ all
//   "token:skip" {tokenId} ─────────────▶ |
//                                        | ── "queue:update" ──▶ all
//   "settings:set_avg" {minutes} ───────▶ |
//                                        | ── "queue:update" ──▶ all
//   disconnect ─────────────────────────▶ | (no-op, stateless server)

io.on('connection', (socket) => {
  // Send current state immediately on connect so a freshly opened tab
  // (patient scanning a QR code, or receptionist reloading) never sees a
  // blank screen waiting for the next event.
  socket.emit('queue:update', { ...buildFullState(), meta: { reason: 'initial_sync' } });

  socket.on('queue:request_state', () => {
    socket.emit('queue:update', { ...buildFullState(), meta: { reason: 'manual_refresh' } });
  });

  socket.on('patient:add', (data, ack) => {
    try {
      if (!data || !data.patientName || !data.patientName.trim()) {
        return ack && ack({ ok: false, error: 'Patient name is required.' });
      }
      const token = queue.addPatient({
        patientName: data.patientName,
        phone: data.phone || null,
        priority: data.priority ? 1 : 0,
      });
      broadcastQueueUpdate({ reason: 'patient_added', tokenNumber: token.token_number });
      ack && ack({ ok: true, token });
    } catch (err) {
      console.error('patient:add error', err);
      ack && ack({ ok: false, error: 'Server error adding patient.' });
    }
  });

  socket.on('queue:call_next', (_data, ack) => {
    try {
      const result = queue.callNext();
      broadcastQueueUpdate({
        reason: 'call_next',
        tokenNumber: result.called ? result.called.token_number : null,
        queueEmpty: result.queueEmpty,
      });
      if (result.called) {
        io.emit('queue:now_serving', { tokenNumber: result.called.token_number, tokenId: result.called.id });
      }
      ack && ack({ ok: true, ...result });
    } catch (err) {
      console.error('queue:call_next error', err);
      ack && ack({ ok: false, error: 'Server error calling next patient.' });
    }
  });

  socket.on('token:skip', (data, ack) => {
    try {
      const result = queue.skipToken(data.tokenId);
      broadcastQueueUpdate({ reason: 'token_skipped', tokenId: data.tokenId });
      ack && ack({ ok: true, result });
    } catch (err) {
      console.error('token:skip error', err);
      ack && ack({ ok: false, error: 'Server error skipping token.' });
    }
  });

  socket.on('token:cancel', (data, ack) => {
    try {
      const result = queue.cancelToken(data.tokenId);
      if (!result) return ack && ack({ ok: false, error: 'Token cannot be cancelled (already called or done).' });
      broadcastQueueUpdate({ reason: 'token_cancelled', tokenId: data.tokenId });
      ack && ack({ ok: true });
    } catch (err) {
      console.error('token:cancel error', err);
      ack && ack({ ok: false, error: 'Server error cancelling token.' });
    }
  });

  socket.on('settings:set_avg', (data, ack) => {
    try {
      queue.setAvgConsultMinutes(data.minutes);
      broadcastQueueUpdate({ reason: 'avg_updated' });
      ack && ack({ ok: true });
    } catch (err) {
      console.error('settings:set_avg error', err);
      ack && ack({ ok: false, error: 'Server error updating average.' });
    }
  });

  socket.on('disconnect', () => {
    // Stateless server: nothing to clean up per-socket. Queue state lives in SQLite.
  });
});

server.listen(PORT, () => {
  console.log(`Queue Cure server listening on http://localhost:${PORT}`);
  console.log(`Allowed origins: ${allowedOrigins.join(', ')}`);
});
