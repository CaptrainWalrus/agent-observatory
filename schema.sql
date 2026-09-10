CREATE TABLE IF NOT EXISTS observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  observed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  event TEXT NOT NULL CHECK (event IN ('page_visit', 'unlock_success', 'unlock_rejected')),
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  user_agent TEXT
);

CREATE TABLE IF NOT EXISTS fruit_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submitted_at TEXT NOT NULL,
  fruit TEXT NOT NULL,
  timestamp_hash TEXT NOT NULL,
  pseudonym TEXT NOT NULL,
  user_agent TEXT
);

CREATE TABLE IF NOT EXISTS access_journeys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fruit_submission_id INTEGER NOT NULL,
  pseudonym TEXT NOT NULL,
  objective_token_hash TEXT NOT NULL UNIQUE,
  objective TEXT,
  objective_at TEXT,
  place_token_hash TEXT UNIQUE,
  place TEXT,
  place_at TEXT
);
