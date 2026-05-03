# DJ GooD OFF FM - Telegram Mini App

Онлайн радио-плеер в виде Telegram Mini App с визуализатором, эквалайзером и отслеживанием слушателей.

![DJ GooD OFF FM](public/logo.png)

## 🎵 Возможности

- **Стриминг радио** — воспроизведение онлайн-потока через Icecast
- **Визуализатор частот** — 24-полосный визуализатор с разделением на BASS/MID/TREBLE
- **3-полосный эквалайзер** — регулировка басов, средних и высоких частот
- **Обложки альбомов** — автоматическая загрузка из Last.fm / iTunes
- **Название трека** — текущий трек с очисткой технической информации
- **Счётчик слушателей** — отображение количества активных слушателей
- **Авто-переподключение** — восстановление соединения при обрыве
- **iOS поддержка** — fallback режим для устройств Apple

## 🏗️ Архитектура

```
src/
├── app/
│   ├── api/
│   │   ├── stream/route.ts      # Proxy для аудио-потока
│   │   ├── now-playing/route.ts # Текущий трек
│   │   ├── album-art/route.ts   # Обложки альбомов
│   │   └── listener/route.ts    # Учёт слушателей
│   └── radio-mini-app/
│       ├── components/          # UI компоненты
│       ├── hooks/               # React хуки
│       ├── types/               # TypeScript типы
│       └── RadioMiniApp.tsx     # Главный компонент
├── lib/
│   ├── lastfm.ts                # Last.fm / iTunes API
│   └── logger.ts                # Условное логирование
└── workers/                     # Cloudflare Workers
```

## 🛠️ Технологии

- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS
- **Animation**: Framer Motion
- **Audio**: Web Audio API (AnalyserNode, BiquadFilter)
- **Backend**: Vercel Edge Functions
- **Storage**: Cloudflare D1 (SQLite)
- **APIs**: Last.fm, iTunes Search, Telegram Bot API

## 📦 Установка

```bash
# Клонирование
git clone https://github.com/gondurass89-cmyk/DJGooDOFFFM.git
cd DJGooDOFFFM

# Установка зависимостей
npm install

# Запуск в development
npm run dev
```

## ⚙️ Переменные окружения

Создайте `.env.local` на основе `.env.example`:

```env
# Telegram Bot (для уведомлений)
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_ADMIN_CHAT_ID=your_chat_id

# Last.fm (для обложек)
LASTFM_API_KEY=your_api_key
```

## 🚀 Деплой

### Vercel (рекомендуется)

1. Подключите репозиторий к Vercel
2. Добавьте переменные окружения в Settings → Environment Variables
3. Деплой происходит автоматически при push в main

### Cloudflare Workers

Для работы счётчика слушателей нужен Cloudflare Worker с D1:

```bash
# Деплой workers
wrangler deploy workers/listeners-worker.js
wrangler deploy workers/nowplaying-worker.js
```

## 📱 Telegram Mini App

### Создание Mini App

1. Создайте бота через [@BotFather](https://t.me/BotFather)
2. Включите Mini App: `/newapp`
3. Укажите URL вашего Vercel деплоя

### Интеграция

Mini App автоматически:
- Получает данные пользователя через Telegram WebApp API
- Определяет платформу (iOS/Android/Desktop)
- Расширяется на весь экран

## 🎨 Настройка

### Цветовая схема

Измените в `src/app/radio-mini-app/types/index.ts`:

```typescript
export const COLORS = {
  primary: '#2e0071',   // Фон
  secondary: '#00c730', // Акцент
  accent: '#00ff40',    // Текст
  text: '#c4c4c4',      // Обычный текст
  dark: '#0d0026',      // Тёмный фон
  bass: '#ff0066',      // BASS частоты
  mid: '#00c730',       // MID частоты
  high: '#00ffcc',      // TREBLE частоты
}
```

### URL радио-потока

Измените в `src/app/api/stream/route.ts`:

```typescript
const STREAM_URL = 'http://your-server:8000/mount'
```

## 🔧 API Endpoints

| Endpoint | Method | Описание |
|----------|--------|----------|
| `/api/stream` | GET | Аудио-поток (proxy) |
| `/api/now-playing` | GET | Текущий трек |
| `/api/album-art?title=...` | GET | Обложка альбома |
| `/api/listener` | GET | Количество слушателей |
| `/api/listener` | POST | Регистрация слушателя |

## 🧪 Разработка

```bash
# Development сервер
npm run dev

# Сборка
npm run build

# Lint
npm run lint

# Тесты (Vitest)
npm run test           # Watch mode
npm run test:run       # Single run
npm run test:coverage  # С покрытием кода
```

### Структура тестов

```
src/tests/
├── setup.ts           # Моки для Telegram, AudioContext, etc.
├── lastfm.test.ts     # Тесты парсинга названий треков
├── utils.test.ts      # Тесты detectIOS, getAudioErrorMessage
└── listeners.test.ts  # Тесты склонения слова "слушатель*"
```

## 📊 Cloudflare Workers

### listeners-worker

Учёт активных слушателей с D1 базой данных.

Endpoints:
- `POST` — регистрация (open/close/heartbeat)
- `GET` — получение количества слушателей

### nowplaying-worker

Получение текущего трека из RadioBoss.

## 🧩 Компоненты

### UI Компоненты
- **AudioVisualizer** — 24-полосный визуализатор с градиентами BASS/MID/TREBLE
- **EqualizerPanel** — 3-полосный эквалайзер с регуляторами
- **PlayerControls** — кнопки Play/Pause, громкость, mute
- **TrackInfo** — обложка альбома, название трека, счётчик слушателей
- **ErrorBoundary** — обработка React ошибок с UI для повтора
- **Skeleton** — скелетоны загрузки (AlbumArtSkeleton, TrackTitleSkeleton)

### Hooks
- **useAudioPlayer** — управление аудио потоком, реконнект, Web Audio API
- **useVisualizer** — визуализация частот через AnalyserNode
- **useTrackInfo** — получение текущего трека и обложки
- **useListeners** — регистрация слушателей через Cloudflare Worker
- **useTelegram** — интеграция с Telegram WebApp API

## 🔒 Безопасность

- ✅ Rate limiting (30 запросов/минута)
- ✅ Секреты через env переменные
- ✅ LRU кэш с TTL (защита от memory leak)
- ✅ CORS headers для API
- ✅ Error Boundary для обработки React ошибок
- ✅ Logger с условным выводом (только в development)

## 📱 PWA (Progressive Web App)

Приложение поддерживает установку как PWA:

- **manifest.json** — описание приложения
- **Иконки** — 8 размеров (72x72 до 512x512)
- **Theme color** — #2e0071 (фиолетовый)
- **Display** — standalone (без адресной строки)

Иконки генерируются из `public/logo.png`:
```bash
# Если нужно перегенерировать иконки
python3 -c "
from PIL import Image
import os
sizes = [72, 96, 128, 144, 152, 192, 384, 512]
logo = Image.open('public/logo.png')
os.makedirs('public/icons', exist_ok=True)
for size in sizes:
    logo.resize((size, size), Image.LANCZOS).save(f'public/icons/icon-{size}x{size}.png')
"
```

## 🔄 Схема работы

```
┌─────────────────────────────────────────────────────────────┐
│                    Telegram Mini App                         │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  RadioMiniApp.tsx                                       ││
│  │  ├── useTelegram() → пользователь, платформа            ││
│  │  ├── useAudioPlayer() → воспроизведение, Web Audio      ││
│  │  ├── useVisualizer() → визуализация частот             ││
│  │  ├── useTrackInfo() → трек + обложка                   ││
│  │  └── useListeners() → счётчик слушателей               ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Vercel Edge Functions                     │
│  /api/stream     → Proxy к Icecast (IPv4 force)             │
│  /api/now-playing → Текущий трек (Worker → Icecast fallback)│
│  /api/album-art  → Last.fm → iTunes fallback                │
│  /api/listener   → Cloudflare D1 Worker                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Внешние сервисы                           │
│  • Icecast (s0.radioheart.ru:8000) — аудио поток            │
│  • Cloudflare D1 — хранение слушателей                      │
│  • Last.fm API — обложки альбомов                           │
│  • iTunes Search API — fallback обложки                     │
└─────────────────────────────────────────────────────────────┘
```

## 📄 Лицензия

MIT

## 👤 Автор

DJ GooD OFF FM Team

---

**Powered by DJ GooD OFF** 🎧
