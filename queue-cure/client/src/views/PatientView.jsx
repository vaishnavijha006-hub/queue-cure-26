import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useQueueSocket } from '../lib/useQueueSocket.js';
 
export default function PatientView() {
  const { connected, queueState } = useQueueSocket();
  const [pulse, setPulse] = useState(false);
  const prevServingRef = useRef(null);
  const [clock, setClock] = useState(new Date());
 
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
 
  useEffect(() => {
    const current = queueState?.nowServing?.token_number ?? null;
    if (prevServingRef.current !== null && current !== prevServingRef.current) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 1800);
      return () => clearTimeout(t);
    }
    prevServingRef.current = current;
  }, [queueState?.nowServing?.token_number]);
 
  const nowServing = queueState?.nowServing;
  const waiting = queueState?.waiting || [];
  const avgMin = queueState?.avgConsultMinutes ?? 8;
 
  return (
    <div style={styles.page}>
      <style>{`
        @keyframes ringPulse {
          0% { box-shadow: 0 0 0 0 rgba(217,119,46,0.55); }
          70% { box-shadow: 0 0 0 28px rgba(217,119,46,0); }
          100% { box-shadow: 0 0 0 0 rgba(217,119,46,0); }
        }
        @keyframes pulseDot { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>
 
      <header style={styles.topBar}>
        <div style={styles.clinicMark}>
          <span style={styles.clinicDot} />
          QUEUE CURE CLINIC
        </div>
        <div style={styles.clock}>{clock.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
      </header>
 
      <main style={styles.main}>
        <div style={styles.nowLabel}>NOW CALLING</div>
        <div style={{ ...styles.tokenCircle, ...(pulse ? styles.tokenCirclePulse : {}) }}>
          {nowServing ? (
            <>
              <span style={styles.tokenNumber}>#{nowServing.token_number}</span>
              <span style={styles.tokenName}>{nowServing.patient_name}</span>
            </>
          ) : (
            <span style={styles.tokenIdle}>—</span>
          )}
        </div>
 
        {!connected && (
          <div style={styles.offlineBanner}>Reconnecting to the front desk… your place in line is saved.</div>
        )}
 
        <div style={styles.statsRow}>
          <Stat label="People waiting" value={waiting.length} />
          <Stat label="Avg. consult time" value={`${avgMin} min`} sub={queueState?.avgSource === 'computed' ? 'live data' : 'estimated'} />
          <Stat label="Tokens served today" value={queueState?.doneCount ?? 0} />
        </div>
 
        <section style={styles.upNext}>
          <h2 style={styles.upNextTitle}>Up next</h2>
          {waiting.length === 0 ? (
            <p style={styles.emptyText}>No one else is waiting right now.</p>
          ) : (
            <ul style={styles.upNextList}>
              {waiting.slice(0, 6).map((t, i) => {
                const estWait = Math.round(i * avgMin);
                return (
                  <li key={t.id} style={styles.upNextItem}>
                    <span style={styles.upNextToken}>#{t.token_number}</span>
                    <span style={styles.upNextName}>
                      {maskName(t.patient_name)}
                      {t.priority ? <span style={styles.urgentTag}>URGENT</span> : null}
                    </span>
                    <span style={styles.upNextWait}>
                      {i === 0 ? 'next' : `~${estWait} min`}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {waiting.length > 6 && (
            <p style={styles.moreText}>+{waiting.length - 6} more waiting</p>
          )}
        </section>
      </main>
 
      <footer style={styles.footer}>
        <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
          <Link to="/" style={styles.backLink}>
            ← Exit display
          </Link>
          <Link to="/reception" style={styles.backLink}>
            Receptionist screen ↗
          </Link>
        </div>
        <span style={styles.footerHint}>Find your token number on the slip you were given at the desk.</span>
      </footer>
    </div>
  );
}
 
function Stat({ label, value, sub }) {
  return (
    <div style={styles.stat}>
      <div style={styles.statValue}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
      {sub && <div style={styles.statSub}>{sub}</div>}
    </div>
  );
}
 
// Light privacy touch: waiting-room display shows first name + initial only,
// since this screen is visible to every patient in the room.
function maskName(fullName) {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}
 
const styles = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(160deg, var(--teal-900) 0%, #0e2f2c 100%)',
    color: '#fff',
    display: 'flex',
    flexDirection: 'column',
  },
  topBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '22px 36px',
  },
  clinicMark: {
    fontFamily: 'var(--font-mono)',
    fontSize: 13,
    letterSpacing: '0.16em',
    color: '#cfe3df',
    display: 'flex',
    alignItems: 'center',
    gap: 9,
  },
  clinicDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: 'var(--amber)',
  },
  clock: { fontFamily: 'var(--font-mono)', fontSize: 16, color: '#cfe3df', fontWeight: 600 },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '10px 24px 30px',
  },
  nowLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: 14,
    letterSpacing: '0.22em',
    color: 'var(--amber)',
    fontWeight: 700,
    marginBottom: 22,
  },
  tokenCircle: {
    width: 'min(46vw, 340px)',
    height: 'min(46vw, 340px)',
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.06)',
    border: '2px solid rgba(255,255,255,0.16)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  tokenCirclePulse: {
    animation: 'ringPulse 1.8s ease-out',
    border: '2px solid var(--amber)',
  },
  tokenNumber: {
    fontFamily: 'var(--font-display)',
    fontSize: 'min(13vw, 92px)',
    fontWeight: 700,
    lineHeight: 1,
  },
  tokenName: { fontSize: 'clamp(16px, 2.4vw, 22px)', fontWeight: 600, color: '#dcebe8' },
  tokenIdle: { fontFamily: 'var(--font-display)', fontSize: 64, color: 'rgba(255,255,255,0.3)' },
  offlineBanner: {
    marginTop: 18,
    background: 'rgba(217,119,46,0.18)',
    border: '1px solid rgba(217,119,46,0.4)',
    color: '#ffd9b3',
    padding: '9px 16px',
    borderRadius: 10,
    fontSize: 13.5,
  },
  statsRow: {
    display: 'flex',
    gap: 'clamp(20px, 5vw, 56px)',
    marginTop: 38,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  stat: { textAlign: 'center', minWidth: 110 },
  statValue: { fontFamily: 'var(--font-display)', fontSize: 34, fontWeight: 700 },
  statLabel: { fontSize: 12.5, color: '#9fb8b4', marginTop: 4, letterSpacing: '0.02em' },
  statSub: { fontSize: 10.5, color: 'var(--amber)', fontWeight: 700, marginTop: 2, letterSpacing: '0.06em' },
  upNext: {
    marginTop: 48,
    width: '100%',
    maxWidth: 560,
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 18,
    padding: '24px 26px',
  },
  upNextTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 18,
    fontWeight: 600,
    margin: '0 0 14px',
    color: '#dcebe8',
  },
  emptyText: { color: '#9fb8b4', fontSize: 14, fontStyle: 'italic' },
  upNextList: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 },
  upNextItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '11px 4px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  },
  upNextToken: { fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 15, color: 'var(--amber)', minWidth: 44 },
  upNextName: { flex: 1, fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 },
  urgentTag: {
    background: 'rgba(194,69,69,0.25)',
    color: '#ffb3b3',
    fontSize: 10,
    fontWeight: 800,
    padding: '2px 7px',
    borderRadius: 99,
  },
  upNextWait: { fontSize: 13, color: '#9fb8b4', fontWeight: 600, minWidth: 60, textAlign: 'right' },
  moreText: { textAlign: 'center', fontSize: 12.5, color: '#9fb8b4', marginTop: 12 },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 36px 22px',
    flexWrap: 'wrap',
    gap: 8,
  },
  backLink: { color: '#9fb8b4', fontSize: 12.5, textDecoration: 'none' },
  footerHint: { color: '#7f9b96', fontSize: 12 },
};