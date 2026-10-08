# Alina Nails — сайт частного мастера с онлайн-записью

Одностраничный сайт (Hero → О мастере → Видео → Услуги → Портфолио → Запись → Подвал) с расписанием свободных окон и Telegram-ботом, через который мастер подтверждает или отклоняет заявки.

## Стек и структура

```
nail-studio/
├── package.json        зависимости и скрипты
├── .env.example        шаблон настроек (скопируйте в .env)
├── .gitignore
├── server.js           готовый сервер в одном файле (Express + бот уже внутри)
├── services.json       услуги и цены
├── src/
│   └── server.js       исходный код сервера (для правок)
├── data/
│   ├── bookings.json   заявки (создаётся автоматически)
│   └── schedule.json   расписание на 30 дней (создаётся/обновляется автоматически)
└── public/
    ├── index.html
    ├── styles.css
    ├── script.js
    └── assets/
        ├── nail.svg        курсор
        └── nail-pink.svg   курсор при наведении
```

**Как работает запись**

1. Клиент выбирает дату → `GET /api/slots?date=YYYY-MM-DD` возвращает только свободные слоты (10:00, 11:30, 13:00, 14:30, 16:00, 17:30, 19:00).
2. Отправка формы → `POST /api/bookings`. Сервер проверяет данные, переводит слот в статус `pending` («на рассмотрении») и отправляет заявку мастеру в Telegram с кнопками «✅ Подтвердить» / «❌ Отклонить».
3. Подтвердить → слот `booked` (занят). Отклонить → слот снова `free`. Сообщение в Telegram обновляется, кнопки исчезают.
4. Если мастер не ответил за `PENDING_TTL_HOURS` часов (или время уже прошло), заявка отклоняется автоматически и слот освобождается.

Другие эндпоинты: `GET /api/services` (услуги и цены — в `services.json`), `GET /api/dates` (диапазон дат и число свободных окон).

## 1. Установка

Нужен Node.js 18 или новее. **`npm install` не нужен**: все зависимости (express, node-telegram-bot-api, dotenv) уже собраны в один файл `server.js`, поэтому в проекте меньше 30 файлов и нет папки `node_modules`.

```bash
cd nail-studio
cp .env.example .env        # Windows PowerShell: copy .env.example .env
```

### Если меняете код сервера

Правьте `src/server.js`, затем пересоберите `server.js`:

```bash
npm install      # один раз, только для сборки (появится node_modules — её не загружайте на хостинг/GitHub)
npm run build
```

`npm run dev` запускает исходник `src/server.js` напрямую (тоже требует `npm install`).

## 2. Токен бота (@BotFather)

1. Откройте в Telegram [@BotFather](https://t.me/BotFather) и отправьте `/newbot`.
2. Придумайте имя и username бота (должен заканчиваться на `bot`).
3. BotFather пришлёт токен вида `1234567890:AAH...` — вставьте его в `.env` в `TELEGRAM_BOT_TOKEN`.
4. Обязательно откройте своего бота и нажмите **Start**, иначе бот не сможет вам писать.

## 3. chat_id (@userinfobot)

1. Откройте [@userinfobot](https://t.me/userinfobot) и нажмите **Start**.
2. Он пришлёт ваш `Id` — это число вставьте в `.env` в `TELEGRAM_CHAT_ID`.

Запасной способ: запустите сервер и отправьте своему боту `/start` — он ответит вашим chat_id.

Пример `.env`:

```
PORT=3000
TELEGRAM_BOT_TOKEN=1234567890:AAH_your_token
TELEGRAM_CHAT_ID=123456789
TZ=Europe/Moscow
PENDING_TTL_HOURS=24
```

## 4. Запуск

```bash
npm start        # или: node server.js
```

Откройте http://localhost:3000. Папка `data/` и JSON-файлы создаются автоматически при первом запуске.

## 5. Замена видео

Ссылки находятся в начале `public/script.js`, массив `VIDEO_SOURCES`. Сейчас там три реальных ролика Pexels, они проигрываются по очереди по кругу.

- **Своё видео:** положите файл в `public/assets/video/process.mp4` и оставьте в массиве одну строку `'/assets/video/process.mp4'` — включится обычный бесконечный цикл.
- **С Pexels:** откройте ролик → Free download → правой кнопкой по выбранному качеству → «Копировать адрес ссылки» (вида `https://videos.pexels.com/video-files/<id>/<id>-hd_1280_720_30fps.mp4`).
- Рекомендуемый формат: MP4 (H.264), 720p или 1080p, до 20–30 МБ. Видео без звука — так браузеры разрешают автозапуск.

Видео идёт без звука и в цикле, у него нет элементов управления. Клики, тапы, контекстное меню, перетаскивание, пауза, перемотка и картинка-в-картинке заблокированы. Полностью защитить файл от скачивания в браузере нельзя: его адрес видно в инструментах разработчика.

## 6. Замена фотографий

- **Портфолио:** массив `GALLERY` в `public/script.js` (`thumb` — превью около 700 px, `full` — для лайтбокса около 1600 px). Свои фото удобно класть в `public/assets/photos/` и указывать путь вида `/assets/photos/work-1.jpg`.
- **Hero и «О мастере»:** теги `<img>` в `public/index.html` (секции `#hero` и `#about`).
- Имя мастера, адрес, телефон и ссылки на соцсети — в `public/index.html` (шапка, «О мастере», «Запись», подвал).
- Услуги и цены — файл `services.json` (пересборка не нужна, только перезапуск). Цены на сайте и в форме подтягиваются оттуда автоматически.

## 7. Деплой

Бот работает в режиме polling, поэтому нужен постоянно запущенный процесс Node.js с записью на диск (JSON-файлы). Подойдут VPS, Railway, Render (с persistent disk), Timeweb Cloud и т. п. Бесплатные serverless-платформы (Vercel, Netlify Functions) **не подходят**.

**VPS (Ubuntu) + PM2 + Nginx**

```bash
# на сервере
sudo apt update && sudo apt install -y nodejs npm nginx
sudo npm i -g pm2
git clone <ваш-репозиторий> nail-studio && cd nail-studio   # или загрузите архив
cp .env.example .env && nano .env
pm2 start server.js --name nail-studio
pm2 save && pm2 startup
```

Nginx (`/etc/nginx/sites-available/nail-studio`):

```nginx
server {
  server_name example.ru www.example.ru;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/nail-studio /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo apt install -y certbot python3-certbot-nginx && sudo certbot --nginx -d example.ru
```

**Railway / Render:** создайте сервис из репозитория, команда запуска `npm start`, добавьте переменные из `.env` в настройки, подключите постоянный диск (volume) к папке `/data` проекта, чтобы заявки не терялись при перезапуске.

> Запускайте **только один** экземпляр сервера: два процесса с одним токеном в режиме polling конфликтуют (ошибка 409 в логах).

## Резервные копии

Все данные лежат в `data/bookings.json` и `data/schedule.json`. Достаточно периодически копировать эту папку.
