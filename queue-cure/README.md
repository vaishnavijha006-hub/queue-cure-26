# Queue Cure '26 🩺

**Real-time clinic token queue management — built for Queue Cure '26 on Wooble.**

Fixes the paper-token-and-shouting problem in Indian clinics: a receptionist screen to run the front desk, and a patient waiting-room display that updates the instant a token is called — no refresh, no guessing.

---

## What's inside

| Screen | Route | Purpose |
|---|---|---|
| **Receptionist** | `/reception` | Add patients, call the next token, mark no-shows, set/observe average consult time. PIN-gated. |
| **Patient waiting room** | `/waiting-room` | Big "Now Calling" display, live wait estimate, upcoming queue — meant for a TV/tablet in the waiting area. |

Both screens are driven by **one shared Socket.IO connection to one Express server**, so any action on the receptionist screen reaches every open patient screen in well under a second.

---

## Stack

- **Backend:** Node.js, Express, Socket.IO, better-sqlite3 (file-based SQL, zero external DB to install)
- **Frontend:** React 18 + Vite, react-router-dom, socket.io-client
- **No build step for the backend** — plain CommonJS, runs with `node`.

---

## Project structure

```
queue-cure/
├── server/
│   ├── src/
│   │   ├── server.js        # Express app + Socket.IO event handlers
│   │   ├── queueService.js  # All queue business logic (transactional)
│   │   ├── db.js            # SQLite connection + schema
│   │   └── seed.js          # Optional demo data generator
│   ├── .env.example
│   └── package.json
├── client/
│   ├── src/
│   │   ├── App.jsx              # Landing page (links to both screens)
│   │   ├── main.jsx              # Router entry point
│   │   ├── views/
│   │   │   ├── ReceptionistView.jsx
│   │   │   └── PatientView.jsx
│   │   ├── lib/useQueueSocket.js # Shared socket hook
│   │   └── styles/global.css
│   ├── .env.example
│   └── package.json
└── docs/
    ├── socket-event-diagram.md
    └── thought-process.md
```

---

## Running it locally

### 1. Backend

```bash
cd server
cp .env.example .env        # adjust PORT / PIN if you like
npm install
npm run seed                 # optional: adds 5 demo patients + 1 completed consult
npm run dev                  # starts on http://localhost:4000
```

### 2. Frontend

```bash
cd client
cp .env.example .env         # point VITE_SERVER_URL at your backend if not localhost
npm install
npm run dev                   # starts on http://localhost:5173
```

Open **two browser tabs**:
- `http://localhost:5173/reception` — login with PIN `1234` (or whatever you set in `.env`)
- `http://localhost:5173/waiting-room`

Click **"Call next patient"** on the receptionist tab and watch the waiting-room tab update instantly, with no refresh.

---

## How wait time is calculated (not hardcoded)

1. Every consultation records `consult_started_at` and `done_at` timestamps in SQLite.
2. Once **2 or more consultations finish today**, the server averages the real durations of the **last 10 completed consults** and uses that as the live "average consult time."
3. Until then (e.g. first patient of the day), it falls back to the receptionist's manually entered average — clearly labeled `estimated` vs `live data` on both screens.
4. A patient's estimated wait = `(number of patients ahead in queue) × (current average consult time)`.

See `docs/thought-process.md` for the full reasoning, including concurrency handling and edge cases.

---

## Key design decisions

- **PIN gate on the receptionist screen** — a shared front-desk tablet is easy to bump into; a 4-digit PIN stops accidental edits without adding real auth overhead for a hackathon scope.
- **Confirm step before "Call Next"** — prevents accidentally skipping a patient from a stray tap.
- **Priority/urgent flag** — receptionists can flag a walk-in as urgent; they jump to the front of the waiting list without losing their original token number.
- **Patient name masking on the waiting-room display** — shows "Aarav S." instead of full names, since this screen is visible to the whole room.
- **SQLite over in-memory state** — a receptionist's browser refreshing or crashing should never lose the queue.

---

## Submission checklist

- [x] Working prototype (run locally per instructions above, or deploy — see below)
- [x] GitHub repo with this README
- [x] Socket event diagram — `docs/socket-event-diagram.md`
- [x] Thought process sheet — `docs/thought-process.md`

---

## Deploying for the demo video / live link

Quick free-tier options:
- **Backend:** Render.com (Web Service, Node) or Railway — just set the same env vars from `.env.example`.
- **Frontend:** Vercel or Netlify — set `VITE_SERVER_URL` to your deployed backend URL.

Remember to update `CLIENT_ORIGIN` in the backend `.env` to your deployed frontend URL once both are live, or Socket.IO's CORS check will block the connection.
