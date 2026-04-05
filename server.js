const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const QRCode = require('qrcode');
const path = require('path');
const { initDB, pool } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatHumanDate(date, short = false) {
  const day = date.getUTCDate();
  const month = MONTHS[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  const dayName = short ? DAYS_SHORT[date.getUTCDay()] : DAYS[date.getUTCDay()];
  return `${dayName}, ${month} ${day}, ${year}`;
}

function formatDateShort(date) {
  const day = date.getUTCDate();
  const month = MONTHS[date.getUTCMonth()];
  return `${DAYS_SHORT[date.getUTCDay()]}, ${month} ${day}`;
}

// ─── Timezone offset helper ─────────────────────────────
function tzOffset(tz) {
  try {
    const now = new Date();
    const utc = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    const local = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    const diff = (local - utc) / 3600000;
    return diff >= 0 ? `+${diff}` : `${diff}`;
  } catch {
    return '+0';
  }
}

// ─── AI Summary Generator ─────────────────────────────────
function generateAISummary(votes, namesBySlot, totalVoters, meetingTitle, meetingDate) {
  if (!votes || votes.length === 0) {
    return `No votes yet for "${meetingTitle}" on ${meetingDate}. Share the link with participants to get started!`;
  }

  const totalVotes = votes.reduce((sum, v) => sum + parseInt(v.vote_count), 0);
  const bestTime = parseInt(votes[0].time_slot);
  const bestCount = parseInt(votes[0].vote_count);
  const secondTime = votes.length > 1 ? parseInt(votes[1].time_slot) : null;
  const secondCount = votes.length > 1 ? parseInt(votes[1].vote_count) : 0;

  // Determine consensus strength
  let consensus;
  const ratio = bestCount / totalVotes;
  if (ratio > 0.7) consensus = 'strong consensus';
  else if (ratio > 0.5) consensus = 'clear preference';
  else if (ratio > 0.35) consensus = 'slight preference';
  else consensus = 'no strong preference';

  // Time of day label
  function getTimeLabel(h) {
    if (h >= 0 && h < 6) return 'night';
    if (h >= 6 && h < 12) return 'morning';
    if (h >= 12 && h < 18) return 'afternoon';
    return 'evening';
  }

  // Build summary
  let summary = '';

  // Opening
  summary += `For "${meetingTitle}" on ${meetingDate}, `;
  summary += `${totalVoters} participant${totalVoters > 1 ? 's have' : ' has'} cast ${totalVotes} total vote${totalVotes > 1 ? 's' : ''}. `;

  // Best time
  summary += `The group has a ${consensus} for **${bestTime}:00** (${getTimeLabel(bestTime)}), which received ${bestCount} vote${bestCount > 1 ? 's' : ''}.`;

  // Top voters for best time
  if (namesBySlot[bestTime]) {
    summary += ` ${namesBySlot[bestTime].join(', ')} ${bestCount > 1 ? 'are' : 'is'} available at this time.`;
  }

  // Second best
  if (secondCount > 0 && secondCount !== bestCount) {
    const gap = bestCount - secondCount;
    summary += ` **${secondTime}:00** (${getTimeLabel(secondTime)}) is the second choice with ${secondCount} vote${secondCount > 1 ? 's' : ''}.`;
    if (namesBySlot[secondTime]) {
      summary += ` ${namesBySlot[secondTime].join(', ')} ${secondCount > 1 ? 'prefer' : 'prefers'} this slot.`;
    }
    if (gap <= 1) {
      summary += ` The competition is very close — just ${gap} vote difference!`;
    }
  }

  // Close call
  if (votes.length >= 2 && bestCount === secondCount) {
    summary += ` There's a tie between **${bestTime}:00** and **${secondTime}:00** — both received ${bestCount} votes each.`;
  }

  // Low participation note
  if (totalVotes < 3) {
    summary += ` With only ${totalVotes} vote${totalVotes > 1 ? 's' : ''}, the results may change as more people participate.`;
  }

  // Recommendation
  summary += `\n\n💡 **Recommendation:** Schedule the meeting at **${bestTime}:00**.`;
  if (ratio < 0.5) {
    summary += ` Consider also offering **${secondTime || (bestTime + 1)}:00** as a backup option for those who can't make it.`;
  }

  return summary;
}

// ─── Middleware ──────────────────────────────────────────
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.locals.tzOffset = tzOffset;

// ─── Helpers ─────────────────────────────────────────────
async function findMeeting(uniqueId) {
  const result = await pool.query('SELECT * FROM meetings WHERE unique_id = $1', [uniqueId]);
  return result.rows[0] || null;
}

function isPasswordVerified(session, meetingId) {
  return session?.verified?.[meetingId] === true;
}

function setVerified(session, meetingId) {
  if (!session.verified) session.verified = {};
  session.verified[meetingId] = true;
}

function getShareUrl(req, id) {
  return `${req.protocol}://${req.get('host')}/vote/${id}`;
}

function generateId() {
  return crypto.randomBytes(4).toString('hex');
}

// ─── Routes ──────────────────────────────────────────────

// Home + meetings list
app.get('/', async (_req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT m.*, COUNT(DISTINCT v.voter_name) as voters_count
      FROM meetings m
      LEFT JOIN votes v ON v.meeting_id = m.id
      GROUP BY m.id
      ORDER BY m.created_at DESC
    `);
    result.rows.forEach(row => {
      const md = new Date(row.meeting_date);
      row.dateDisplay = formatHumanDate(md);
      row.is_closed = row.is_closed === true;
    });
    res.render('index', { meetings: result });
  } catch (err) {
    next(err);
  }
});

// All meetings
app.get('/meetings', async (_req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT m.*, COUNT(DISTINCT v.voter_name) as voters_count
      FROM meetings m
      LEFT JOIN votes v ON v.meeting_id = m.id
      GROUP BY m.id
      ORDER BY m.created_at DESC
    `);
    result.rows.forEach(row => {
      const md = new Date(row.meeting_date);
      row.dateDisplay = formatHumanDate(md);
      row.is_closed = row.is_closed === true;
    });
    res.render('meetings', { meetings: result });
  } catch (err) {
    next(err);
  }
});

// Create — form
app.get('/create', (_req, res) => {
  res.render('create');
});

// Create — submit
app.post('/create', async (req, res, next) => {
  try {
    const { title, date, password, timezone } = req.body;

    if (!title?.trim() || !date) {
      return res.status(400).render('error', { message: 'Please fill in all required fields' });
    }

    const todayStr = new Date().toLocaleDateString('en-CA');
    if (date < todayStr) {
      return res.status(400).render('error', { message: 'Cannot create a meeting in the past' });
    }

    const uniqueId = generateId();
    const result = await pool.query(
      'INSERT INTO meetings (title, meeting_date, unique_id, password, timezone) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [title.trim(), date, uniqueId, password || null, timezone || 'UTC']
    );

    // Meeting creator is automatically verified
    if (!req.session.verified) req.session.verified = {};
    req.session.verified[result.rows[0].id] = true;

    res.redirect(`/vote/${uniqueId}`);
  } catch (err) {
    next(err);
  }
});

// Vote — page
app.get('/vote/:id', async (req, res, next) => {
  try {
    const meeting = await findMeeting(req.params.id);
    if (!meeting) return res.status(404).render('error', { message: 'Meeting not found' });

    if (meeting.password && !isPasswordVerified(req.session, meeting.id)) {
      return res.render('password', { meeting, redirectUrl: `/vote/${meeting.unique_id}` });
    }

    const shareUrl = getShareUrl(req, meeting.unique_id);
    const qrCode = await QRCode.toDataURL(shareUrl);

    // Format date
    const md = new Date(meeting.meeting_date);
    meeting.dateDisplay = formatHumanDate(md);
    res.render('vote', { meeting, uniqueId: meeting.unique_id, shareUrl, qrCode });
  } catch (err) {
    next(err);
  }
});

// Password check
app.post('/check-password/:id', async (req, res, next) => {
  try {
    const { password, redirectUrl } = req.body;
    const meeting = await findMeeting(req.params.id);
    if (!meeting) return res.status(404).render('error', { message: 'Meeting not found' });

    if (meeting.password === password) {
      setVerified(req.session, meeting.id);
      return res.redirect(redirectUrl || `/vote/${meeting.unique_id}`);
    }

    res.render('password', { meeting, redirectUrl, error: 'Incorrect password' });
  } catch (err) {
    next(err);
  }
});

// Vote — submit
app.post('/vote/:id', async (req, res, next) => {
  try {
    const meeting = await findMeeting(req.params.id);
    if (!meeting) return res.status(404).render('error', { message: 'Meeting not found' });

    if (meeting.is_closed) {
      return res.status(403).render('error', { message: 'Voting is closed for this meeting' });
    }

    const { voterName, slots } = req.body;
    if (!voterName?.trim()) {
      return res.status(400).render('error', { message: 'Please enter your name' });
    }

    if (slots) {
      const slotArray = Array.isArray(slots) ? slots : [slots];
      const values = [];
      const placeholders = [];
      let idx = 1;

      for (const slot of slotArray) {
        const s = parseInt(slot);
        if (isNaN(s) || s < 0 || s > 23) continue;
        placeholders.push(`($${idx}, $${idx + 1}, $${idx + 2})`);
        values.push(meeting.id, voterName.trim(), s);
        idx += 3;
      }

      if (placeholders.length > 0) {
        await pool.query(
          `INSERT INTO votes (meeting_id, voter_name, time_slot) VALUES ${placeholders.join(', ')} ON CONFLICT DO NOTHING`,
          values
        );
      }
    }

    res.redirect(`/result/${meeting.unique_id}`);
  } catch (err) {
    next(err);
  }
});

// Result — page
app.get('/result/:id', async (req, res, next) => {
  try {
    const meeting = await findMeeting(req.params.id);
    if (!meeting) return res.status(404).render('error', { message: 'Meeting not found' });

    if (meeting.password && !isPasswordVerified(req.session, meeting.id)) {
      return res.render('password', { meeting, redirectUrl: `/result/${meeting.unique_id}` });
    }

    const votes = await pool.query(`
      SELECT time_slot, COUNT(*) as vote_count
      FROM votes
      WHERE meeting_id = $1
      GROUP BY time_slot
      ORDER BY time_slot ASC
    `, [meeting.id]);

    const uniqueVoters = await pool.query(`
      SELECT COUNT(DISTINCT voter_name) as total
      FROM votes
      WHERE meeting_id = $1
    `, [meeting.id]);

    // Get voter names for each slot
    const votesWithNames = await pool.query(`
      SELECT time_slot, voter_name
      FROM votes
      WHERE meeting_id = $1
      ORDER BY time_slot, voter_name
    `, [meeting.id]);

    // Group names by slot
    const namesBySlot = {};
    votesWithNames.rows.forEach(v => {
      if (!namesBySlot[v.time_slot]) namesBySlot[v.time_slot] = [];
      namesBySlot[v.time_slot].push(v.voter_name);
    });

    // Total number of votes
    const totalVotesResult = await pool.query(`
      SELECT COUNT(*) as total FROM votes WHERE meeting_id = $1
    `, [meeting.id]);

    const totalVoters = parseInt(uniqueVoters.rows[0]?.total || 0);
    const totalVotes = parseInt(totalVotesResult.rows[0]?.total || 0);

    const sortedVotes = votes.rows.sort((a, b) => parseInt(b.vote_count) - parseInt(a.vote_count));
    const bestSlot = sortedVotes.length > 0 ? sortedVotes[0] : null;

    // Format date as YYYY-MM-DD for JS
    const md = new Date(meeting.meeting_date);
    const y = md.getFullYear();
    const mo = String(md.getMonth() + 1).padStart(2, '0');
    const d = String(md.getDate()).padStart(2, '0');
    meeting.dateISO = `${y}-${mo}-${d}`;

    // Human-readable date display
    meeting.dateDisplay = formatHumanDate(md);

    // AI-powered meeting summary
    meeting.aiSummary = generateAISummary(sortedVotes, namesBySlot, totalVoters, meeting.title, meeting.dateDisplay);

    // UTC-midnight of the meeting day — for countdown
    meeting.countdownTarget = new Date(`${y}-${mo}-${d}T00:00:00`).getTime();

    // Fetch comments
    const comments = await getComments(meeting.id);

    res.render('result', {
      meeting,
      votes: sortedVotes,
      bestSlot,
      totalVoters,
      totalVotes,
      namesBySlot,
      comments
    });
  } catch (err) {
    next(err);
  }
});

// Delete meeting
app.post('/delete/:id', async (req, res, next) => {
  try {
    const meeting = await findMeeting(req.params.id);
    if (!meeting) return res.status(404).render('error', { message: 'Meeting not found' });

    // For password-protected meetings, always require re-confirmation via redirect
    // unless they came from the password page (indicated by session flag)
    const deleteConfirmed = req.session._deleteConfirmed === meeting.id;
    if (meeting.password && !deleteConfirmed) {
      req.session._pendingDelete = meeting.id;
      return res.render('password', { meeting, redirectUrl: `/delete-confirm/${meeting.unique_id}` });
    }

    await pool.query('DELETE FROM meetings WHERE id = $1', [meeting.id]);
    // Clean up
    delete req.session._pendingDelete;
    delete req.session._deleteConfirmed;
    res.redirect('/meetings');
  } catch (err) {
    next(err);
  }
});

// Delete confirmation after password check
app.get('/delete-confirm/:id', async (req, res, next) => {
  try {
    const meeting = await findMeeting(req.params.id);
    if (!meeting) return res.status(404).render('error', { message: 'Meeting not found' });

    if (req.session._pendingDelete !== meeting.id) {
      return res.status(403).render('error', { message: 'Delete session expired' });
    }

    req.session._deleteConfirmed = meeting.id;
    return res.redirect(`/delete/${meeting.unique_id}`);
  } catch (err) {
    next(err);
  }
});

// Close voting
app.post('/close-vote/:id', async (req, res, next) => {
  try {
    const meeting = await findMeeting(req.params.id);
    if (!meeting) return res.status(404).render('error', { message: 'Meeting not found' });

    await pool.query('UPDATE meetings SET is_closed = TRUE WHERE id = $1', [meeting.id]);
    res.redirect(`/vote/${meeting.unique_id}`);
  } catch (err) {
    next(err);
  }
});

// Add comment
app.post('/comment/:id', async (req, res, next) => {
  try {
    const meeting = await findMeeting(req.params.id);
    if (!meeting) return res.status(404).render('error', { message: 'Meeting not found' });

    const { authorName, body } = req.body;
    if (!authorName?.trim() || !body?.trim()) {
      return res.status(400).render('error', { message: 'Name and comment are required' });
    }

    await pool.query(
      'INSERT INTO comments (meeting_id, author_name, body) VALUES ($1, $2, $3)',
      [meeting.id, authorName.trim(), body.trim()]
    );

    res.redirect(`/result/${meeting.unique_id}`);
  } catch (err) {
    next(err);
  }
});

// Get comments for a meeting
async function getComments(meetingId) {
  const result = await pool.query(`
    SELECT author_name, body, created_at
    FROM comments
    WHERE meeting_id = $1
    ORDER BY created_at ASC
  `, [meetingId]);
  return result.rows;
}

// ─── Error handler ──────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).render('error', { message: 'An internal server error occurred' });
});

// ─── Start ──────────────────────────────────────────────
async function start() {
  try {
    await initDB();
    app.listen(PORT, () => {
      console.log(`Meeting Scheduler running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start:', err);
    process.exit(1);
  }
}

start();
