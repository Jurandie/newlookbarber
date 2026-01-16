PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes IN (30, 45)),
  price_cents INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_name TEXT NOT NULL,
  client_phone TEXT NOT NULL,
  date TEXT NOT NULL,
  start_minute INTEGER NOT NULL,
  end_minute INTEGER NOT NULL,
  service_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'canceled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (end_minute > start_minute),
  FOREIGN KEY (service_id) REFERENCES services(id)
);

CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(date);
CREATE INDEX IF NOT EXISTS idx_appointments_status_date ON appointments(status, date);
CREATE INDEX IF NOT EXISTS idx_appointments_time ON appointments(date, start_minute, end_minute);

INSERT INTO services (name, duration_minutes, price_cents)
SELECT 'Corte', 30, 0
WHERE NOT EXISTS (SELECT 1 FROM services WHERE name = 'Corte');

INSERT INTO services (name, duration_minutes, price_cents)
SELECT 'Barba', 30, 0
WHERE NOT EXISTS (SELECT 1 FROM services WHERE name = 'Barba');

INSERT INTO services (name, duration_minutes, price_cents)
SELECT 'Corte + Barba', 45, 0
WHERE NOT EXISTS (SELECT 1 FROM services WHERE name = 'Corte + Barba');
