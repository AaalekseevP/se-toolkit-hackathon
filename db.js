const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'meeting_scheduler',
});

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS meetings (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        meeting_date DATE NOT NULL,
        unique_id VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(100),
        timezone VARCHAR(50) DEFAULT 'UTC',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE meetings ADD COLUMN IF NOT EXISTS password VARCHAR(100);
      ALTER TABLE meetings ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'UTC';
      ALTER TABLE meetings ADD COLUMN IF NOT EXISTS is_closed BOOLEAN DEFAULT FALSE;

      CREATE TABLE IF NOT EXISTS votes (
        id SERIAL PRIMARY KEY,
        meeting_id INTEGER REFERENCES meetings(id) ON DELETE CASCADE,
        voter_name VARCHAR(100) NOT NULL,
        time_slot INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS comments (
        id SERIAL PRIMARY KEY,
        meeting_id INTEGER REFERENCES meetings(id) ON DELETE CASCADE,
        author_name VARCHAR(100) NOT NULL,
        body TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'votes_meeting_name_slot_key'
        ) THEN
          ALTER TABLE votes ADD CONSTRAINT votes_meeting_name_slot_key UNIQUE(meeting_id, voter_name, time_slot);
        END IF;
      END $$;
    `);
    console.log('Database initialized');
  } finally {
    client.release();
  }
}

async function closeDB() {
  await pool.end();
}

module.exports = { pool, initDB, closeDB };
