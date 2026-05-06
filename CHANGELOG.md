# Changelog — DJ GooD OFF FM

Все значимые изменения в проекте документируются в этом файле.

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.0.0/).

---

## [1.1.0] - 2026-05-05

### Исправлено

#### [CRITICAL] Парсинг треков с DJ-метаданными
- **Проблема:** AzuraCast возвращает DJ-метаданные (key, energy) в НАЧАЛЕ строки, а не только в конце
- **Пример:**
  - Было: `"9A - Energy 7 - Ondamike - Molly"` показывалось как есть
  - Стало: Корректно парсится как `"Ondamike - Molly"`
- **Причина:** Предыдущий код обрабатывал только метаданные в конце строки
- **Решение:** Полностью переписан парсер в `/api/now-playing/route.ts`:
  - Добавлена функция `stripDjMetadataFromStart()` — удаление метаданных из начала
  - Обновлена функция `stripDjMetadataFromEnd()` — удаление из конца
  - Переписана `parseTrackInfo()` — умный парсинг всех вариантов
  - Добавлена обработка случая, когда поле `artist` содержит ТОЛЬКО метаданные

### Изменено

#### Тесты парсинга
- Добавлены тесты для реальных данных AzuraCast
- Все 4 теста проходят успешно

---

## [1.0.0] - 2026-04-XX

### Добавлено

#### Telegram Mini App
- Плеер онлайн-радио DJ GooD OFF FM
- Интеграция с AzuraCast API
- Telegram MainButton для управления воспроизведением
- Визуализатор звука (real mode + fallback для iOS)
- Эквалайзер (Bass/Mid/Treble)

#### Темы
- 🌙 Dark (тёмная, по умолчанию)
- ☀️ Light (светлая)
- 🎨 Custom (фиолетовая)
- Сохранение выбора в localStorage

#### Обложки
- Fallback цепочка: AzuraCast → Apple Music → Deezer
- HTTP → HTTPS прокси для обложек AzuraCast

#### API Routes
- `/api/now-playing` — информация о текущем треке
- `/api/stream` — прокси аудиопотока
- `/api/cover` — получение обложки
- `/api/cover-proxy` — прокси для HTTP обложек
- `/api/listener` — трекинг слушателей

#### Функции
- Регистрация слушателей
- Поделиться в Telegram
- Открыть в плеере
- Счётчик слушателей

---

## Технические детали

### AzuraCast Data Format
Реальные данные от AzuraCast могут иметь следующие форматы:

**Вариант 1:** artist содержит только метаданные
```json
{
  "text": "4A - Energy 7 - Paperclip, Despersion - Axiom",
  "artist": "4A - Energy 7",
  "title": "Paperclip, Despersion - Axiom"
}
```
Парсинг: artist из title → `"Paperclip, Despersion"`, title → `"Axiom"`

**Вариант 2:** artist содержит метаданные + исполнителя
```json
{
  "text": "9A - Energy 7 - Ondamike - Molly - Molly (Original Mix)",
  "artist": "9A - Energy 7 - Ondamike",
  "title": "Molly (Original Mix)"
}
```
Парсинг: очищаем artist → `"Ondamike"`, title → `"Molly (Original Mix)"`

**Вариант 3:** метаданные в конце
```json
{
  "text": "Terrie Kynd - BHO 7A - Energy 6",
  "artist": "Terrie Kynd",
  "title": "BHO 7A - Energy 6"
}
```
Парсинг: artist → `"Terrie Kynd"`, очищаем title → `"BHO"`

---

*Последнее обновление: 2026-05-05*
