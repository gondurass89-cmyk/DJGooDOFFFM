# Cloudflare Workers - DJ GooD OFF FM

## Структура

```
workers/
├── radio-stream-worker.js      # HTTPS прокси для MP3 стрима
├── nowplaying-worker.js        # Хранение текущего трека (D1)
├── listeners-worker.js         # Отслеживание слушателей (D1)
├── wrangler.radio-stream.toml  # Конфиг для radio-stream
├── wrangler.nowplaying.toml    # Конфиг для nowplaying
└── wrangler.listeners.toml     # Конфиг для listeners
```

## URLs

| Worker | URL |
|--------|-----|
| radio-stream | https://radio-stream.gondurass89.workers.dev |
| nowplaying | https://nowplaying.gondurass89.workers.dev |
| listeners | https://listeners.gondurass89.workers.dev |

## Деплой через CLI

### 1. Установка wrangler
```bash
npm install -g wrangler
wrangler login
```

### 2. Деплой workers

```bash
# Из корня проекта:

# Radio Stream Worker
wrangler deploy --config workers/wrangler.radio-stream.toml

# Now Playing Worker (требует D1 database)
wrangler deploy --config workers/wrangler.nowplaying.toml

# Listeners Worker (требует D1 database)
wrangler deploy --config workers/wrangler.listeners.toml
```

## D1 Database Setup

### Создание базы данных
```bash
wrangler d1 create nowplaying-db
```

Запишите `database_id` в конфиги `wrangler.nowplaying.toml` и `wrangler.listeners.toml`.

### SQL таблицы

Выполните в D1 Console (Cloudflare Dashboard):

```sql
-- Таблица для текущего трека
CREATE TABLE track (id INTEGER PRIMARY KEY CHECK (id = 1), title TEXT);
INSERT INTO track (id, title) VALUES (1, 'DJ GooD OFF FM - Загрузка...');

-- Таблица для слушателей
CREATE TABLE listeners (
  user_id INTEGER PRIMARY KEY,
  first_name TEXT,
  last_name TEXT,
  username TEXT,
  is_admin INTEGER DEFAULT 0,
  last_heartbeat INTEGER
);
```

## Ручной деплой через Cloudflare Dashboard

1. Откройте https://dash.cloudflare.com → Workers & Pages
2. Создайте новый Worker
3. Скопируйте код из соответствующего `.js` файла
4. Для workers с D1 добавьте binding: `DB` → `nowplaying-db`

## Источник стрима

```
HTTP:  http://178.49.69.37:8000/Radio
HTTPS: https://radio-stream.gondurass89.workers.dev (прокси)
```
