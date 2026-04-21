# Neewlook Barber - Scheduling (Cloudflare D1)

Modern scheduling system with a single conflict rule that prevents overlapping appointments.

## Requirements
- Node 20+
- Wrangler CLI (`npm install` already installs it)

## Configure D1
1. `wrangler d1 create neewlookbarber`
2. Update `database_id` in `wrangler.toml`
3. `npm run d1:apply`
4. Optional: `npm run d1:local` to use local D1

## Run Locally
- `npm run dev`

## Security and Credentials
- Set the barber login through Wrangler secrets:
  - `wrangler secret put BARBER_USER`
  - `wrangler secret put BARBER_PASS`
- For local development, create `.dev.vars` with `BARBER_USER` and `BARBER_PASS`.
- Optional: restrict CORS with `ALLOWED_ORIGINS` as a comma-separated list.

## Endpoints
- `GET /api/services`
- `GET /api/public/days`
- `GET /api/availability?date=YYYY-MM-DD&service_id=1`
- `GET /api/appointments?date=YYYY-MM-DD`
- `POST /api/appointments`
- `PATCH /api/appointments/:id/cancel`
- `PATCH /api/appointments/:id/reschedule`
- `POST /api/login`
- `GET /api/settings/days`
- `PATCH /api/settings/days`

## Example Payload
```json
{
  "client_name": "John Smith",
  "client_phone": "11999990000",
  "date": "2025-01-18",
  "start_time": "10:30",
  "service_id": 1
}
```

## Rules
- Working hours, default setup: Tuesday to Sunday, 09:00-18:00, Monday closed
- Slots: 15 minutes
- Duration: 30 or 45 minutes depending on the service
- Conflict rule: overlapping appointments are not allowed

## Working Days
- The barber can enable or disable weekdays in the panel.
- The API stores the configuration in `working_days` and blocks bookings on closed days.

## Barber Access
- Configure `BARBER_USER` and `BARBER_PASS` in Cloudflare secrets.
- Only the logged-in barber can list, cancel, or reschedule appointments.
- Hidden panel: access `/barbeiro/` for login and management.
