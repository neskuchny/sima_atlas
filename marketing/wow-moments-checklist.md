# Wow-moments checklist — что записать на видео и заскринить

**Без этих артефактов остальное в kit'е не работает.** Все ссылки в твитах/постах
должны вести на что-то, что можно **увидеть**, а не прочитать. Видео > скриншот > текст.

---

## 🎬 Главный артефакт: 60-90 секундное demo video

**Файл:** `marketing/assets/install-and-canvas.mp4` (не существует — записать)
**Загрузить на:** YouTube (unlisted), Cloudflare R2, или README через `<video>`.
**Для Twitter:** перекодировать в .mp4 H.264 ≤ 2:20, < 512 MB.

### Раскадровка (60 секунд)

| Время | Что показать | Что говорить (если voiceover) или просто оставить тихо с подписями |
|---|---|---|
| 0:00-0:05 | Чистый Windows (или Mac) desktop. Браузер открыт на `github.com/.../releases/latest`. | (нет звука; подпись на экране: «Sima Atlas v0.4.0 release page») |
| 0:05-0:10 | Клик по `Sima Atlas Setup 0.4.0.exe`. Скачивание начинается. | (подпись: «No npm. No git. No terminal.») |
| 0:10-0:15 | Двойной клик по скачанному файлу. SmartScreen появляется. | (подпись: «Unsigned binary — one click-through») |
| 0:15-0:20 | «More info» → «Run anyway». Installer открывается. | (без подписей) |
| 0:20-0:25 | Стандартный NSIS install wizard. Жмём Install. | (подпись: «Standard NSIS installer · 30 seconds») |
| 0:25-0:30 | Установка завершилась. Запускается приложение. | (без подписей) |
| 0:30-0:40 | Окно открыто. Канвас с populated demo blocks (b.docs, b.core-sync, etc.). | (подпись: «Demo project loaded · 8 blocks · live graph») |
| 0:40-0:45 | Меню File → Open Project. Появляется Project Picker. | (подпись: «File → Open Project · ⌘O») |
| 0:45-0:50 | Возврат на канвас. Клик по блоку b.docs. DetailPanel выезжает. | (подпись: «Click any block — full contract on the right») |
| 0:50-0:55 | Меню Run → Verify All Blocks. Хоткей ⌘⇧V показан. | (подпись: «⌘⇧V · Verify All · runs against acceptance.md») |
| 0:55-1:00 | Notification: «Verify All started». Канвас обновляется. End frame: логотип Sima + URL. | (подпись: «MIT · github.com/neskuchny/sima_atlas») |

### Технические требования к записи

- **Разрешение**: 1920×1080 минимум, лучше 2560×1440. Для Twitter будет даунскейл, но HN/Reddit смотрят на полном.
- **Frame rate**: 30 fps достаточно. 60 fps если канвас animated heavily.
- **Аудио**: не обязательно. Если voiceover — пиши скрипт заранее, не импровизируй. Дешёвый USB-микрофон лучше чем встроенный лаптоп.
- **Cursor**: видимый, нормального размера. Не использовать никаких «zoom into clicks» эффектов — выглядит дёшево.
- **Background music**: НЕТ. Технические зрители ненавидят stock music. Тишина или voiceover.

### Где НЕ снимать

- В Cursor / VSCode — выглядит как «yet another AI plugin»
- В терминале — противоречит главному месседжу «никакого терминала»
- На фоне `localhost:8000` — желательно показать именно нативное окно

---

## 📸 Screenshot pack (3-5 штук)

Сохранить в `marketing/assets/screenshots/`:

### 1. `01-v1-overnight-summary.png`

Терминал с финальным выводом V-1 daemon:

```
agent_loop_daemon [claude]: 3 block(s) — 0 advanced · 3 stalled
  stop: complete — no runnable blocks left
    ✗ b.db (idea) → fail: semantic verify FAILED
    ✗ b.smoke-sandbox (idea) → fail: verifier did not pass
    ✗ b.core-sync (done) → fail: semantic verify FAILED
```

**Используется в:** Twitter tweet 1, HN body, Reddit r/programming top
**Чем снимать:** обычный screenshot терминала. Шрифт ≥ 14pt, тёмная тема — все её любят. Без скруглённых углов окна macOS — лишняя визуальная нагрузка.

### 2. `02-semantic-review-verdict.png`

Pretty-print фрагмента `atlas/blocks/b.db/semantic_review.json` или output из:
```
node -e "
const r=require('./atlas/blocks/b.db/semantic_review.json');
console.log('overall:', r.overall);
for (const k of ['mission_fulfilled','conditions_met','methodology_followed','works_as_described','connections_consistent']) {
  console.log(k, ':', r[k]?.verdict, '·', (r[k]?.reasoning||'').slice(0,120));
}
"
```

**Используется в:** Twitter tweet 3.

### 3. `03-canvas-overview.png`

Скриншот канваса с реальным graph (8 blocks, dependencies edges, status colours).
**Используется в:** landing page, dev.to post, README.

### 4. `04-block-detail-panel.png`

Канвас с открытым DetailPanel: mission, acceptance, decisions visible.
**Используется в:** Twitter reply «what does a block look like inside».

### 5. `05-token-economics.png`

Token Spend widget showing real numbers from `atlas/llm_traces/`.
**Используется в:** Reddit r/LocalLLaMA + cost discussions.

---

## 📝 Текстовые артефакты (уже в репо, нужно просто sanity-check link work)

После того как ты пушнёшь tag и CI отработает, проверить:

- [ ] `github.com/neskuchny/sima_atlas/releases/latest` → ведёт на v0.4.0
- [ ] Release page имеет attached: `.dmg` (arm64 + x64), `.exe` (Setup + portable), `.AppImage`, `.deb`
- [ ] README отображается корректно (Quickstart Option A первый)
- [ ] `kanon-protocol-manifesto-v2.1-ru.md` грузится без mangling
- [ ] `atlas/autonomous_runs/v1-overnight-20260620T075444.log` грузится в browser
- [ ] `CHANGELOG.md` показывает [0.4.0] первым
- [ ] `RELEASE_NOTES.md` рендерится

Если что-то ломается — чинить **до** запуска thread'а. Любая 404 в первом тысячном клике убивает доверие безвозвратно.

---

## 🎯 Один артефакт = одно сообщение — критическое правило

Каждый твит / абзац / комментарий в посте должен указывать на **один конкретный артефакт**, который читатель может открыть и проверить:

| Утверждение | Артефакт |
|---|---|
| «V-1 ran 75 minutes autonomously» | `atlas/autonomous_runs/v1-overnight-*.log` |
| «3 honest stalls» | тот же лог |
| «Semantic judge said no» | `atlas/blocks/<id>/semantic_review.json` |
| «Tri-state verdict» | `scripts/collect_evidence.mjs` (точнее `verifyBlock`) |
| «5 deterministic evidence kinds» | `scripts/collect_evidence.mjs` exports |
| «Kanon Protocol spec» | `kanon-protocol-spec-v0.1.md` |
| «Level 3 compliance claimed» | `README.md` section + `kanon-protocol-spec-v0.1.md` §7.3 |
| «79/79 nightly» | `atlas/nightly_report.md` |
| «Multi-source chat ingestion» | `scripts/chat_sources/*` |
| «Downloadable installer» | `github.com/.../releases/v0.4.0` |
| «CI builds 3 OSes» | `.github/workflows/desktop-build.yml` |

Если для какого-то утверждения нет артефакта — **не упоминай его в launch-материалах**. Лучше промолчать чем оказаться загнанным в угол вопросом «а покажи».

---

## ❌ Что НЕ постить как screenshot

- AI-generated illustrations — узнаваемо за полсекунды
- Stock photos «developer typing» — выглядит как pitch deck
- Untextured 3D render логотипа — выглядит как 2014
- Скриншот в Cursor с открытым SimaAtlas project — путает сообщение «это не редактор»

---

## Финальный sanity check за час до публикации

- [ ] Tag v0.4.0 запушен и CI зелёный
- [ ] Все 6 артефактов в releases/v0.4.0 прикреплены
- [ ] Видео загружено (YouTube unlisted ОК) и URL работает
- [ ] Все 5 screenshot'ов готовы
- [ ] README, RELEASE_NOTES, CHANGELOG отображаются на github.com
- [ ] Лог V-1 grуzится прямо в браузер
- [ ] `kanon-protocol-manifesto-v2.1-ru.md` grуzится без encoding issues
- [ ] Твой Twitter handle ≥ 100 followers (иначе thread не наберёт impressions)
- [ ] Сегодня не вторник 9 утра PT — отлично, запускаем; иначе ждёшь окна
- [ ] Сегодня не день анонса OpenAI / Anthropic / Apple — иначе ждёшь
