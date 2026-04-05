# Meeting Scheduler

A web application for finding the best meeting time based on participant availability.

## Context

**End users:** Student teams, work groups, friends

**Problem:** Hard to find a time when everyone is free. Endless messages like "does 3pm work?", "no, let's do 5pm"

**Solution:** Create a meeting → share the link → everyone marks their available slots → the app shows the best time

## Features

### Implemented
- ✅ Create meetings with name, date, and timezone
- ✅ Generate unique voting links
- ✅ Vote for available time slots (24 hours)
- ✅ Automatic best time calculation
- ✅ Results page with heatmap, stats, and detailed breakdown
- ✅ Password-protected meetings
- ✅ QR code generation for quick access (260×260, scannable)
- ✅ Countdown timer until meeting
- ✅ Copy results to clipboard / Export to CSV
- ✅ Confetti animation when a clear winner emerges
- ✅ Dark/light theme toggle (no flicker)
- ✅ Docker deployment
- ✅ **Close voting** — inline confirmation, blocks new votes
- ✅ **Voting status badges** (Open / Closed) on all pages
- ✅ **UTC offset display** on winning time and exports
- ✅ **Timezone selector** with UTC offsets and popular cities (UTC+0 → UTC+12)
- ✅ **Discussion** — threaded comments on result pages
- ✅ **AI-powered summary** of voting results

### Not yet implemented
- Email notifications / reminders
- Meeting calendar view
- Recurring meetings

## Usage

### Local setup (requires PostgreSQL)

```bash
npm install
npm start
```

Open http://localhost:3000

### Environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| DB_HOST | Database host | localhost |
| DB_PORT | Database port | 5432 |
| DB_USER | Database user | postgres |
| DB_PASSWORD | Database password | postgres |
| DB_NAME | Database name | meeting_scheduler |
| PORT | Application port | 3000 |

## Deployment

### Docker (recommended)

```bash
docker-compose up -d
```

The app will be available at http://localhost:3000

### Ubuntu 24.04 VM

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh

# Start the app
docker-compose up -d
```

## Project structure

```
├── server.js              # Express server + all routes
├── db.js                  # PostgreSQL connection
├── views/                 # EJS templates
│   ├── index.ejs          # Home page
│   ├── create.ejs         # Create meeting form
│   ├── vote.ejs           # Voting page
│   ├── result.ejs         # Results page
│   ├── meetings.ejs       # All meetings list
│   ├── password.ejs       # Password prompt
│   ├── error.ejs          # Error page
│   └── partials/
│       └── theme-init.ejs # Flicker-free dark mode
├── public/
│   ├── styles.css          # Global styles (dark/light theme)
│   └── theme.js            # Theme toggle logic
├── Dockerfile
├── docker-compose.yml
└── package.json
```

## License

MIT

---

By Roman Alekseev, Innopolis University
