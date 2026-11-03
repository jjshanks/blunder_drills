-- The feedback table in D1 (SQLite). Insert only: a changed vote is a new row, and the last row wins when we read.
CREATE TABLE IF NOT EXISTS feedback (
  id      INTEGER PRIMARY KEY,
  at      TEXT NOT NULL DEFAULT (datetime('now')),
  kind    TEXT NOT NULL CHECK (kind IN ('vote', 'text')),
  vote    INTEGER CHECK (vote IN (1, -1)),
  text    TEXT,
  page    TEXT NOT NULL,
  app     TEXT,
  puzzle  TEXT            -- the puzzle and the advice as JSON: fen, type, played, line, refute, idea, allowed, note
);
