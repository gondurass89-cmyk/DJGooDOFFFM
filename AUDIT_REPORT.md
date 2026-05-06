# DJ GooD OFF FM — Полный Аудит 2026

## 📋 ОБЗОР ПРОЕКТА

**Название:** DJ GooD OFF FM — Telegram Mini App для онлайн-радио  
**Версия:** 1.0.0  
**Дата аудита:** 2026-05-06

### Архитектура

```
┌─────────────────────────────────────────────────────────────────┐
│                    TELEGRAM MINI APP                            │
│  (Next.js 14 + React + HLS.js + Framer Motion)                 │
│  /radio-mini-app → RadioMiniApp.tsx                            │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│ radio-stream  │     │ nowplaying    │     │ listeners     │
│ .workers.dev  │     │ .workers.dev  │     │ .workers.dev  │
│ (MP3 Proxy)   │     │ (D1 Database) │     │ (D1 Database) │
└───────────────┘     └───────────────┘     └───────────────┘
        │                     ▲
        ▼                     │
┌───────────────┐     ┌───────────────┐
│ RadioHeart    │◄────│ RadioBoss     │
│ s0.radioheart │     │ (Metadata)    │
│ :8000/RH84200 │     └───────────────┘
└───────────────┘
        ▲
        │
┌───────────────┐
│ AzuraCast     │
│ stream.volfrings.ru
│ (Liquidsoap)  │
└───────────────┘
```

### Технологии

| Компонент | Технология | Версия |
|-----------|-----------|--------|
| Frontend | Next.js | 14.2.15 |
| UI | React | 18.2.0 |
| Стили | Tailwind CSS | 3.4.0 |
| Анимации | Framer Motion | 11.0.0 |
| Стриминг | HLS.js | 1.6.15 |
| Иконки | Lucide React | 0.400.0 |
| Auth | bcryptjs + jsonwebtoken | - |
| Workers | Cloudflare Workers + D1 | - |

---

## ✅ ЧТО РАБОТАЕТ

### Telegram Mini App
- ✅ Воспроизведение потока (MP3 через HTTPS proxy)
- ✅ Визуализатор (REAL MODE + FALLBACK для iOS)
- ✅ Эквалайзер (BASS/MID/TREBLE) — только не-iOS
- ✅ Громкость с сохранением
- ✅ Listener tracking (heartbeat каждые 30 сек)
- ✅ Получение текущего трека (каждые 5 сек)
- ✅ iOS fallback mode
- ✅ Telegram WebApp API интеграция

### Cloudflare Workers
- ✅ radio-stream — проксирование MP3 через HTTPS
- ✅ nowplaying — хранение/получение названия трека
- ✅ listeners — подсчёт слушателей

### AzuraCast (stream.volfrings.ru)
- ✅ SSL сертификат (Let's Encrypt)
- ✅ Публичный плеер с кастомным CSS/JS
- ✅ Станция: djgoodofffm

---

## ⚠️ ПРОБЛЕМЫ И РИСКИ

### [CRITICAL] Безопасность

| # | Проблема | Риск | Решение |
|---|----------|------|---------|
| C1 | Telegram initData не верифицируется | Подмена данных пользователя | Добавить валидацию через Bot API |
| C2 | Worker endpoints без защиты | DDoS, злоупотребление | Rate limiting, проверка Telegram ID |
| C3 | Нет HTTPS для RadioHeart upstream | MITM при проксировании | Использовать AzuraCast как primary source |

### [HIGH] Стабильность

| # | Проблема | Риск | Решение |
|---|----------|------|---------|
| H1 | Fallback на Icecast не работает | Нет отображения трека при падении Worker | Добавить AzuraCast API как fallback |
| H2 | VM IP меняется при перезапуске | Потеря доступа | ✅ ИСПРАВЛЕНО: статический IP 192.168.0.238 |
| H3 | Нет мониторинга Worker | Падение без уведомления | Добавить алерты в Telegram |

### [MEDIUM] Качество

| # | Проблема | Риск | Решение |
|---|----------|------|---------|
| M1 | Мусор в метаданных треков | Плохой UX | ✅ ЧАСТИЧНО: очистка в JS |
| M2 | Нет обработки обрыва потока | Пользователь не знает о проблеме | Добавить автопереподключение |
| M3 | Публичный плеер AzuraCast: матрица не как в оригинале | Визуальные артефакты | Исправить JS v11 |

### [LOW] Улучшения

| # | Проблема | Решение |
|---|----------|---------|
| L1 | Нет PWA manifest | Добавить manifest.json |
| L2 | Нет оффлайн режима | Service Worker с кешем |
| L3 | Нет сохранения настроек EQ | LocalStorage persist |

---

## 🔍 ДЕТАЛЬНЫЙ АНАЛИЗ

### C1: Telegram initData не верифицируется

**Текущий код (RadioMiniApp.tsx:557-579):**
```typescript
const tg = window.Telegram?.WebApp
if (tg) {
  tg.ready()
  tg.expand()
  const user = tg.initDataUnsafe?.user
  // Данные используются без проверки!
}
```

**Проблема:**
- `initDataUnsafe` — небезопасные данные, могут быть подделаны
- Любой может вызвать API с подставным user.id
- Listener tracking может быть накручен

**Решение:**
1. Получить `initData` (строка, а не объект)
2. Отправить на сервер для верификации
3. Сервер проверяет хеш через Bot Token

### M1: Мусор в метаданных

**Паттерны мусора:**
- `8A - Energy 7 - ` в начале
- `10A - Energy 6` в конце
- `(agrmusic.org)` — URL в скобках
- `[www.livingelectro.com]` — теги

**Текущая очистка:**
- ✅ API route `/api/now-playing` — чистит базово
- ✅ Публичный плеер AzuraCast — чистит в JS
- ❌ Не все паттерны покрываются

**Рекомендация:** Расширить `cleanTrackTitle()` в `/api/now-playing/route.ts`

---

## 📊 АРХИТЕКТУРНЫЕ РЕКОМЕНДАЦИИ

### Приоритет 1: Безопасность (CRITICAL)

```
┌─────────────────────────────────────────────────────────────────┐
│                     TELEGRAM MINI APP                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  /api/auth/telegram (NEW)                        │
│  - Получает initData                                             │
│  - Верифицирует через Telegram Bot API                          │
│  - Выдаёт JWT токен                                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Workers with Auth (UPDATE)                      │
│  - Проверяют JWT токен                                           │
│  - Rate limit per user                                           │
└─────────────────────────────────────────────────────────────────┘
```

### Приоритет 2: Отказоустойчивость (HIGH)

```
Now Playing Sources (priority order):
1. Cloudflare Worker (D1) — PRIMARY
2. AzuraCast Now Playing API — FALLBACK 1
3. Icecast Status — FALLBACK 2
```

### Приоритет 3: UX Улучшения (MEDIUM)

```
1. Автопереподключение при обрыве потока
2. Индикатор качества соединения
3. Сохранение настроек EQ в localStorage
```

---

## 📋 SAFE_IMPROVEMENT_PLAN.md

### SAFE Zone (можно делать сразу)

1. **Расширить очистку метаданных** в `/api/now-playing/route.ts`
2. **Добавить автопереподключение** при обрыве потока
3. **Сохранять настройки EQ** в localStorage
4. **Исправить JS для AzuraCast** публичного плеера

### RISK Zone (требует тестирования)

1. **Верификация Telegram initData** — может сломать существующих пользователей
2. **Переключение на AzuraCast API** — может вернуть проблему с кириллицей

### DANGER Zone (не делать)

1. ~~Переписать Worker на другой сервис~~ — риск даунтайма
2. ~~Изменить формат хранения в D1~~ — потеря данных

---

## 🧪 ЧЕК-ЛИСТ ПЕРЕД ИЗМЕНЕНИЯМИ

### Перед каждым изменением:

- [ ] Что работало раньше?
- [ ] Может ли сломаться?
- [ ] Как проверить?
- [ ] Как откатить?

### Тестирование:

1. Telegram Mini App на Android
2. Telegram Mini App на iOS
3. Публичный плеер AzuraCast
4. Workers respond correctly

---

## 📁 ФАЙЛЫ ПРОЕКТА

```
/home/z/my-project/djgoodoff-fm/
├── src/app/
│   ├── radio-mini-app/
│   │   ├── RadioMiniApp.tsx    ← Основной компонент (1088 строк)
│   │   └── page.tsx            ← Server Component
│   ├── api/
│   │   ├── now-playing/route.ts ← Получение текущего трека
│   │   └── listener/route.ts   ← Listener tracking
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── workers/
│   ├── radio-stream-worker.js  ← MP3 Proxy
│   ├── nowplaying-worker.js    ← Track storage (D1)
│   └── listeners-worker.js     ← Listeners counter (D1)
├── public/logo.png
├── package.json
├── next.config.js
├── tailwind.config.js
└── wrangler.toml              ← Cloudflare Workers config
```

---

## 🔗 ВАЖНЫЕ ССЫЛКИ

| Ресурс | URL |
|--------|-----|
| Telegram Mini App | (через Bot) |
| AzuraCast Public | https://stream.volfrings.ru/public/djgoodofffm |
| Radio Stream Worker | https://radio-stream.gondurass89.workers.dev |
| Now Playing Worker | https://nowplaying.gondurass89.workers.dev |
| Listeners Worker | https://listeners.gondurass89.workers.dev |
| RadioHeart Stream | http://s0.radioheart.ru:8000/RH84200 |

---

## 📝 ИСТОРИЯ ИЗМЕНЕНИЙ

| Дата | Изменение | Статус |
|------|-----------|--------|
| 2026-05-06 | Статический IP VM 192.168.0.238 | ✅ Done |
| 2026-05-06 | CSS для публичного плеера AzuraCast | ✅ Done |
| 2026-05-06 | JS очистка метаданных для AzuraCast | ⚠️ Partial |
| 2026-05-06 | Полный аудит проекта | ✅ Done |

---

**Аудит проведён:** Super Z AI Team  
**Дата:** 2026-05-06
