// src/seed.js
// Run with `npm run seed` — adds a few demo patients and one completed
// consultation so the "computed average" has real data to work with
// immediately (useful when recording the demo video).
require('dotenv').config();
const db = require('./db');
const queue = require('./queueService');

const names = ['Aarav Sharma', 'Priya Nair', 'Mohammed Iqbal', 'Sneha Reddy', 'Vikram Singh'];

console.log('Seeding demo data...');

names.forEach((name, i) => {
  queue.addPatient({ patientName: name, phone: `98765${(43210 + i).toString().slice(-5)}`, priority: i === 2 ? 1 : 0 });
});

// Simulate one already-completed consultation with a real timestamp gap,
// so getComputedAvgConsultMinutes() has at least one real sample.
const date = queue.todayStr();
const seededToken = db
  .prepare(`SELECT * FROM tokens WHERE queue_date = ? ORDER BY id ASC LIMIT 1`)
  .get(date);

if (seededToken) {
  db.prepare(
    `UPDATE tokens SET status = 'done',
     called_at = datetime('now', '-12 minutes'),
     consult_started_at = datetime('now', '-12 minutes'),
     done_at = datetime('now', '-5 minutes')
     WHERE id = ?`
  ).run(seededToken.id);
  console.log(`Marked token #${seededToken.token_number} (${seededToken.patient_name}) as a completed 7-min consult.`);
}

console.log('Seed complete. Start the server with `npm run dev` or `npm start`.');
