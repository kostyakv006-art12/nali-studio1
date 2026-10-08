'use strict';

/**
 * Nail Studio — сервер записи.
 * Express отдаёт статику из public/ и REST API, node-telegram-bot-api
 * пересылает заявки мастеру и принимает нажатия «Подтвердить / Отклонить».
 * Данные хранятся в JSON-файлах в data/ (создаются автоматически).
 */

require('dotenv').config({ path: require('path').join(__dirname, require('path').basename(__dirname) === 'src' ? '..' : '.', '.env') });
if (!process.env.TZ) process.env.TZ = 'Europe/Moscow';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');

// Корень проекта: работает и для исходника src/server.js, и для собранного server.js
const ROOT = path.basename(__dirname) === 'src' ? path.dirname(__dirname) : __dirname;

// ───────────────────────── Настройки ─────────────────────────
const PORT = Number(process.env.PORT) || 3000;
const BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
const ADMIN_CHAT_ID = (process.env.TELEGRAM_CHAT_ID || '').trim();
const PENDING_TTL_HOURS = Number(process.env.PENDING_TTL_HOURS ?? 24) || 0;

const DAYS_AHEAD = 30;
const TIME_SLOTS = ['10:00', '11:30', '13:00', '14:30', '16:00', '17:30', '19:00'];
const SLOT = { FREE: 'free', PENDING: 'pending', BOOKED: 'booked' };

// Услуги и цены — в файле services.json в корне проекта (правится без пересборки)
const SERVICES = JSON.parse(fs.readFileSync(path.join(ROOT, 'services.json'), 'utf8'));

// ───────────────────────── Хранилище ─────────────────────────
const DATA_DIR = path.join(ROOT, 'data');
const BOOKINGS_FILE = path.join(DATA_DIR, 'bookings.json');
const SCHEDULE_FILE = path.join(DATA_DIR, 'schedule.json');

function readJson(file, fallback) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return raw.trim() ? JSON.parse(raw) : fallback;
  } catch (err) {
    if (err.code !== 'ENOENT') console.error(`[data] Не удалось прочитать ${path.basename(file)}:`, err.message);
    return fallback;
  }
}

// Атомарная запись: сначала во временный файл, затем rename — файл не побьётся при сбое
function writeJson(file, data) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

fs.mkdirSync(DATA_DIR, { recursive: true });
let bookings = readJson(BOOKINGS_FILE, []);
let schedule = readJson(SCHEDULE_FILE, {});
if (!Array.isArray(bookings)) bookings = [];
if (typeof schedule !== 'object' || Array.isArray(schedule) || schedule === null) schedule = {};

const saveBookings = () => writeJson(BOOKINGS_FILE, bookings);
const saveSchedule = () => writeJson(SCHEDULE_FILE, schedule);

// ───────────────────────── Даты ─────────────────────────
const pad = (n) => String(n).padStart(2, '0');
const toISODate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayISO = () => toISODate(new Date());
const nowHHMM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

function formatDateRu(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' });
}

/** Скользящее окно на 30 дней: добавляет недостающие дни и убирает прошедшие. */
function syncSchedule() {
  const today = todayISO();
  const keep = new Set();
  const base = new Date();
  base.setHours(0, 0, 0, 0);

  for (let i = 0; i < DAYS_AHEAD; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const key = toISODate(d);
    keep.add(key);
    schedule[key] = schedule[key] || {};
    for (const t of TIME_SLOTS) {
      if (!schedule[key][t]) schedule[key][t] = { status: SLOT.FREE, bookingId: null };
    }
  }
  // Прошлые дни удаляем; будущие дни за пределами окна (если уже есть брони) оставляем
  for (const key of Object.keys(schedule)) {
    if (key < today) delete schedule[key];
    else if (!keep.has(key) && !Object.values(schedule[key]).some((s) => s.status !== SLOT.FREE)) delete schedule[key];
  }
  // Сортируем ключи, чтобы файл было удобно читать глазами
  schedule = Object.fromEntries(Object.entries(schedule).sort(([a], [b]) => a.localeCompare(b)));
  saveSchedule();
}

function isSlotInPast(date, time) {
  const today = todayISO();
  return date < today || (date === today && time <= nowHHMM());
}

function freeSlots(date) {
  const day = schedule[date];
  if (!day) return [];
  return TIME_SLOTS.filter((t) => day[t] && day[t].status === SLOT.FREE && !isSlotInPast(date, t));
}

function setSlot(date, time, status, bookingId = null) {
  if (!schedule[date] || !schedule[date][time]) return;
  schedule[date][time] = { status, bookingId: status === SLOT.FREE ? null : bookingId };
  saveSchedule();
}

// ───────────────────────── Валидация ─────────────────────────
const NAME_RE = /^[A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё\s'-]{1,49}$/;
const TG_RE = /^@?[A-Za-z][A-Za-z0-9_]{4,31}$/;
const TG_LINK_RE = /^(https?:\/\/)?(t\.me|telegram\.me)\/[A-Za-z][A-Za-z0-9_]{4,31}\/?$/i;
const VK_RE = /^(https?:\/\/)?(m\.)?(vk\.com|vk\.ru)\/[A-Za-z0-9_.]{2,50}\/?$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const clean = (v, max = 200) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');

function normalizePhone(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith('9')) digits = `7${digits}`;
  return digits.length >= 10 && digits.length <= 15 ? `+${digits}` : null;
}

function validateBooking(body) {
  const errors = {};
  const name = clean(body.name, 50);
  const ageNum = Number(body.age);
  const phone = normalizePhone(body.phone);
  const contact = clean(body.contact, 100);
  const service = SERVICES.find((s) => s.id === body.service);
  const date = clean(body.date, 10);
  const time = clean(body.time, 5);
  const comment = typeof body.comment === 'string' ? body.comment.trim().slice(0, 500) : '';

  if (!NAME_RE.test(name)) errors.name = 'Укажите имя (2–50 букв)';
  if (!Number.isInteger(ageNum) || ageNum < 14 || ageNum > 99) errors.age = 'Возраст — число от 14 до 99';
  if (!phone) errors.phone = 'Укажите корректный номер телефона';
  if (!(TG_RE.test(contact) || TG_LINK_RE.test(contact) || VK_RE.test(contact))) {
    errors.contact = 'Укажите @username в Telegram или ссылку на ВК';
  }
  if (!service) errors.service = 'Выберите услугу';
  if (!DATE_RE.test(date) || !schedule[date]) errors.date = 'Выберите дату в ближайшие 30 дней';
  else if (!TIME_SLOTS.includes(time)) errors.time = 'Выберите время';
  else if (!freeSlots(date).includes(time)) errors.time = 'Это время уже занято — выберите другое';

  return {
    errors,
    data: { name, age: ageNum, phone, contact, service, date, time, comment },
  };
}

// ───────────────────────── Telegram ─────────────────────────
let bot = null;

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const priceText = (s) => `${s.from ? 'от ' : ''}${s.price.toLocaleString('ru-RU')} ₽`;

function contactLink(contact) {
  if (VK_RE.test(contact)) return contact.startsWith('http') ? contact : `https://${contact}`;
  const username = contact.replace(/^(https?:\/\/)?(t\.me|telegram\.me)\//i, '').replace(/^@/, '').replace(/\/$/, '');
  return `https://t.me/${username}`;
}

const STATUS_LABEL = {
  pending: '⏳ На рассмотрении',
  confirmed: '✅ Подтверждена',
  rejected: '❌ Отклонена',
  expired: '⌛ Отклонена автоматически (нет ответа)',
};

function bookingMessage(b) {
  return [
    `<b>💅 Новая заявка №${escapeHtml(b.id.slice(0, 6).toUpperCase())}</b>`,
    '',
    `<b>Имя:</b> ${escapeHtml(b.name)}`,
    `<b>Возраст:</b> ${b.age}`,
    `<b>Телефон:</b> <code>${b.phone}</code>`,
    `<b>Связь:</b> <a href="${escapeHtml(contactLink(b.contact))}">${escapeHtml(b.contact)}</a>`,
    `<b>Услуга:</b> ${escapeHtml(b.serviceTitle)}`,
    `<b>Цена:</b> ${escapeHtml(b.priceText)}`,
    `<b>Дата:</b> ${escapeHtml(formatDateRu(b.date))}`,
    `<b>Время:</b> ${b.time}`,
    `<b>Комментарий:</b> ${b.comment ? escapeHtml(b.comment) : '—'}`,
    '',
    `<b>Статус:</b> ${STATUS_LABEL[b.status]}`,
  ].join('\n');
}

const decisionKeyboard = (id) => ({
  inline_keyboard: [[
    { text: '✅ Подтвердить', callback_data: `confirm:${id}` },
    { text: '❌ Отклонить', callback_data: `reject:${id}` },
  ]],
});

async function notifyMaster(b) {
  if (!bot || !ADMIN_CHAT_ID) {
    console.warn('[telegram] Бот не настроен — заявка сохранена только в data/bookings.json');
    return;
  }
  const msg = await bot.sendMessage(ADMIN_CHAT_ID, bookingMessage(b), {
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: decisionKeyboard(b.id),
  });
  b.telegramMessageId = msg.message_id;
  saveBookings();
}

/** Применяет решение мастера: confirmed → слот занят, rejected/expired → слот свободен. */
function resolveBooking(b, status) {
  b.status = status;
  b.updatedAt = new Date().toISOString();
  if (status === 'confirmed') setSlot(b.date, b.time, SLOT.BOOKED, b.id);
  else setSlot(b.date, b.time, SLOT.FREE);
  saveBookings();
}

async function refreshTelegramMessage(b) {
  if (!bot || !ADMIN_CHAT_ID || !b.telegramMessageId) return;
  try {
    await bot.editMessageText(bookingMessage(b), {
      chat_id: ADMIN_CHAT_ID,
      message_id: b.telegramMessageId,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: [] },
    });
  } catch (err) {
    console.error('[telegram] Не удалось обновить сообщение:', err.message);
  }
}

function initBot() {
  if (!BOT_TOKEN) {
    console.warn('[telegram] TELEGRAM_BOT_TOKEN не задан — бот выключен');
    return;
  }
  bot = new TelegramBot(BOT_TOKEN, { polling: true });

  bot.on('polling_error', (err) => {
    // Неверный токен — сообщаем один раз и останавливаем опрос, чтобы не засорять консоль
    if (err.response && err.response.statusCode === 401) {
      console.error('[telegram] Неверный TELEGRAM_BOT_TOKEN (401). Проверьте .env и перезапустите сервер.');
      bot.stopPolling();
      return;
    }
    console.error('[telegram] polling error:', err.code || '', err.message);
  });

  // /start подсказывает chat_id — удобно при первичной настройке
  bot.onText(/^\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, `Привет! Ваш chat_id: <code>${msg.chat.id}</code>\nУкажите его в .env как TELEGRAM_CHAT_ID.`, { parse_mode: 'HTML' });
  });

  bot.on('callback_query', async (q) => {
    const [action, id] = String(q.data || '').split(':');
    const fromChat = String(q.message?.chat?.id ?? '');

    if (fromChat !== ADMIN_CHAT_ID) {
      return bot.answerCallbackQuery(q.id, { text: 'Нет доступа', show_alert: true });
    }
    const b = bookings.find((x) => x.id === id);
    if (!b) return bot.answerCallbackQuery(q.id, { text: 'Заявка не найдена' });
    if (b.status !== 'pending') {
      await refreshTelegramMessage(b);
      return bot.answerCallbackQuery(q.id, { text: `Уже обработана: ${STATUS_LABEL[b.status]}` });
    }
    if (action !== 'confirm' && action !== 'reject') return bot.answerCallbackQuery(q.id);

    resolveBooking(b, action === 'confirm' ? 'confirmed' : 'rejected');
    await refreshTelegramMessage(b);
    await bot.answerCallbackQuery(q.id, { text: action === 'confirm' ? 'Запись подтверждена, слот занят' : 'Заявка отклонена, слот освобождён' });
  });

  console.log('[telegram] Бот запущен (polling)');
}

/** Автоматически снимает «зависшие» заявки, чтобы слот не блокировался навсегда. */
function expireStalePending() {
  if (!PENDING_TTL_HOURS) return;
  const limit = Date.now() - PENDING_TTL_HOURS * 3600 * 1000;
  for (const b of bookings) {
    const stale = new Date(b.createdAt).getTime() < limit;
    const past = isSlotInPast(b.date, b.time);
    if (b.status === 'pending' && (stale || past)) {
      resolveBooking(b, 'expired');
      refreshTelegramMessage(b);
    }
  }
}

// ───────────────────────── HTTP ─────────────────────────
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(ROOT, 'public'), { extensions: ['html'], maxAge: '1h' }));

// Простейший rate-limit: не более 5 заявок с одного IP за 10 минут
const hits = new Map();
function rateLimit(req, res, next) {
  const now = Date.now();
  const list = (hits.get(req.ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  if (list.length >= 5) return res.status(429).json({ ok: false, message: 'Слишком много заявок. Попробуйте позже.' });
  list.push(now);
  hits.set(req.ip, list);
  next();
}

app.get('/api/services', (req, res) => {
  res.json(SERVICES.map((s) => ({ ...s, priceText: priceText(s) })));
});

app.get('/api/dates', (req, res) => {
  syncScheduleIfNewDay();
  const dates = Object.keys(schedule).sort().slice(0, DAYS_AHEAD).map((date) => ({ date, free: freeSlots(date).length }));
  res.json({ min: dates[0]?.date, max: dates[dates.length - 1]?.date, dates });
});

app.get('/api/slots', (req, res) => {
  syncScheduleIfNewDay();
  const date = String(req.query.date || '');
  if (!DATE_RE.test(date) || !schedule[date]) {
    return res.status(400).json({ ok: false, message: 'Дата вне доступного расписания' });
  }
  res.json({ ok: true, date, slots: freeSlots(date) });
});

app.post('/api/bookings', rateLimit, async (req, res) => {
  syncScheduleIfNewDay();
  const body = req.body || {};
  if (body.website) return res.status(400).json({ ok: false, message: 'Ошибка отправки' }); // honeypot

  const { errors, data } = validateBooking(body);
  if (Object.keys(errors).length) {
    return res.status(422).json({ ok: false, message: 'Проверьте поля формы', errors });
  }

  const booking = {
    id: crypto.randomUUID(),
    name: data.name,
    age: data.age,
    phone: data.phone,
    contact: data.contact,
    serviceId: data.service.id,
    serviceTitle: data.service.title,
    price: data.service.price,
    priceText: priceText(data.service),
    date: data.date,
    time: data.time,
    comment: data.comment,
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    telegramMessageId: null,
  };

  // Сначала блокируем слот, затем сохраняем заявку (всё синхронно — гонок нет)
  setSlot(booking.date, booking.time, SLOT.PENDING, booking.id);
  bookings.push(booking);
  saveBookings();

  try {
    await notifyMaster(booking);
  } catch (err) {
    console.error('[telegram] Не удалось отправить заявку мастеру:', err.message);
  }

  res.status(201).json({ ok: true, id: booking.id, message: 'Заявка отправлена! Я свяжусь с вами для подтверждения.' });
});

app.use('/api', (req, res) => res.status(404).json({ ok: false, message: 'Not found' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ ok: false, message: 'Внутренняя ошибка сервера' });
});

let lastSyncDay = null;
function syncScheduleIfNewDay() {
  const today = todayISO();
  if (today !== lastSyncDay) {
    syncSchedule();
    lastSyncDay = today;
  }
}

// ───────────────────────── Старт ─────────────────────────
syncScheduleIfNewDay();
if (!fs.existsSync(BOOKINGS_FILE)) saveBookings();
initBot();
expireStalePending();
setInterval(() => { syncScheduleIfNewDay(); expireStalePending(); }, 10 * 60 * 1000).unref();

app.listen(PORT, () => console.log(`Nail Studio запущен: http://localhost:${PORT}`));
