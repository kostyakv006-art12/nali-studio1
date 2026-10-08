/* ==========================================================
   Alina Nails — клиентская логика
   ========================================================== */
(() => {
  'use strict';

  // ───────────── Контент, который легко заменить ─────────────

  /**
   * Видео процесса (реальные бесплатные ролики Pexels, лицензия Pexels License).
   * Ролики проигрываются по очереди и бесконечно по кругу.
   * Чтобы поставить своё длинное видео — оставьте в массиве одну ссылку
   * (например, '/assets/video/process.mp4'), тогда включится нативный loop.
   */
  const VIDEO_SOURCES = [
    'https://videos.pexels.com/video-files/16117302/16117302-hd_1280_720_30fps.mp4', // Max Costa — Nail beauty care manicure
    'https://videos.pexels.com/video-files/7754857/7754857-hd_1280_720_30fps.mp4',   // RDNE Stock project — A manicurist applying nail polish
    'https://videos.pexels.com/video-files/4783394/4783394-hd_1280_720_30fps.mp4',   // Artem Podrez — Close-up of person getting her nails done
  ];

  const px = (id, w) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${w}`;
  const us = (id, w) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`;

  /** Портфолио: thumb — превью в сетке, full — для лайтбокса. Замените на свои фото. */
  const GALLERY = [
    { thumb: px(15491629, 700), full: px(15491629, 1600), alt: 'Красный миндаль на длинных ногтях' },
    { thumb: us('1604902396830-aca29e19b067', 700), full: us('1604902396830-aca29e19b067', 1600), alt: 'Нюдовый маникюр' },
    { thumb: us('1607779097040-26e80aa78e66', 700), full: us('1607779097040-26e80aa78e66', 1600), alt: 'Лавандовый и белый с блёстками' },
    { thumb: us('1604654894610-df63bc536371', 700), full: us('1604654894610-df63bc536371', 1600), alt: 'Тёмный дизайн с акцентами' },
    { thumb: us('1610992015732-2449b76344bc', 700), full: us('1610992015732-2449b76344bc', 1600), alt: 'Натуральный розовый маникюр' },
    { thumb: us('1519014816548-bf5fe059798b', 700), full: us('1519014816548-bf5fe059798b', 1600), alt: 'Розовый дизайн с надписью' },
    { thumb: px(4677845, 700), full: px(4677845, 1600), alt: 'Покрытие тёмным лаком' },
    { thumb: us('1522337660859-02fbefca4702', 700), full: us('1522337660859-02fbefca4702', 1600), alt: 'Розовый маникюр на коротких ногтях' },
  ];

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ───────────── Шапка и меню ─────────────
  const header = $('#header');
  const burger = $('#burger');
  const nav = $('#nav');
  const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 20);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const setMenu = (open) => {
    burger.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('is-open', open);
    header.classList.toggle('menu-open', open);
    document.body.style.overflow = open ? 'hidden' : '';
  };
  burger.addEventListener('click', () => setMenu(burger.getAttribute('aria-expanded') !== 'true'));
  $$('a', nav).forEach((a) => a.addEventListener('click', () => setMenu(false)));
  $('#year').textContent = new Date().getFullYear();

  // ───────────── Появление секций при скролле ─────────────
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

  function observeReveal(elements) {
    // Лёгкая «лесенка» для соседних элементов
    elements.forEach((el) => {
      const siblings = [...el.parentElement.children].filter((c) => c.classList.contains('reveal'));
      el.style.setProperty('--delay', `${Math.min(siblings.indexOf(el), 6) * 0.08}s`);
      revealObserver.observe(el);
    });
  }
  observeReveal($$('.reveal'));

  // ───────────── Кастомный курсор-ноготь ─────────────
  const cursor = $('.cursor');
  const INTERACTIVE = 'a, button, input, select, textarea, label, .service, .gallery__item, .slot, [role="button"]';
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  let touchTimer;

  const moveCursor = (x, y) => {
    cursor.style.setProperty('--x', `${x}px`);
    cursor.style.setProperty('--y', `${y}px`);
  };

  if (finePointer) {
    document.documentElement.classList.add('has-cursor');
    let raf = null;
    let pos = { x: -100, y: -100 };
    document.addEventListener('mousemove', (e) => {
      pos = { x: e.clientX, y: e.clientY };
      cursor.classList.add('is-visible');
      if (!raf) raf = requestAnimationFrame(() => { moveCursor(pos.x, pos.y); raf = null; });
    }, { passive: true });
    document.addEventListener('mouseover', (e) => cursor.classList.toggle('is-hover', !!e.target.closest(INTERACTIVE)));
    document.addEventListener('mousedown', () => cursor.classList.add('is-pressed'));
    document.addEventListener('mouseup', () => cursor.classList.remove('is-pressed'));
    document.documentElement.addEventListener('mouseleave', () => cursor.classList.remove('is-visible'));
    document.documentElement.addEventListener('mouseenter', () => cursor.classList.add('is-visible'));
  }

  // Тач-устройства: ноготь «отпечатывается» в точке касания и плавно исчезает
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    clearTimeout(touchTimer);
    cursor.classList.add('is-touch', 'is-visible');
    cursor.classList.toggle('is-hover', !!e.target.closest(INTERACTIVE));
    moveCursor(e.clientX, e.clientY);
    touchTimer = setTimeout(() => cursor.classList.remove('is-visible', 'is-hover'), 450);
  }, { passive: true });
  document.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' && cursor.classList.contains('is-touch')) moveCursor(e.clientX, e.clientY);
  }, { passive: true });

  // ───────────── Видео: автоплей, цикл, без взаимодействия ─────────────
  const video = $('#processVideo');
  const frame = video.closest('.video-frame');
  let videoIndex = 0;

  function loadClip(i) {
    videoIndex = (i + VIDEO_SOURCES.length) % VIDEO_SOURCES.length;
    video.src = VIDEO_SOURCES[videoIndex];
    video.load();
    playVideo();
  }
  function playVideo() {
    video.muted = true;
    const p = video.play();
    if (p && p.catch) p.catch(() => {}); // автоплей может быть отложен браузером — повторим при скролле/касании
  }

  video.muted = true;
  video.defaultMuted = true;
  video.controls = false;
  video.loop = VIDEO_SOURCES.length === 1;
  video.disablePictureInPicture = true;

  if (VIDEO_SOURCES.length > 1) {
    video.addEventListener('ended', () => loadClip(videoIndex + 1));
    // Если ролик недоступен — переходим к следующему, чтобы блок не был пустым
    video.addEventListener('error', () => setTimeout(() => loadClip(videoIndex + 1), 800));
  }
  // Пауза невозможна: любое событие паузы сразу возобновляет воспроизведение
  video.addEventListener('pause', () => { if (!video.ended && document.visibilityState === 'visible') playVideo(); });
  video.addEventListener('volumechange', () => { if (!video.muted) video.muted = true; });
  video.addEventListener('ratechange', () => { if (video.playbackRate !== 1) video.playbackRate = 1; });
  // Перемотка заблокирована: возвращаем позицию, если её изменили не мы
  let lastTime = 0;
  video.addEventListener('timeupdate', () => { lastTime = video.currentTime; });
  video.addEventListener('seeking', () => {
    if (Math.abs(video.currentTime - lastTime) > 1 && video.currentTime > 0.5) video.currentTime = lastTime;
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') playVideo(); });

  // Блокируем мышь, тач, контекстное меню, drag и двойной клик по видео
  ['contextmenu', 'click', 'dblclick', 'mousedown', 'dragstart', 'selectstart', 'touchstart', 'touchend', 'pointerdown']
    .forEach((evt) => frame.addEventListener(evt, (e) => {
      if (e.cancelable && evt !== 'touchstart') e.preventDefault();
      e.stopPropagation();
      playVideo();
    }, { passive: evt === 'touchstart' }));
  frame.addEventListener('keydown', (e) => e.preventDefault());

  // Грузим видео, когда секция приближается к экрану — так быстрее первая отрисовка
  new IntersectionObserver((entries, obs) => {
    if (entries[0].isIntersecting) { loadClip(0); obs.disconnect(); }
  }, { rootMargin: '400px' }).observe(frame);
  // Некоторые мобильные браузеры разрешают автоплей только после первого жеста
  ['touchstart', 'scroll'].forEach((evt) => window.addEventListener(evt, () => video.paused && video.src && playVideo(), { passive: true, once: true }));

  // ───────────── Уведомления ─────────────
  const toasts = $('#toasts');
  function toast(title, text, type = 'success', ms = 5000) {
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.innerHTML = `<span class="toast__icon">${type === 'error' ? '⚠️' : '💅'}</span><div><span class="toast__title"></span><span class="toast__text"></span></div>`;
    $('.toast__title', el).textContent = title;
    $('.toast__text', el).textContent = text;
    toasts.appendChild(el);
    setTimeout(() => {
      el.classList.add('is-leaving');
      el.addEventListener('animationend', () => el.remove(), { once: true });
    }, ms);
  }

  // ───────────── API ─────────────
  async function api(url, options) {
    const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.message || 'Ошибка сервера');
      err.status = res.status;
      err.errors = data.errors;
      throw err;
    }
    return data;
  }

  // ───────────── Услуги ─────────────
  const form = $('#bookingForm');
  const serviceSelect = form.elements.service;
  const priceField = $('#priceField');
  let services = [];

  function updatePrice() {
    const s = services.find((x) => x.id === serviceSelect.value);
    priceField.value = s ? s.priceText : '';
  }

  function renderServices() {
    const list = $('#servicesList');
    list.innerHTML = '';
    services.forEach((s, i) => {
      const row = document.createElement('div');
      row.className = 'service reveal';
      row.setAttribute('role', 'listitem');
      row.tabIndex = 0;
      row.dataset.id = s.id;
      row.innerHTML = `
        <span class="service__num">${String(i + 1).padStart(2, '0')}</span>
        <h3 class="service__title"></h3>
        <p class="service__desc"></p>
        <span class="service__time"></span>
        <span class="service__price"></span>`;
      $('.service__title', row).textContent = s.title;
      $('.service__desc', row).textContent = s.desc;
      $('.service__time', row).textContent = s.duration;
      $('.service__price', row).textContent = s.priceText;
      list.appendChild(row);

      const opt = new Option(`${s.title} — ${s.priceText}`, s.id);
      serviceSelect.add(opt);
    });
    observeReveal($$('.service', list));
  }

  // Клик по карточке услуги — выбираем её в форме и прокручиваем к записи
  $('#servicesList').addEventListener('click', (e) => chooseService(e.target.closest('.service')));
  $('#servicesList').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); chooseService(e.target.closest('.service')); }
  });
  function chooseService(row) {
    if (!row) return;
    serviceSelect.value = row.dataset.id;
    updatePrice();
    clearError('service');
    $('#booking').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
  }
  serviceSelect.addEventListener('change', updatePrice);

  api('/api/services')
    .then((data) => { services = data; renderServices(); })
    .catch(() => toast('Не удалось загрузить услуги', 'Обновите страницу или попробуйте позже.', 'error'));

  // ───────────── Портфолио и лайтбокс ─────────────
  const gallery = $('#gallery');
  GALLERY.forEach((p, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gallery__item reveal';
    btn.dataset.index = i;
    btn.setAttribute('aria-label', `Открыть фото: ${p.alt}`);
    const img = document.createElement('img');
    img.src = p.thumb;
    img.alt = p.alt;
    img.loading = 'lazy';
    img.decoding = 'async';
    btn.appendChild(img);
    gallery.appendChild(btn);
  });
  observeReveal($$('.gallery__item', gallery));

  const lb = $('#lightbox');
  const lbImg = $('.lightbox__img', lb);
  const lbCounter = $('.lightbox__counter', lb);
  let lbIndex = 0;
  let lastFocus = null;

  function showPhoto(i) {
    lbIndex = (i + GALLERY.length) % GALLERY.length;
    lbImg.classList.add('is-switching');
    const next = new Image();
    next.onload = next.onerror = () => {
      lbImg.src = GALLERY[lbIndex].full;
      lbImg.alt = GALLERY[lbIndex].alt;
      lbImg.classList.remove('is-switching');
    };
    next.src = GALLERY[lbIndex].full;
    lbCounter.textContent = `${lbIndex + 1} / ${GALLERY.length}`;
  }
  function openLightbox(i) {
    lastFocus = document.activeElement;
    lb.hidden = false;
    document.body.style.overflow = 'hidden';
    showPhoto(i);
    requestAnimationFrame(() => lb.classList.add('is-open'));
    $('.lightbox__close', lb).focus();
  }
  function closeLightbox() {
    lb.classList.remove('is-open');
    document.body.style.overflow = '';
    setTimeout(() => { lb.hidden = true; }, 350);
    if (lastFocus) lastFocus.focus();
  }
  gallery.addEventListener('click', (e) => {
    const item = e.target.closest('.gallery__item');
    if (item) openLightbox(Number(item.dataset.index));
  });
  lb.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'close' || e.target === lb) closeLightbox();
    if (action === 'prev') showPhoto(lbIndex - 1);
    if (action === 'next') showPhoto(lbIndex + 1);
  });
  document.addEventListener('keydown', (e) => {
    if (lb.hidden) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') showPhoto(lbIndex - 1);
    if (e.key === 'ArrowRight') showPhoto(lbIndex + 1);
  });
  // Свайп в лайтбоксе
  let touchX = null;
  lb.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 50) showPhoto(lbIndex + (dx < 0 ? 1 : -1));
    touchX = null;
  });

  // ───────────── Дата и свободные слоты ─────────────
  const dateInput = form.elements.date;
  const slotsBox = $('#slots');
  let datesInfo = {};
  let slotsRequest = 0;

  api('/api/dates').then((data) => {
    if (data.min) dateInput.min = data.min;
    if (data.max) dateInput.max = data.max;
    datesInfo = Object.fromEntries(data.dates.map((d) => [d.date, d.free]));
  }).catch(() => {});

  function slotsHint(text) {
    slotsBox.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'slots__hint';
    p.textContent = text;
    slotsBox.appendChild(p);
  }

  async function loadSlots(keepSelected) {
    const date = dateInput.value;
    clearError('time');
    if (!date) return slotsHint('Сначала выберите дату');
    if ((dateInput.min && date < dateInput.min) || (dateInput.max && date > dateInput.max)) {
      return slotsHint('Запись открыта только на ближайшие 30 дней');
    }
    const reqId = ++slotsRequest;
    slotsBox.innerHTML = '<span class="skeleton"></span>'.repeat(4);
    try {
      const { slots } = await api(`/api/slots?date=${encodeURIComponent(date)}`);
      if (reqId !== slotsRequest) return; // пришёл ответ на устаревший запрос
      datesInfo[date] = slots.length;
      if (!slots.length) return slotsHint('На этот день свободных окон нет — выберите другую дату');
      slotsBox.innerHTML = '';
      slots.forEach((t) => {
        const label = document.createElement('label');
        label.className = 'slot';
        label.innerHTML = `<input type="radio" name="time" value="${t}" /><span>${t}</span>`;
        if (keepSelected === t) $('input', label).checked = true;
        slotsBox.appendChild(label);
      });
    } catch (err) {
      if (reqId === slotsRequest) slotsHint(err.message || 'Не удалось загрузить время');
    }
  }
  dateInput.addEventListener('change', () => { clearError('date'); loadSlots(); });
  slotsBox.addEventListener('change', () => clearError('time'));

  // ───────────── Маска телефона ─────────────
  const phoneInput = form.elements.phone;
  phoneInput.addEventListener('input', () => {
    let d = phoneInput.value.replace(/\D/g, '');
    if (!d) { phoneInput.value = ''; return; }
    if (d[0] === '8') d = '7' + d.slice(1);
    if (d[0] === '9') d = '7' + d;
    if (d[0] !== '7') { phoneInput.value = '+' + d.slice(0, 15); return; }
    d = d.slice(0, 11);
    const p = [d.slice(1, 4), d.slice(4, 7), d.slice(7, 9), d.slice(9, 11)];
    phoneInput.value = '+7' + (p[0] ? ` (${p[0]}` : '') + (p[0].length === 3 ? ')' : '') + (p[1] ? ` ${p[1]}` : '') + (p[2] ? `-${p[2]}` : '') + (p[3] ? `-${p[3]}` : '');
  });

  // ───────────── Валидация ─────────────
  const RULES = {
    name: (v) => /^[A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё\s'-]{1,49}$/.test(v.trim()) || 'Укажите имя (2–50 букв)',
    age: (v) => (/^\d{1,2}$/.test(v) && +v >= 14 && +v <= 99) || 'Возраст — число от 14 до 99',
    phone: (v) => { const n = v.replace(/\D/g, '').length; return (n >= 10 && n <= 15) || 'Укажите корректный номер телефона'; },
    contact: (v) => {
      const s = v.trim();
      return /^@?[A-Za-z][A-Za-z0-9_]{4,31}$/.test(s)
        || /^(https?:\/\/)?(t\.me|telegram\.me)\/[A-Za-z][A-Za-z0-9_]{4,31}\/?$/i.test(s)
        || /^(https?:\/\/)?(m\.)?(vk\.com|vk\.ru)\/[A-Za-z0-9_.]{2,50}\/?$/i.test(s)
        || 'Укажите @username в Telegram или ссылку на ВК';
    },
    service: (v) => !!v || 'Выберите услугу',
    date: (v) => !!v || 'Выберите дату',
    time: (v) => !!v || 'Выберите свободное время',
  };

  const fieldBox = (name) => (name === 'time' ? $('.slots-field', form) : form.elements[name]?.closest('.field'));
  function setError(name, msg) {
    const box = fieldBox(name);
    if (!box) return;
    box.classList.add('has-error');
    $('.field__error', box).textContent = msg;
  }
  function clearError(name) {
    const box = fieldBox(name);
    if (box) box.classList.remove('has-error');
  }
  ['name', 'age', 'phone', 'contact', 'service'].forEach((n) => {
    form.elements[n].addEventListener('input', () => clearError(n));
    form.elements[n].addEventListener('blur', () => {
      const v = form.elements[n].value;
      if (!v) return;
      const r = RULES[n](v);
      if (r !== true) setError(n, r);
    });
  });

  function collect() {
    const fd = new FormData(form);
    return {
      name: (fd.get('name') || '').trim(),
      age: (fd.get('age') || '').trim(),
      phone: (fd.get('phone') || '').trim(),
      contact: (fd.get('contact') || '').trim(),
      service: fd.get('service') || '',
      date: fd.get('date') || '',
      time: fd.get('time') || '',
      comment: (fd.get('comment') || '').trim(),
      website: fd.get('website') || '',
    };
  }

  // ───────────── Отправка ─────────────
  const submitBtn = $('#submitBtn');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = collect();
    let firstInvalid = null;
    Object.entries(RULES).forEach(([name, rule]) => {
      const r = rule(data[name]);
      if (r === true) clearError(name);
      else { setError(name, r); firstInvalid = firstInvalid || name; }
    });
    if (firstInvalid) {
      const box = fieldBox(firstInvalid);
      box.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
      (form.elements[firstInvalid]?.focus ? form.elements[firstInvalid] : null)?.focus?.({ preventScroll: true });
      toast('Проверьте форму', 'Заполните обязательные поля, отмеченные звёздочкой.', 'error');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.classList.add('is-loading');
    try {
      const res = await api('/api/bookings', { method: 'POST', body: JSON.stringify({ ...data, age: Number(data.age) }) });
      toast('Заявка отправлена!', res.message || 'Я свяжусь с вами для подтверждения.');
      form.reset();
      priceField.value = '';
      slotsHint('Сначала выберите дату');
    } catch (err) {
      if (err.errors) Object.entries(err.errors).forEach(([n, m]) => setError(n, m));
      toast('Не получилось отправить', err.message || 'Попробуйте ещё раз чуть позже.', 'error');
      // Слот могли занять, пока заполнялась форма — обновляем список
      if (err.errors?.time) loadSlots();
    } finally {
      submitBtn.disabled = false;
      submitBtn.classList.remove('is-loading');
    }
  });
})();
