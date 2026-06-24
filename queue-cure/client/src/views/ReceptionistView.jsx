import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useQueueSocket } from '../lib/useQueueSocket.js';
 
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:4000';
 
export default function ReceptionistView() {
  const { connected, queueState, addPatient, callNext, skipToken, cancelToken, setAvgMinutes } =
    useQueueSocket();
 
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
 
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [priority, setPriority] = useState(false);
  const [formError, setFormError] = useState('');
  const [toast, setToast] = useState(null);
  const [confirmCallNext, setConfirmCallNext] = useState(false);
  const [avgInput, setAvgInput] = useState('');
  const [callBusy, setCallBusy] = useState(false);
 
  const nameInputRef = useRef(null);
  const toastTimer = useRef(null);
 
  useEffect(() => {
    if (queueState && avgInput === '') setAvgInput(String(queueState.avgConsultMinutes));
  }, [queueState]);
 
  function showToast(message, kind = 'info') {
    setToast({ message, kind });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }
 
  async function handlePinSubmit(e) {
    e.preventDefault();
    setPinError('');
    try {
      const res = await fetch(`${SERVER_URL}/api/auth/receptionist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (data.ok) {
        setUnlocked(true);
        setTimeout(() => nameInputRef.current?.focus(), 100);
      } else {
        setPinError('Incorrect PIN. Try again.');
      }
    } catch {
      setPinError('Could not reach the server. Check the connection.');
    }
  }
 
  async function handleAddPatient(e) {
    e.preventDefault();
    setFormError('');
    const trimmed = name.trim();
    if (!trimmed) {
      setFormError('Enter the patient\u2019s name before adding them to the queue.');
      return;
    }
    if (trimmed.length < 2) {
      setFormError('That name looks too short — please check it.');
      return;
    }
    const res = await addPatient({ patientName: trimmed, phone: phone.trim(), priority });
    if (res.ok) {
      showToast(`Token #${res.token.token_number} added for ${res.token.patient_name}.`, 'success');
      setName('');
      setPhone('');
      setPriority(false);
      nameInputRef.current?.focus();
    } else {
      setFormError(res.error || 'Could not add patient. Try again.');
    }
  }
 
  async function handleCallNext() {
    setCallBusy(true);
    const res = await callNext();
    setCallBusy(false);
    setConfirmCallNext(false);
    if (res.ok) {
      if (res.queueEmpty) showToast('Queue is empty — no one left to call.', 'info');
      else showToast(`Now calling token #${res.called.token_number} — ${res.called.patient_name}.`, 'call');
    } else {
      showToast(res.error || 'Could not call next patient.', 'error');
    }
  }
 
  async function handleSkip(tokenId, tokenNumber) {
    const res = await skipToken(tokenId);
    if (res.ok) showToast(`Token #${tokenNumber} marked as no-show.`, 'info');
  }
 
  async function handleCancel(tokenId, tokenNumber) {
    const res = await cancelToken(tokenId);
    if (res.ok) showToast(`Token #${tokenNumber} removed.`, 'info');
    else showToast(res.error || 'Could not remove — already called.', 'error');
  }
 
  async function handleAvgBlur() {
    const val = Number(avgInput);
    if (!val || val < 1 || val > 120) {
      showToast('Average must be between 1 and 120 minutes.', 'error');
      setAvgInput(String(queueState?.avgConsultMinutes ?? 8));
      return;
    }
    await setAvgMinutes(val);
    showToast(`Manual average set to ${val} min (used until real data takes over).`, 'info');
  }
 
  if (!unlocked) {
    return (
      <div style={styles.lockPage}>
        <div style={styles.lockCard}>
          <div style={styles.eyebrow}>RECEPTIONIST ACCESS</div>
          <h1 style={styles.lockTitle}>Enter desk PIN</h1>
          <p style={styles.lockSub}>Keeps the front-desk screen from being changed by accident.</p>
          <form onSubmit={handlePinSubmit} style={{ width: '100%' }}>
            <input
              type="password"
              inputMode="numeric"
              autoFocus
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••"
              style={styles.pinInput}
            />
            {pinError && <div style={styles.errorText}>{pinError}</div>}
            <button type="submit" style={styles.primaryBtn}>
              Unlock desk
            </button>
          </form>
          <Link to="/" style={styles.backLink}>
            ← Back
          </Link>
        </div>
      </div>
    );
  }
 
  const waiting = queueState?.waiting || [];
  const nowServing = queueState?.nowServing;
 
  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <div style={styles.eyebrow}>RECEPTIONIST · FRONT DESK</div>
          <h1 style={styles.h1}>Today's queue</h1>
        </div>
        <div style={styles.headerRight}>
          <Link to="/waiting-room" style={styles.screenLink} target="_blank" rel="noopener noreferrer">
            Open patient screen ↗
          </Link>
          <div style={styles.connBadge(connected)}>
            <span style={styles.dot(connected)} />
            {connected ? 'Live' : 'Reconnecting…'}
          </div>
        </div>
      </header>
 
      <div style={styles.grid}>
        {/* LEFT: Add patient + Now serving + Call Next */}
        <section style={styles.panel}>
          <h2 style={styles.h2}>Add patient</h2>
          <form onSubmit={handleAddPatient} style={styles.form}>
            <label style={styles.label} htmlFor="patientName">
              Patient name
            </label>
            <input
              id="patientName"
              ref={nameInputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Aarav Sharma"
              style={styles.input}
              autoComplete="off"
            />
 
            <label style={styles.label} htmlFor="patientPhone">
              Phone <span style={styles.optional}>(optional)</span>
            </label>
            <input
              id="patientPhone"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^\d+\s-]/g, ''))}
              placeholder="98765 43210"
              style={styles.input}
              inputMode="tel"
            />
 
            <label style={styles.checkboxRow}>
              <input type="checkbox" checked={priority} onChange={(e) => setPriority(e.target.checked)} />
              Mark as urgent (seen before normal tokens)
            </label>
 
            {formError && <div style={styles.errorText}>{formError}</div>}
 
            <button type="submit" style={styles.primaryBtn}>
              + Add to queue
            </button>
          </form>
 
          <div style={styles.divider} />
 
          <h2 style={styles.h2}>Now serving</h2>
          {nowServing ? (
            <div style={styles.nowServingCard}>
              <div style={styles.tokenBig}>#{nowServing.token_number}</div>
              <div style={styles.nowServingName}>{nowServing.patient_name}</div>
              <button
                style={styles.skipBtn}
                onClick={() => handleSkip(nowServing.id, nowServing.token_number)}
              >
                Mark as no-show
              </button>
            </div>
          ) : (
            <div style={styles.emptyServing}>No one is currently being called.</div>
          )}
 
          {!confirmCallNext ? (
            <button
              style={styles.callNextBtn}
              disabled={callBusy}
              onClick={() => setConfirmCallNext(true)}
            >
              Call next patient →
            </button>
          ) : (
            <div style={styles.confirmBox}>
              <div style={{ marginBottom: 10, fontWeight: 600 }}>
                {nowServing
                  ? `Mark #${nowServing.token_number} as done and call the next token?`
                  : 'Call the next waiting token?'}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button style={styles.confirmYes} disabled={callBusy} onClick={handleCallNext}>
                  {callBusy ? 'Calling…' : 'Yes, call next'}
                </button>
                <button style={styles.confirmNo} onClick={() => setConfirmCallNext(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
 
          <div style={styles.divider} />
 
          <h2 style={styles.h2}>Average consult time</h2>
          <p style={styles.helperText}>
            {queueState?.avgSource === 'computed'
              ? `Auto-calculated from the last ${queueState.avgSampleSize} consults today. You can still override it.`
              : 'Used to estimate patient wait times until real consult data builds up.'}
          </p>
          <div style={styles.avgRow}>
            <input
              type="number"
              min="1"
              max="120"
              value={avgInput}
              onChange={(e) => setAvgInput(e.target.value)}
              onBlur={handleAvgBlur}
              style={styles.avgInput}
            />
            <span style={styles.avgUnit}>minutes / patient</span>
            {queueState?.avgSource === 'computed' && <span style={styles.liveBadge}>● live data</span>}
          </div>
        </section>
 
        {/* RIGHT: Waiting list */}
        <section style={styles.panel}>
          <div style={styles.waitingHeader}>
            <h2 style={styles.h2}>Waiting list</h2>
            <span style={styles.countBadge}>{waiting.length} waiting</span>
          </div>
 
          {waiting.length === 0 ? (
            <div style={styles.emptyServing}>No one is waiting. Add a patient to get started.</div>
          ) : (
            <ul style={styles.list}>
              {waiting.map((t, i) => (
                <li key={t.id} style={styles.listItem}>
                  <span style={styles.listToken}>#{t.token_number}</span>
                  <span style={styles.listName}>
                    {t.patient_name}
                    {t.priority ? <span style={styles.urgentTag}>URGENT</span> : null}
                  </span>
                  <span style={styles.listPos}>{i === 0 ? 'next' : `${i} ahead`}</span>
                  <button
                    style={styles.removeBtn}
                    title="Remove this token"
                    onClick={() => handleCancel(t.id, t.token_number)}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
 
      {toast && <div style={styles.toast(toast.kind)}>{toast.message}</div>}
    </div>
  );
}
 
const styles = {
  page: { minHeight: '100vh', background: 'var(--paper)', padding: '28px 32px 60px' },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 28,
    flexWrap: 'wrap',
    gap: 16,
  },
  eyebrow: {
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    letterSpacing: '0.14em',
    color: 'var(--amber)',
    fontWeight: 700,
  },
  h1: { fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 600, color: 'var(--teal-900)', margin: '4px 0 0' },
  h2: { fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 600, color: 'var(--teal-900)', margin: '0 0 14px' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' },
  screenLink: {
    fontSize: 13.5,
    fontWeight: 600,
    color: 'var(--teal-700)',
    textDecoration: 'none',
    border: '1.5px solid var(--line)',
    padding: '7px 14px',
    borderRadius: 99,
    background: 'var(--paper-raised)',
  },
  connBadge: (live) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    fontWeight: 600,
    color: live ? 'var(--green)' : '#9a6b00',
    background: live ? 'var(--green-bg)' : '#fbeed4',
    padding: '6px 14px',
    borderRadius: 99,
  }),
  dot: (live) => ({
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: live ? 'var(--green)' : '#c98a00',
    display: 'inline-block',
    animation: live ? 'none' : 'pulse 1.4s infinite',
  }),
  grid: { display: 'grid', gridTemplateColumns: 'minmax(320px, 420px) 1fr', gap: 26, alignItems: 'start' },
  panel: {
    background: 'var(--paper-raised)',
    border: '1px solid var(--line)',
    borderRadius: 16,
    padding: '26px 26px 30px',
    boxShadow: '0 8px 24px var(--shadow)',
  },
  form: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 13.5, fontWeight: 600, color: '#3c4a47', marginTop: 10 },
  optional: { fontWeight: 400, color: '#92a09d' },
  input: {
    padding: '11px 13px',
    fontSize: 16,
    border: '1.5px solid var(--line)',
    borderRadius: 10,
    background: '#fff',
    color: 'var(--ink)',
  },
  checkboxRow: { display: 'flex', alignItems: 'center', gap: 9, fontSize: 14, marginTop: 12, color: '#3c4a47' },
  errorText: {
    background: 'var(--red-bg)',
    color: 'var(--red)',
    padding: '9px 12px',
    borderRadius: 9,
    fontSize: 13.5,
    marginTop: 10,
    fontWeight: 500,
  },
  primaryBtn: {
    marginTop: 16,
    background: 'var(--teal-900)',
    color: '#fff',
    border: 'none',
    padding: '13px 18px',
    borderRadius: 10,
    fontSize: 15.5,
    fontWeight: 700,
    width: '100%',
  },
  divider: { height: 1, background: 'var(--line)', margin: '24px 0' },
  nowServingCard: {
    background: 'var(--teal-900)',
    color: '#fff',
    borderRadius: 14,
    padding: '20px 22px',
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    flexWrap: 'wrap',
  },
  tokenBig: { fontFamily: 'var(--font-display)', fontSize: 38, fontWeight: 700, fontFeatureSettings: '"tnum"' },
  nowServingName: { fontSize: 16, fontWeight: 600, flex: 1 },
  skipBtn: {
    background: 'rgba(255,255,255,0.14)',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.3)',
    padding: '8px 12px',
    borderRadius: 8,
    fontSize: 12.5,
    fontWeight: 600,
  },
  emptyServing: { color: '#8a9794', fontSize: 14.5, padding: '18px 0', fontStyle: 'italic' },
  callNextBtn: {
    width: '100%',
    marginTop: 18,
    background: 'var(--amber)',
    color: '#fff',
    border: 'none',
    padding: '16px 20px',
    borderRadius: 12,
    fontSize: 17,
    fontWeight: 800,
    letterSpacing: '0.01em',
  },
  confirmBox: {
    marginTop: 18,
    background: 'var(--amber-dim)',
    borderRadius: 12,
    padding: '16px 18px',
  },
  confirmYes: {
    background: 'var(--teal-900)',
    color: '#fff',
    border: 'none',
    padding: '10px 16px',
    borderRadius: 8,
    fontWeight: 700,
    fontSize: 14,
  },
  confirmNo: {
    background: 'transparent',
    color: '#3c4a47',
    border: '1.5px solid var(--line)',
    padding: '10px 16px',
    borderRadius: 8,
    fontWeight: 600,
    fontSize: 14,
  },
  helperText: { fontSize: 13.5, color: '#566663', marginTop: -6, marginBottom: 12, lineHeight: 1.5 },
  avgRow: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  avgInput: {
    width: 80,
    padding: '10px 12px',
    fontSize: 16,
    border: '1.5px solid var(--line)',
    borderRadius: 9,
    fontFamily: 'var(--font-mono)',
    fontWeight: 700,
  },
  avgUnit: { fontSize: 14, color: '#566663' },
  liveBadge: { fontSize: 12, color: 'var(--green)', fontWeight: 700, marginLeft: 'auto' },
  waitingHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  countBadge: {
    background: 'var(--teal-100)',
    color: 'var(--teal-900)',
    fontSize: 13,
    fontWeight: 700,
    padding: '5px 12px',
    borderRadius: 99,
  },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 },
  listItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '13px 16px',
    background: '#fff',
    border: '1px solid var(--line)',
    borderRadius: 11,
  },
  listToken: {
    fontFamily: 'var(--font-mono)',
    fontWeight: 700,
    fontSize: 15,
    color: 'var(--teal-900)',
    minWidth: 42,
  },
  listName: { flex: 1, fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 },
  urgentTag: {
    background: 'var(--red-bg)',
    color: 'var(--red)',
    fontSize: 10.5,
    fontWeight: 800,
    padding: '2px 7px',
    borderRadius: 99,
    letterSpacing: '0.05em',
  },
  listPos: { fontSize: 12.5, color: '#8a9794', fontWeight: 600, minWidth: 56, textAlign: 'right' },
  removeBtn: {
    background: 'transparent',
    border: 'none',
    color: '#b7c0bd',
    fontSize: 16,
    padding: '4px 6px',
    borderRadius: 6,
  },
  toast: (kind) => ({
    position: 'fixed',
    bottom: 28,
    left: '50%',
    transform: 'translateX(-50%)',
    background:
      kind === 'success' ? 'var(--green)' : kind === 'error' ? 'var(--red)' : kind === 'call' ? 'var(--amber)' : 'var(--teal-900)',
    color: '#fff',
    padding: '13px 22px',
    borderRadius: 11,
    fontSize: 14.5,
    fontWeight: 600,
    boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
    zIndex: 50,
    maxWidth: '90vw',
  }),
  lockPage: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--teal-900)',
  },
  lockCard: {
    background: 'var(--paper-raised)',
    borderRadius: 18,
    padding: '40px 36px',
    width: 320,
    textAlign: 'center',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
  },
  lockTitle: { fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 600, color: 'var(--teal-900)', margin: '8px 0 6px' },
  lockSub: { fontSize: 13.5, color: '#566663', marginBottom: 22 },
  pinInput: {
    width: '100%',
    textAlign: 'center',
    fontSize: 26,
    letterSpacing: '0.3em',
    padding: '14px',
    border: '1.5px solid var(--line)',
    borderRadius: 10,
    fontFamily: 'var(--font-mono)',
  },
  backLink: { display: 'inline-block', marginTop: 20, fontSize: 13, color: '#7c8a87', textDecoration: 'none' },
};