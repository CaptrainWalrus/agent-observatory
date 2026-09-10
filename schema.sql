CREATE TABLE IF NOT EXISTS observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  observed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  event TEXT NOT NULL CHECK (event IN ('page_visit', 'unlock_success', 'unlock_rejected')),
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  user_agent TEXT,
  country TEXT,
  asn INTEGER,
  cf_ray TEXT
);
