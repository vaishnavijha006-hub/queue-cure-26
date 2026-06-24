import React from 'react';
import { Link } from 'react-router-dom';

export default function App() {
  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>QUEUE CURE &apos;26</div>
      <h1 style={styles.title}>The waiting room, fixed.</h1>
      <p style={styles.sub}>
        One queue, two screens, zero shouting. Pick where you're standing.
      </p>

      <div style={styles.cards}>
        <Link to="/reception" style={{ ...styles.card, ...styles.cardReception }}>
          <span style={styles.cardLabel}>Front desk</span>
          <span style={styles.cardTitle}>Receptionist</span>
          <span style={styles.cardDesc}>Add patients, call the next token, set timing.</span>
        </Link>
        <Link to="/waiting-room" style={{ ...styles.card, ...styles.cardPatient }}>
          <span style={styles.cardLabel}>Waiting room</span>
          <span style={styles.cardTitle}>Patient display</span>
          <span style={styles.cardDesc}>See who's being called and your estimated wait.</span>
        </Link>
      </div>

      <p style={styles.footnote}>
        Tip: open each link in a separate browser tab or device to see live sync in action.
      </p>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px 24px',
    textAlign: 'center',
    background:
      'radial-gradient(circle at 20% 20%, var(--teal-100), transparent 60%), var(--paper)',
  },
  eyebrow: {
    fontFamily: 'var(--font-mono)',
    fontSize: 13,
    letterSpacing: '0.18em',
    color: 'var(--amber)',
    fontWeight: 700,
    marginBottom: 18,
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: 'clamp(2.2rem, 5vw, 3.6rem)',
    color: 'var(--teal-900)',
    margin: '0 0 14px',
    letterSpacing: '-0.01em',
  },
  sub: {
    fontSize: 17,
    color: '#4a5b58',
    maxWidth: 460,
    margin: '0 0 44px',
    lineHeight: 1.5,
  },
  cards: {
    display: 'flex',
    gap: 24,
    flexWrap: 'wrap',
    justifyContent: 'center',
    maxWidth: 720,
  },
  card: {
    textDecoration: 'none',
    color: 'var(--ink)',
    background: 'var(--paper-raised)',
    border: '1px solid var(--line)',
    borderRadius: 18,
    padding: '32px 30px',
    width: 280,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 8,
    boxShadow: '0 10px 30px var(--shadow)',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
  },
  cardReception: { borderTop: '4px solid var(--teal-700)' },
  cardPatient: { borderTop: '4px solid var(--amber)' },
  cardLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    letterSpacing: '0.1em',
    color: '#7c8a87',
    textTransform: 'uppercase',
  },
  cardTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 26,
    fontWeight: 600,
    color: 'var(--teal-900)',
  },
  cardDesc: {
    fontSize: 14.5,
    color: '#566663',
    lineHeight: 1.5,
  },
  footnote: {
    marginTop: 40,
    fontSize: 13,
    color: '#8a9794',
  },
};
