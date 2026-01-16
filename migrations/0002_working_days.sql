PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS working_days (
  day_of_week INTEGER PRIMARY KEY CHECK (day_of_week BETWEEN 0 AND 6),
  is_open INTEGER NOT NULL DEFAULT 1
);

INSERT INTO working_days (day_of_week, is_open)
VALUES
  (0, 1),
  (1, 0),
  (2, 1),
  (3, 1),
  (4, 1),
  (5, 1),
  (6, 1)
ON CONFLICT(day_of_week) DO NOTHING;
