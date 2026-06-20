# Sima Atlas — launch kit

Шесть копи-пастных артефактов + чеклист на день запуска. Все цифры и пути в
этих материалах **проверяемы** — каждое утверждение можно сверить с файлом в
репо. Если убираешь конкретику ради лёгкости — теряешь главное.

## Что лежит здесь

| Файл | Где использовать | Когда |
|---|---|---|
| [`twitter-launch-thread.md`](twitter-launch-thread.md) | 9-tweet thread в X | День 1 после релиза |
| [`hn-show-submission.md`](hn-show-submission.md) | `Show HN:` на news.ycombinator.com | День 2 (Tue/Wed утром PT — лучшая видимость) |
| [`reddit-r-programming.md`](reddit-r-programming.md) | r/programming + r/LocalLLaMA + r/Anthropic | День 3+ |
| [`devto-long-form.md`](devto-long-form.md) | dev.to / hashnode / собственный блог | День 4 — через 2 дня после Twitter'а |
| [`landing-page-copy.md`](landing-page-copy.md) | sima.dev / GitHub Pages | Подготовить до запуска |
| [`personal-outreach.md`](personal-outreach.md) | Личные DM-ы Karpathy, Simon Willison, Geoffrey Huntley, Thariq Shihipar | День 5-7 точечно |
| [`wow-moments-checklist.md`](wow-moments-checklist.md) | Что записать на видео / заскринить **во время** первой установки | День 0 (до публикации) |

## Три hook'а вокруг которых построена вся коммуникация

1. **«Sima пишет Sima, а судья не даёт ей соврать»** — `atlas/autonomous_runs/v1-overnight-20260620T075444.log` — реальный лог 75-минутного автономного V-1-прогона. 3 честных stall, 0 ложных promotion. Это та история, которой нет ни у одного AI-coding репо.

2. **«Kanon Protocol — REST для AI-разработки»** — `kanon-protocol-manifesto-v2.1-ru.md` + `kanon-protocol-spec-v0.1.md`. Опубликованный протокол + Level 1/2/3 compliance + reference implementation, прошедшая собственный аудит.

3. **«Скачай .exe — канвас открывается»** — `extensions/desktop/` + `.github/workflows/desktop-build.yml`. Десктопный инсталлятор Mac/Win/Linux после `git tag v0.4.0`. Никаких `npm install`.

## Принципы тона

- **Никаких маркетинговых слов** («revolutionary», «game-changing», «next-gen»). Технически дружелюбная аудитория их учуит за 3 секунды и зашоркает.
- **Каждое утверждение — verifiable**. Не «работает с локальными моделями» а «`LLM_PREFER_OLLAMA=1` запустит каскад против `qwen2.5-coder:7b` из коробки».
- **Honest about limits**. Подписи не сделаны (PR5). Судья может быть неправ. V-1 stall чаще чем promote. Это **сильная** позиция, не слабая.
- **Один артефакт — один tweet/абзац**. Не пытаться сжать всё в одно сообщение.

## Что НЕ делать

- Не врать про «first ever» — это всегда легко проверить и больно опровергнуть
- Не сравнивать напрямую с Cursor / Copilot / Aider — приглашаешь враждебное сравнение
- Не обещать «AI builds your product» — overclaim, который собьёт доверие на демо
- Не использовать AI-generated иллюстрации — узнаваемо за полсекунды и работает против вайба
- Не делать «launch» в выходные / праздники / релиз-дни Apple/OpenAI

## Какие артефакты ОБЯЗАТЕЛЬНО иметь до публикации

См. [`wow-moments-checklist.md`](wow-moments-checklist.md) — это **критический путь**.
Без 60-секундного видео «download → install → canvas opens» остальное не имеет
смысла. Все ссылки в твитах/постах должны вести на что-то, что можно **увидеть**,
а не прочитать.
