const serviceSelect = document.getElementById('service');
const dateInput = document.getElementById('date');
const timeSelect = document.getElementById('time');
const bookingForm = document.getElementById('bookingForm');
const loginForm = document.getElementById('loginForm');
const barberUser = document.getElementById('barberUser');
const barberPass = document.getElementById('barberPass');
const loginPanel = document.getElementById('loginPanel');
const barberPanel = document.getElementById('barberPanel');
const authBadge = document.getElementById('authBadge');
const summaryPanel = document.getElementById('summaryPanel');
const logoutButton = document.getElementById('logoutButton');
const daysGrid = document.getElementById('daysGrid');
const saveDaysButton = document.getElementById('saveDays');
const clientDays = document.getElementById('clientDays');
const dateStatus = document.getElementById('dateStatus');
const agendaDateInput = document.getElementById('agendaDate');
const refreshAgendaButton = document.getElementById('refreshAgenda');
const appointmentsList = document.getElementById('appointmentsList');
const toast = document.getElementById('toast');
const metricToday = document.getElementById('metricToday');
const metricNext = document.getElementById('metricNext');
const rescheduleDialog = document.getElementById('rescheduleDialog');
const rescheduleForm = document.getElementById('rescheduleForm');
const rescheduleService = document.getElementById('rescheduleService');
const rescheduleDate = document.getElementById('rescheduleDate');
const rescheduleTime = document.getElementById('rescheduleTime');
const closeDialog = document.getElementById('closeDialog');

let services = [];
let rescheduleId = null;
let authToken = sessionStorage.getItem('barberAuth');
let publicDays = [];
let lastClosedDate = null;
const weekDays = [
  { id: 0, label: 'Dom' },
  { id: 1, label: 'Seg' },
  { id: 2, label: 'Ter' },
  { id: 3, label: 'Qua' },
  { id: 4, label: 'Qui' },
  { id: 5, label: 'Sex' },
  { id: 6, label: 'Sab' }
];

function setAuthToken(token) {
  authToken = token;
  if (token) {
    sessionStorage.setItem('barberAuth', token);
  } else {
    sessionStorage.removeItem('barberAuth');
  }
}

function setAuthState(isLoggedIn) {
  if (isLoggedIn) {
    loginPanel.classList.add('hidden');
    barberPanel.classList.remove('hidden');
    summaryPanel.classList.remove('hidden');
    authBadge.textContent = 'Conectado';
  } else {
    loginPanel.classList.remove('hidden');
    barberPanel.classList.add('hidden');
    summaryPanel.classList.add('hidden');
    authBadge.textContent = 'Desconectado';
    appointmentsList.innerHTML = '';
    metricToday.textContent = '--';
    metricNext.textContent = '--';
  }
}

function showToast(message, type = 'info') {
  toast.textContent = message;
  toast.classList.add('show');
  toast.dataset.type = type;
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast.classList.remove('show');
  }, 2400);
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function minutesToTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function getNextOpenDate() {
  const today = new Date();
  for (let offset = 0; offset < 8; offset += 1) {
    const candidate = new Date(today);
    candidate.setDate(today.getDate() + offset);
    if (isDayOpen(candidate.getDay())) {
      return candidate;
    }
  }
  return today;
}

async function apiFetch(path, options = {}, requireAuth = false) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  if (requireAuth) {
    if (!authToken) throw new Error('Faca login para acessar a agenda.');
    headers.Authorization = `Basic ${authToken}`;
  }

  const response = await fetch(path, {
    headers,
    ...options
  });

  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    setAuthToken(null);
    setAuthState(false);
    throw new Error('Acesso restrito. Faca login.');
  }
  if (!response.ok) {
    const errorMessage = data.error || 'Erro inesperado.';
    throw new Error(errorMessage);
  }
  return data;
}

function getDayOfWeek(dateStr) {
  if (!dateStr) return null;
  const [year, month, day] = dateStr.split('-').map((part) => Number(part));
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day).getDay();
}

function isDayOpen(dayOfWeek) {
  if (dayOfWeek === null) return false;
  if (!publicDays.length) return dayOfWeek !== 1;
  const entry = publicDays.find((day) => day.day_of_week === dayOfWeek);
  if (!entry) return dayOfWeek !== 1;
  return entry.is_open === 1;
}

function updateDateStatus(dateStr) {
  if (!dateStatus) return true;
  const dayOfWeek = getDayOfWeek(dateStr);
  const isOpen = isDayOpen(dayOfWeek);
  highlightSelectedDay(dayOfWeek);

  if (isOpen) {
    dateStatus.textContent = 'Dia disponivel para atendimento.';
    dateStatus.classList.remove('closed');
    dateStatus.classList.add('open');
    dateInput.classList.remove('input-closed');
  } else {
    dateStatus.textContent = 'Dia fechado. Escolha outro dia.';
    dateStatus.classList.remove('open');
    dateStatus.classList.add('closed');
    dateInput.classList.add('input-closed');
  }
  return isOpen;
}

function highlightSelectedDay(dayOfWeek) {
  if (!clientDays) return;
  const pills = clientDays.querySelectorAll('.day-pill');
  pills.forEach((pill) => {
    const pillDay = Number(pill.dataset.day);
    if (pillDay === dayOfWeek) {
      pill.classList.add('selected');
    } else {
      pill.classList.remove('selected');
    }
  });
}

function showClosedDayState(dateStr) {
  timeSelect.innerHTML = '';
  const option = document.createElement('option');
  option.textContent = 'Dia fechado';
  option.value = '';
  option.disabled = true;
  option.selected = true;
  timeSelect.appendChild(option);

  if (lastClosedDate !== dateStr) {
    showToast('Barbearia fechada neste dia.', 'warn');
    lastClosedDate = dateStr;
  }
}

function fillServiceSelect(select, items) {
  select.innerHTML = '';
  items.forEach((service) => {
    const option = document.createElement('option');
    option.value = service.id;
    option.textContent = `${service.name} (${service.duration_minutes} min)`;
    select.appendChild(option);
  });
}

function fillTimeSelect(slots) {
  timeSelect.innerHTML = '';
  if (!slots.length) {
    const option = document.createElement('option');
    option.textContent = 'Sem horarios disponiveis';
    option.value = '';
    option.disabled = true;
    option.selected = true;
    timeSelect.appendChild(option);
    return;
  }

  slots.forEach((slot) => {
    const option = document.createElement('option');
    option.value = slot;
    option.textContent = slot;
    timeSelect.appendChild(option);
  });
}

function renderClientDays(days) {
  if (!clientDays) return;
  const dayMap = new Map(days.map((day) => [day.day_of_week, day.is_open]));
  clientDays.innerHTML = '';

  weekDays.forEach((day) => {
    const pill = document.createElement('div');
    const isOpen = dayMap.get(day.id) === 1;
    pill.className = `day-pill ${isOpen ? 'open' : 'closed'}`;
    pill.textContent = day.label;
    pill.dataset.day = String(day.id);
    clientDays.appendChild(pill);
  });
}

async function loadPublicDays() {
  try {
    const data = await apiFetch('/api/public/days');
    publicDays = data.days || [];
  } catch {
    publicDays = weekDays.map((day) => ({
      day_of_week: day.id,
      is_open: day.id === 1 ? 0 : 1
    }));
  }
  renderClientDays(publicDays);
  highlightSelectedDay(getDayOfWeek(dateInput.value));
}

function renderWorkingDays(days) {
  if (!daysGrid) return;
  const dayMap = new Map(days.map((day) => [day.day_of_week, day.is_open]));
  daysGrid.innerHTML = '';

  weekDays.forEach((day) => {
    const label = document.createElement('label');
    label.className = 'day-chip';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.day = String(day.id);
    checkbox.checked = dayMap.get(day.id) === 1;

    const span = document.createElement('span');
    span.textContent = day.label;

    label.appendChild(checkbox);
    label.appendChild(span);
    daysGrid.appendChild(label);
  });
}

async function loadWorkingDays() {
  if (!authToken) return;
  const data = await apiFetch('/api/settings/days', {}, true);
  renderWorkingDays(data.days || []);
}

async function saveWorkingDays() {
  if (!authToken || !daysGrid) return;
  const inputs = Array.from(daysGrid.querySelectorAll('input[type=\"checkbox\"]'));
  const payload = {
    days: inputs.map((input) => ({
      day_of_week: Number(input.dataset.day),
      is_open: input.checked ? 1 : 0
    }))
  };

  await apiFetch('/api/settings/days', {
    method: 'PATCH',
    body: JSON.stringify(payload)
  }, true);
  showToast('Dias atualizados.', 'success');
  await loadPublicDays();
  await loadAvailability();
}

async function loadServices() {
  const data = await apiFetch('/api/services');
  services = data.services || [];
  fillServiceSelect(serviceSelect, services);
  fillServiceSelect(rescheduleService, services);
}

async function loadAvailability() {
  const date = dateInput.value;
  if (!date) return;

  const isOpen = updateDateStatus(date);
  if (!isOpen) {
    showClosedDayState(date);
    return;
  }

  const serviceId = serviceSelect.value;
  if (!serviceId) {
    fillTimeSelect([]);
    return;
  }

  try {
    const data = await apiFetch(`/api/availability?date=${date}&service_id=${serviceId}`);
    if (!data.open) {
      updateDateStatus(date);
      showClosedDayState(date);
      return;
    }
    lastClosedDate = null;
    fillTimeSelect(data.slots || []);
  } catch (error) {
    fillTimeSelect([]);
    showToast(error.message, 'error');
  }
}

function renderAppointments(date, appointments) {
  appointmentsList.innerHTML = '';

  if (!appointments.length) {
    const empty = document.createElement('li');
    empty.className = 'list-item';
    empty.textContent = 'Nenhum agendamento para este dia.';
    appointmentsList.appendChild(empty);
    metricToday.textContent = '0';
    metricNext.textContent = '--';
    return;
  }

  let nextTime = null;
  const now = new Date();
  const todayStr = formatDate(now);

  appointments.forEach((appointment, index) => {
    const item = document.createElement('li');
    item.className = 'list-item';
    item.style.animationDelay = `${index * 60}ms`;

    const top = document.createElement('div');
    top.className = 'top';

    const time = document.createElement('div');
    time.className = 'time';
    time.textContent = `${minutesToTime(appointment.start_minute)} - ${minutesToTime(appointment.end_minute)}`;

    const status = document.createElement('span');
    status.className = 'badge';
    status.textContent = appointment.status === 'canceled' ? 'Cancelado' : 'Confirmado';

    top.appendChild(time);
    top.appendChild(status);

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `${appointment.client_name} | ${appointment.service_name}`;

    const phone = document.createElement('div');
    phone.className = 'meta';
    phone.textContent = appointment.client_phone;

    const actions = document.createElement('div');
    actions.className = 'actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'ghost';
    cancelBtn.textContent = 'Cancelar';
    cancelBtn.disabled = appointment.status === 'canceled';
    cancelBtn.addEventListener('click', () => cancelAppointment(appointment.id));

    const rescheduleBtn = document.createElement('button');
    rescheduleBtn.className = 'ghost';
    rescheduleBtn.textContent = 'Remarcar';
    rescheduleBtn.disabled = appointment.status === 'canceled';
    rescheduleBtn.addEventListener('click', () => openReschedule(appointment));

    actions.appendChild(cancelBtn);
    actions.appendChild(rescheduleBtn);

    item.appendChild(top);
    item.appendChild(meta);
    item.appendChild(phone);
    item.appendChild(actions);

    appointmentsList.appendChild(item);

    if (appointment.status === 'scheduled' && date === todayStr) {
      const appointmentDate = new Date(`${appointment.date}T${minutesToTime(appointment.start_minute)}:00`);
      if (!nextTime && appointmentDate > now) {
        nextTime = minutesToTime(appointment.start_minute);
      }
    }
  });

  const scheduled = appointments.filter((appt) => appt.status === 'scheduled');
  const firstScheduled = scheduled[0];
  metricToday.textContent = String(scheduled.length);
  metricNext.textContent = nextTime || (firstScheduled ? minutesToTime(firstScheduled.start_minute) : '--');
}

async function loadAgenda() {
  const date = agendaDateInput.value;
  if (!date) return;

  try {
    const data = await apiFetch(`/api/appointments?date=${date}`, {}, true);
    renderAppointments(date, data.appointments || []);
  } catch (error) {
    showToast(error.message, 'error');
    try {
      await loadAvailability();
    } catch {}
  }
}

async function createAppointment(event) {
  event.preventDefault();

  const payload = {
    client_name: document.getElementById('clientName').value.trim(),
    client_phone: document.getElementById('clientPhone').value.trim(),
    date: dateInput.value,
    start_time: timeSelect.value,
    service_id: Number(serviceSelect.value)
  };

  if (!payload.start_time) {
    showToast('Selecione um horario disponivel.', 'warn');
    return;
  }

  try {
    await apiFetch('/api/appointments', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    showToast('Agendamento criado com sucesso.', 'success');
    bookingForm.reset();
    dateInput.value = payload.date;
    serviceSelect.value = payload.service_id;
    await loadAvailability();
    if (authToken) {
      agendaDateInput.value = payload.date;
      await loadAgenda();
    }
  } catch (error) {
    showToast(error.message, 'error');
    try {
      await loadAvailability();
    } catch {}
  }
}

async function cancelAppointment(id) {
  try {
    await apiFetch(`/api/appointments/${id}/cancel`, { method: 'PATCH' }, true);
    showToast('Agendamento cancelado.', 'success');
    await loadAgenda();
    await loadAvailability();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function openReschedule(appointment) {
  rescheduleId = appointment.id;
  rescheduleService.value = String(appointment.service_id || services[0]?.id || '');
  rescheduleDate.value = appointment.date;
  rescheduleTime.value = minutesToTime(appointment.start_minute);
  rescheduleDialog.showModal();
}

async function submitReschedule(event) {
  event.preventDefault();
  if (!rescheduleId) return;

  const payload = {
    service_id: Number(rescheduleService.value),
    date: rescheduleDate.value,
    start_time: rescheduleTime.value
  };

  try {
    await apiFetch(`/api/appointments/${rescheduleId}/reschedule`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }, true);
    showToast('Remarcacao salva.', 'success');
    rescheduleDialog.close();
    await loadAgenda();
    await loadAvailability();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function loginBarber(event) {
  event.preventDefault();
  const username = barberUser.value.trim();
  const password = barberPass.value;

  if (!username || !password) {
    showToast('Informe login e senha.', 'warn');
    return;
  }

  try {
    await apiFetch('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    setAuthToken(btoa(`${username}:${password}`));
    barberPass.value = '';
    setAuthState(true);
    showToast('Login realizado.', 'success');
    await loadPublicDays();
    await loadWorkingDays();
    await loadAgenda();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function logoutBarber() {
  setAuthToken(null);
  setAuthState(false);
  if (daysGrid) daysGrid.innerHTML = '';
  showToast('Sessao encerrada.', 'info');
}

closeDialog.addEventListener('click', () => rescheduleDialog.close());
rescheduleForm.addEventListener('submit', submitReschedule);
bookingForm.addEventListener('submit', createAppointment);
loginForm.addEventListener('submit', loginBarber);
logoutButton.addEventListener('click', logoutBarber);
saveDaysButton.addEventListener('click', saveWorkingDays);
refreshAgendaButton.addEventListener('click', loadAgenda);
serviceSelect.addEventListener('change', loadAvailability);
dateInput.addEventListener('change', loadAvailability);
agendaDateInput.addEventListener('change', loadAgenda);

(async function init() {
  try {
    await loadPublicDays();
    const defaultDate = getNextOpenDate();
    dateInput.value = formatDate(defaultDate);
    agendaDateInput.value = formatDate(defaultDate);
    await loadServices();
    await loadAvailability();
    setAuthState(Boolean(authToken));
    if (authToken) {
      await loadWorkingDays();
      await loadAgenda();
    }
  } catch (error) {
    showToast(error.message, 'error');
  }
})();

