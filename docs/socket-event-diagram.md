# Socket Event Diagram — Queue Cure '26

One Express + Socket.IO server. Every connected client (receptionist tab(s) and every patient waiting-room tab/device) is in the same default Socket.IO room, so `io.emit()` reaches all of them simultaneously.

## Event catalogue

| Event | Direction | Payload | Triggered by | Server response |
|---|---|---|---|---|
| `connect` | client → server | — | New tab/device opens either screen | Server immediately `emit`s a fresh `queue:update` to that socket only |
| `queue:request_state` | client → server | — | Manual refresh / reconnect | `queue:update` to that socket only |
| `patient:add` | client → server | `{ patientName, phone?, priority? }` | Receptionist submits "Add patient" form | Inserts row in transaction → broadcasts `queue:update` to **all** clients + acks the sender with the new token |
| `queue:call_next` | client → server | `{}` | Receptionist clicks "Call next patient" (after confirm) | Atomically closes current consult + advances queue (transaction) → broadcasts `queue:update` **and** `queue:now_serving` to all clients |
| `token:skip` | client → server | `{ tokenId }` | Receptionist marks current patient as no-show | Updates status → broadcasts `queue:update` to all |
| `token:cancel` | client → server | `{ tokenId }` | Receptionist removes a still-waiting token (mistake undo) | Updates status (only if still `waiting`) → broadcasts `queue:update` to all |
| `settings:set_avg` | client → server | `{ minutes }` | Receptionist edits the manual average consult time | Updates `clinic_state` → broadcasts `queue:update` to all |
| `queue:update` | server → **all clients** | Full queue snapshot (see below) | Any of the above mutations, or a fresh connection | Both screens re-render from this single payload — this is the live-sync mechanism |
| `queue:now_serving` | server → **all clients** | `{ tokenNumber, tokenId }` | Specifically after a successful `queue:call_next` | Lets the patient screen trigger its "pulse" animation distinctly from a generic state refresh |
| `disconnect` | client → server | — | Tab closed / network drop | No-op — server is stateless per-socket; all truth lives in SQLite |

## `queue:update` payload shape

```json
{
  "date": "2026-06-20",
  "avgConsultMinutes": 7.4,
  "avgSource": "computed",
  "avgSampleSize": 6,
  "nowServing": { "id": 12, "token_number": 14, "patient_name": "Aarav Sharma", "...": "..." },
  "waiting": [ { "id": 13, "token_number": 15, "patient_name": "Priya Nair", "priority": 0, "...": "..." } ],
  "waitingCount": 4,
  "doneCount": 11,
  "lastCalledAt": "2026-06-20T09:42:10.000Z",
  "meta": { "reason": "call_next", "tokenNumber": 15, "queueEmpty": false }
}
```

## Sequence — the core "Call Next" flow

```
Receptionist tab                 Server (Express + Socket.IO + SQLite)              Patient tab(s)
       |                                      |                                          |
       |--- queue:call_next {} -------------->|                                          |
       |                                      | BEGIN TRANSACTION                        |
       |                                      |   mark current "in_consult" -> "done"    |
       |                                      |   SELECT next waiting (priority, token#) |
       |                                      |   UPDATE that row -> "called"            |
       |                                      |   UPDATE clinic_state.now_serving_token  |
       |                                      | COMMIT                                   |
       |                                      |                                          |
       |<---------- ack({ok:true, called}) ---|                                          |
       |                                      |---- queue:update (full snapshot) ------->| (and back to sender too)
       |                                      |---- queue:now_serving {tokenNumber} ---->| (triggers pulse animation)
       |                                      |                                          |
   [toast: "Now calling #15"]                                                  [big number flips to #15, ring pulses]
```

Because steps 2–5 happen inside one SQLite transaction on a single connection, a second `queue:call_next` arriving a millisecond later (double-click, or a second receptionist tab) **cannot** read the pre-update state — it waits for the transaction to commit, then operates on the already-advanced queue. This is what prevents two patients from being called simultaneously into the same "now serving" slot.
