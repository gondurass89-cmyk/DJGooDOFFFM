# SAFE IMPROVEMENT PLAN — DJ GooD OFF FM

## 🎯 Принципы

1. **Одно изменение = один шаг**
2. **Минимальные изменения**
3. **Всегда есть откат**
4. **Проверка на Android + iOS**

---

## 📅 АУДИТ 2026-05-06 — ВЫПОЛНЕНО

### ✅ ИСПРАВЛЕНО (КРИТИЧЕСКОЕ):

| # | Проблема | Статус | Дата |
|---|----------|--------|------|
| C1 | Volume slider ломает воспроизведение (GainNode в WebAudio) | ✅ FIXED | 2026-05-06 |
| C2 | Bot Token захардкожен в коде (SECURITY) | ✅ FIXED | 2026-05-06 |
| C3 | Нет автопереподключения при обрыве потока | ✅ FIXED | 2026-05-06 |
| C4 | Настройки EQ не сохраняются | ✅ FIXED | 2026-05-06 |
| M1 | Очистка метаданных неполная | ✅ IMPROVED | 2026-05-06 |

---

## ⚠️ ТРЕБУЕТ ВНИМАНИЯ (RISK ZONE)

### ШАГ 1: Настроить Environment Variables

**Риск:** Низкий  
**Что делаем:** Добавить переменные в Vercel/.env.local

```bash
# .env.local
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_ADMIN_CHAT_ID=55068554
```

**Проверка:**
1. Добавить переменные в Vercel Environment Variables
2. Redeploy проект
3. Проверить уведомления в Telegram

---

### ШАГ 2: Верификация Telegram initData

**Риск:** Высокий — может сломать существующих пользователей  
**Что делаем:** Добавить серверную проверку

**Реализация:**
1. Создать `/api/auth/telegram` endpoint
2. Верифицировать initData через hash
3. Выдавать JWT токен
4. Workers проверяют JWT

**Обратная совместимость:**
- Гости (без Telegram) продолжают работать
- Старые пользователи проходят re-auth

**Тестирование:**
1. Telegram на Android
2. Telegram на iOS
3. Браузер без Telegram
4. Поддельные данные

---

### ШАГ 3: AzuraCast API как fallback

**Риск:** Средний — может вернуть проблему с кириллицей  
**Что делаем:** Добавить AzuraCast Now Playing API как fallback

**Порядок:**
1. Worker (D1) — PRIMARY
2. AzuraCast API — FALLBACK 1
3. Icecast Status — FALLBACK 2

**Тестирование:**
1. Остановить Worker
2. Проверить fallback на AzuraCast
3. Проверить кириллицу в названиях

---

### ШАГ 4: Улучшить JS для AzuraCast публичного плеера

**Файл:** `/download/azuracast-cyberpunk-fixed.js`  
**Риск:** Низкий (только публичный плеер, не Mini App)  
**Что делаем:** 
- Добавить больше паттернов очистки
- Улучшить Matrix эффект

**Проверка:**
1. Открыть https://stream.volfrings.ru/public/djgoodofffm
2. Проверить текущий трек
3. Открыть F12 → Console, посмотреть логи

---

## ❌ DANGER ZONE — Не делать

1. **Переписать Workers на другой сервис**
   - Риск: Полный даунтайм
   - Альтернатива: Постепенная миграция

2. **Изменить схему D1 Database**
   - Риск: Потеря данных
   - Альтернатива: Новая таблица + миграция

3. **Изменить URL стрима**
   - Риск: Сломать все установленные Mini Apps
   - Альтернатива: Redirect на новый URL

---

## 📋 Порядок внедрения

| Приоритет | Шаг | Статус |
|-----------|-----|--------|
| 1 | Исправить Volume slider (GainNode) | ✅ Done |
| 2 | Скрыть Bot Token (env vars) | ✅ Done |
| 3 | Добавить автопереподключение | ✅ Done |
| 4 | Сохранять настройки EQ | ✅ Done |
| 5 | Улучшить очистку метаданных | ✅ Done |
| 6 | Настроить env vars в Vercel | Pending |
| 7 | AzuraCast fallback | Pending |
| 8 | Telegram initData верификация | Pending |
| 9 | Улучшить JS AzuraCast | Pending |

---

## 🧪 Чек-лист перед каждым шагом

```
□ Что работало раньше?
□ Что может сломаться?
□ Как проверить?
□ Как откатить?
□ Тест на Android?
□ Тест на iOS?
```

---

## 🔧 ТЕХНИЧЕСКИЕ ДЕТАЛИ ИСПРАВЛЕНИЙ

### Volume Slider Fix (GainNode)

**Проблема:** При использовании WebAudio API (эквалайзер, визуализатор), свойство `audio.volume` не влияет на громкость, потому что аудио проходит через AudioContext.

**Решение:** Добавить GainNode в аудио-цепь:

```typescript
// Цепь: source -> bass -> mid -> treble -> analyser -> gainNode -> destination
const gainNode = ctx.createGain()
gainNode.gain.value = volume / 100
analyser.connect(gainNode)
gainNode.connect(ctx.destination)
```

### Auto-Reconnect

**Триггер:** `MediaError.MEDIA_ERR_NETWORK` при активном воспроизведении

**Логика:**
1. Увеличить счётчик попыток
2. Ждать 3 секунды
3. Сбросить src и перезагрузить
4. Попытаться play()
5. Максимум 3 попытки

### localStorage Persistence

**Ключи:**
- `radio_volume` — громкость (0-100)
- `radio_eq_bass` — bass (-12 до +12)
- `radio_eq_mid` — mid (-12 до +12)
- `radio_eq_treble` — treble (-12 до +12)

---

**Дата создания:** 2026-05-06  
**Последнее обновление:** 2026-05-06  
**Аудит провёл:** Super Z AI Team (Senior+ Expert)
