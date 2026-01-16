const OPEN_MINUTE = 9 * 60;
const CLOSE_MINUTE = 18 * 60;
const SLOT_MINUTE = 15;
const DEFAULT_CLOSED_DAY = 1; // Monday
const DEFAULT_WORKING_DAYS = [
  { day_of_week: 0, is_open: 1 },
  { day_of_week: 1, is_open: 0 },
  { day_of_week: 2, is_open: 1 },
  { day_of_week: 3, is_open: 1 },
  { day_of_week: 4, is_open: 1 },
  { day_of_week: 5, is_open: 1 },
  { day_of_week: 6, is_open: 1 }
];
const CONFLICT_MESSAGE = 'Hor\u00e1rio esgotado - Por gentileza, selecionar outro hor\u00e1rio';
const LOGIN_RATE_LIMIT = {
  windowMs: 10 * 60 * 1000,
  maxAttempts: 8
};
const loginAttempts = new Map();

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...extraHeaders
    }
  });
}

function textResponse(text, status = 200) {
  return new Response(text, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8'
    }
  });
}

function isValidDate(dateStr) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
}

function getDayOfWeek(dateStr) {
  const date = new Date(`${dateStr}T00:00:00Z`);
  return date.getUTCDay();
}

async function isOpenDay(env, dateStr) {
  const dayOfWeek = getDayOfWeek(dateStr);
  try {
    const row = await env.DB.prepare(
      'SELECT is_open FROM working_days WHERE day_of_week = ?'
    ).bind(dayOfWeek).first();
    if (row) return row.is_open === 1;
  } catch {
    // fallback when migrations are not applied yet
  }
  return dayOfWeek !== DEFAULT_CLOSED_DAY;
}

function parseTimeToMinutes(timeStr) {
  if (!/^\d{2}:\d{2}$/.test(timeStr)) return null;
  const [hours, minutes] = timeStr.split(':').map((part) => Number(part));
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function minutesToTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function validateBusinessHours(startMinute, endMinute) {
  return startMinute >= OPEN_MINUTE && endMinute <= CLOSE_MINUTE;
}

function validateSlotAlignment(startMinute) {
  return startMinute % SLOT_MINUTE === 0;
}

function getAllowedOrigins(env) {
  const raw = env && env.ALLOWED_ORIGINS ? String(env.ALLOWED_ORIGINS) : '';
  return raw.split(',').map((origin) => origin.trim()).filter(Boolean);
}

function getCorsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return {};
  const allowed = getAllowedOrigins(env);
  if (!allowed.length) return {};

  const baseHeaders = {
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };

  if (allowed.includes('*')) {
    return {
      'Access-Control-Allow-Origin': '*',
      ...baseHeaders
    };
  }

  if (!allowed.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Vary': 'Origin',
    ...baseHeaders
  };
}

function applyCors(response, request, env) {
  const corsHeaders = getCorsHeaders(request, env);
  if (!Object.keys(corsHeaders).length) return response;
  const headers = new Headers(response.headers);
  Object.entries(corsHeaders).forEach(([key, value]) => {
    headers.set(key, value);
  });
  return new Response(response.body, { status: response.status, headers });
}

function handleOptions(request, env) {
  const corsHeaders = getCorsHeaders(request, env);
  if (!Object.keys(corsHeaders).length) {
    return new Response(null, { status: 204 });
  }
  return new Response(null, { status: 204, headers: corsHeaders });
}

function normalizeWorkingDays(rows) {
  const map = new Map(rows.map((day) => [day.day_of_week, day.is_open]));
  return DEFAULT_WORKING_DAYS.map((day) => ({
    day_of_week: day.day_of_week,
    is_open: map.has(day.day_of_week) ? map.get(day.day_of_week) : day.is_open
  }));
}

async function getWorkingDaysList(env) {
  try {
    const result = await env.DB.prepare(
      'SELECT day_of_week, is_open FROM working_days ORDER BY day_of_week'
    ).all();
    return normalizeWorkingDays(result.results || []);
  } catch {
    return DEFAULT_WORKING_DAYS;
  }
}

async function listWorkingDays(env) {
  const days = await getWorkingDaysList(env);
  return jsonResponse({ days });
}

async function listPublicDays(env) {
  const days = await getWorkingDaysList(env);
  return jsonResponse({ days });
}

async function updateWorkingDays(env, request) {
  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.days)) {
    return jsonResponse({ error: 'Informe days como lista.' }, 400);
  }

  const updates = [];
  for (const entry of body.days) {
    const day = Number(entry.day_of_week);
    if (!Number.isInteger(day) || day < 0 || day > 6) {
      return jsonResponse({ error: 'Dia da semana invalido.' }, 400);
    }
    updates.push({
      day,
      isOpen: entry.is_open ? 1 : 0
    });
  }

  if (!updates.length) {
    return jsonResponse({ error: 'Nenhum dia para atualizar.' }, 400);
  }

  const statements = updates.map((item) => {
    return env.DB.prepare(
      `
        INSERT INTO working_days (day_of_week, is_open)
        VALUES (?, ?)
        ON CONFLICT(day_of_week) DO UPDATE SET is_open = excluded.is_open
      `
    ).bind(item.day, item.isOpen);
  });

  await env.DB.batch(statements);
  return listWorkingDays(env);
}

function getBarberCredentials(env) {
  const username = env && env.BARBER_USER ? String(env.BARBER_USER) : '';
  const password = env && env.BARBER_PASS ? String(env.BARBER_PASS) : '';
  if (!username || !password) return null;
  return { username, password };
}

function getClientIp(request) {
  const header =
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('X-Forwarded-For') ||
    request.headers.get('x-forwarded-for');
  if (!header) return 'unknown';
  return header.split(',')[0].trim();
}

function checkLoginRateLimit(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || entry.resetAt <= now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_RATE_LIMIT.windowMs });
    return { blocked: false };
  }

  entry.count += 1;
  if (entry.count > LOGIN_RATE_LIMIT.maxAttempts) {
    const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    return { blocked: true, retryAfter };
  }
  return { blocked: false };
}

function parseBasicAuth(request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Basic ')) return null;
  let decoded = '';
  try {
    decoded = atob(authHeader.slice(6));
  } catch {
    return null;
  }
  const separatorIndex = decoded.indexOf(':');
  if (separatorIndex === -1) return null;
  return {
    username: decoded.slice(0, separatorIndex),
    password: decoded.slice(separatorIndex + 1)
  };
}

function isAuthorized(request, env) {
  const credentials = parseBasicAuth(request);
  const barber = getBarberCredentials(env);
  return (
    credentials &&
    barber &&
    credentials.username === barber.username &&
    credentials.password === barber.password
  );
}

function unauthorizedResponse() {
  return jsonResponse(
    { error: 'Nao autorizado.' },
    401,
    { 'WWW-Authenticate': 'Basic realm="Barbearia"' }
  );
}

async function getServiceById(db, serviceId) {
  return db.prepare(
    'SELECT id, name, duration_minutes, price_cents FROM services WHERE id = ? AND active = 1'
  ).bind(serviceId).first();
}

async function hasConflict(db, date, startMinute, endMinute, excludeId = null) {
  let query = `
    SELECT id FROM appointments
    WHERE date = ?
      AND status = 'scheduled'
      AND NOT (end_minute <= ? OR start_minute >= ?)
  `;
  const bindings = [date, startMinute, endMinute];

  if (excludeId !== null) {
    query += ' AND id != ?';
    bindings.push(excludeId);
  }

  const row = await db.prepare(query).bind(...bindings).first();
  return Boolean(row);
}

async function listServices(env) {
  const result = await env.DB.prepare(
    'SELECT id, name, duration_minutes, price_cents FROM services WHERE active = 1 ORDER BY duration_minutes, name'
  ).all();
  return jsonResponse({ services: result.results });
}

async function listAppointments(env, url) {
  const date = url.searchParams.get('date');
  if (!date || !isValidDate(date)) {
    return jsonResponse({ error: 'Data invalida. Use YYYY-MM-DD.' }, 400);
  }

  const result = await env.DB.prepare(
    `
      SELECT a.id, a.service_id, a.client_name, a.client_phone, a.date, a.start_minute, a.end_minute,
             a.status, s.name AS service_name, s.duration_minutes
      FROM appointments a
      JOIN services s ON s.id = a.service_id
      WHERE a.date = ?
      ORDER BY a.start_minute
    `
  ).bind(date).all();

  return jsonResponse({ date, appointments: result.results });
}

async function getAvailability(env, url) {
  const date = url.searchParams.get('date');
  const durationParam = url.searchParams.get('duration');
  const serviceIdParam = url.searchParams.get('service_id');

  if (!date || !isValidDate(date)) {
    return jsonResponse({ error: 'Data invalida. Use YYYY-MM-DD.' }, 400);
  }

  if (!(await isOpenDay(env, date))) {
    return jsonResponse({ date, open: false, slots: [] });
  }

  let durationMinutes = null;
  if (serviceIdParam) {
    const service = await getServiceById(env.DB, Number(serviceIdParam));
    if (!service) return jsonResponse({ error: 'Servico invalido.' }, 400);
    durationMinutes = service.duration_minutes;
  } else if (durationParam) {
    durationMinutes = Number(durationParam);
  }

  if (!durationMinutes || ![30, 45].includes(durationMinutes)) {
    return jsonResponse({ error: 'Duracao invalida. Use 30 ou 45.' }, 400);
  }

  const appointmentsResult = await env.DB.prepare(
    `
      SELECT start_minute, end_minute
      FROM appointments
      WHERE date = ? AND status = 'scheduled'
      ORDER BY start_minute
    `
  ).bind(date).all();

  const slots = [];
  for (let start = OPEN_MINUTE; start + durationMinutes <= CLOSE_MINUTE; start += SLOT_MINUTE) {
    const end = start + durationMinutes;
    const conflict = appointmentsResult.results.some((appt) => {
      return !(end <= appt.start_minute || start >= appt.end_minute);
    });
    if (!conflict) slots.push(minutesToTime(start));
  }

  return jsonResponse({ date, open: true, duration_minutes: durationMinutes, slots });
}

async function createAppointment(env, request) {
  const body = await request.json().catch(() => null);
  if (!body) return jsonResponse({ error: 'JSON invalido.' }, 400);

  const clientName = String(body.client_name || '').trim();
  const clientPhone = String(body.client_phone || '').trim();
  const date = String(body.date || '').trim();
  const startTime = String(body.start_time || '').trim();
  const serviceId = Number(body.service_id);

  if (!clientName || !clientPhone || !date || !startTime || !serviceId) {
    return jsonResponse({ error: 'Campos obrigatorios: client_name, client_phone, date, start_time, service_id.' }, 400);
  }

  if (!isValidDate(date)) return jsonResponse({ error: 'Data invalida. Use YYYY-MM-DD.' }, 400);
  if (!(await isOpenDay(env, date))) {
    return jsonResponse({ error: 'Barbearia fechada neste dia.' }, 400);
  }

  const startMinute = parseTimeToMinutes(startTime);
  if (startMinute === null) return jsonResponse({ error: 'Horario invalido. Use HH:MM.' }, 400);
  if (!validateSlotAlignment(startMinute)) return jsonResponse({ error: 'Horario deve ser multiplo de 15 minutos.' }, 400);

  const service = await getServiceById(env.DB, serviceId);
  if (!service) return jsonResponse({ error: 'Servico invalido.' }, 400);

  const endMinute = startMinute + service.duration_minutes;
  if (!validateBusinessHours(startMinute, endMinute)) {
    return jsonResponse({ error: 'Horario fora do expediente (09:00-18:00).' }, 400);
  }

  const conflict = await hasConflict(env.DB, date, startMinute, endMinute);
  if (conflict) return jsonResponse({ error: CONFLICT_MESSAGE }, 409);

  const result = await env.DB.prepare(
    `
      INSERT INTO appointments (client_name, client_phone, date, start_minute, end_minute, service_id, status)
      VALUES (?, ?, ?, ?, ?, ?, 'scheduled')
    `
  ).bind(clientName, clientPhone, date, startMinute, endMinute, service.id).run();

  return jsonResponse({
    id: result.meta.last_row_id,
    client_name: clientName,
    client_phone: clientPhone,
    date,
    start_time: startTime,
    end_time: minutesToTime(endMinute),
    service
  }, 201);
}

async function cancelAppointment(env, id) {
  const appointment = await env.DB.prepare('SELECT id, status FROM appointments WHERE id = ?').bind(id).first();
  if (!appointment) return jsonResponse({ error: 'Agendamento nao encontrado.' }, 404);

  if (appointment.status === 'canceled') {
    return jsonResponse({ id, status: 'canceled' });
  }

  await env.DB.prepare('UPDATE appointments SET status = ? WHERE id = ?').bind('canceled', id).run();
  return jsonResponse({ id, status: 'canceled' });
}

async function rescheduleAppointment(env, id, request) {
  const body = await request.json().catch(() => null);
  if (!body) return jsonResponse({ error: 'JSON invalido.' }, 400);

  const date = String(body.date || '').trim();
  const startTime = String(body.start_time || '').trim();
  const serviceId = body.service_id ? Number(body.service_id) : null;

  if (!date || !startTime) {
    return jsonResponse({ error: 'Campos obrigatorios: date, start_time.' }, 400);
  }

  if (!isValidDate(date)) return jsonResponse({ error: 'Data invalida. Use YYYY-MM-DD.' }, 400);
  if (!(await isOpenDay(env, date))) {
    return jsonResponse({ error: 'Barbearia fechada neste dia.' }, 400);
  }

  const appointment = await env.DB.prepare(
    'SELECT id, service_id, status FROM appointments WHERE id = ?'
  ).bind(id).first();

  if (!appointment) return jsonResponse({ error: 'Agendamento nao encontrado.' }, 404);
  if (appointment.status !== 'scheduled') return jsonResponse({ error: 'Agendamento cancelado.' }, 400);

  const startMinute = parseTimeToMinutes(startTime);
  if (startMinute === null) return jsonResponse({ error: 'Horario invalido. Use HH:MM.' }, 400);
  if (!validateSlotAlignment(startMinute)) return jsonResponse({ error: 'Horario deve ser multiplo de 15 minutos.' }, 400);

  const finalServiceId = serviceId || appointment.service_id;
  const service = await getServiceById(env.DB, finalServiceId);
  if (!service) return jsonResponse({ error: 'Servico invalido.' }, 400);

  const endMinute = startMinute + service.duration_minutes;
  if (!validateBusinessHours(startMinute, endMinute)) {
    return jsonResponse({ error: 'Horario fora do expediente (09:00-18:00).' }, 400);
  }

  const conflict = await hasConflict(env.DB, date, startMinute, endMinute, id);
  if (conflict) return jsonResponse({ error: CONFLICT_MESSAGE }, 409);

  await env.DB.prepare(
    `
      UPDATE appointments
      SET date = ?, start_minute = ?, end_minute = ?, service_id = ?
      WHERE id = ?
    `
  ).bind(date, startMinute, endMinute, service.id, id).run();

  return jsonResponse({
    id,
    date,
    start_time: startTime,
    end_time: minutesToTime(endMinute),
    service
  });
}

async function loginBarber(request, env) {
  const body = await request.json().catch(() => null);
  if (!body) return jsonResponse({ error: 'JSON invalido.' }, 400);
  const username = String(body.username || '').trim();
  const password = String(body.password || '').trim();

  const barber = getBarberCredentials(env);
  if (!barber) {
    return jsonResponse({ error: 'Credenciais do barbeiro nao configuradas.' }, 500);
  }

  const ip = getClientIp(request);
  const rateLimit = checkLoginRateLimit(ip);
  if (rateLimit.blocked) {
    return jsonResponse(
      { error: 'Muitas tentativas. Tente novamente mais tarde.' },
      429,
      { 'Retry-After': String(rateLimit.retryAfter) }
    );
  }

  if (username === barber.username && password === barber.password) {
    loginAttempts.delete(ip);
    return jsonResponse({ ok: true });
  }

  return unauthorizedResponse();
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === 'OPTIONS') {
    return handleOptions(request, env);
  }

  let response = null;

  if (path === '/api/health') {
    response = jsonResponse({ ok: true });
  } else if (path === '/api/services' && request.method === 'GET') {
    response = await listServices(env);
  } else if (path === '/api/public/days' && request.method === 'GET') {
    response = await listPublicDays(env);
  } else if (path === '/api/login' && request.method === 'POST') {
    response = await loginBarber(request, env);
  } else if (path === '/api/settings/days' && request.method === 'GET') {
    response = isAuthorized(request, env) ? await listWorkingDays(env) : unauthorizedResponse();
  } else if (path === '/api/settings/days' && request.method === 'PATCH') {
    response = isAuthorized(request, env) ? await updateWorkingDays(env, request) : unauthorizedResponse();
  } else if (path === '/api/appointments' && request.method === 'GET') {
    response = isAuthorized(request, env) ? await listAppointments(env, url) : unauthorizedResponse();
  } else if (path === '/api/availability' && request.method === 'GET') {
    response = await getAvailability(env, url);
  } else if (path === '/api/appointments' && request.method === 'POST') {
    response = await createAppointment(env, request);
  } else {
    const cancelMatch = path.match(/^\/api\/appointments\/(\d+)\/cancel$/);
    if (cancelMatch && request.method === 'PATCH') {
      response = isAuthorized(request, env)
        ? await cancelAppointment(env, Number(cancelMatch[1]))
        : unauthorizedResponse();
    } else {
      const rescheduleMatch = path.match(/^\/api\/appointments\/(\d+)\/reschedule$/);
      if (rescheduleMatch && request.method === 'PATCH') {
        response = isAuthorized(request, env)
          ? await rescheduleAppointment(env, Number(rescheduleMatch[1]), request)
          : unauthorizedResponse();
      } else {
        response = textResponse('Not found', 404);
      }
    }
  }

  return applyCors(response, request, env);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      return handleApi(request, env);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return textResponse('Not found', 404);
  }
};
