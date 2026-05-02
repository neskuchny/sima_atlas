# b.user-stories — KPI

- **KPI-1 (coverage).** Каждая user-story из mission имеет хотя бы один acceptance test в `b.todo-ui` (e2e через Playwright).
- **KPI-2 (no-orphans).** В UI/API нет фич, которые не описаны как user-story в этом блоке (validate cross-block).
- **KPI-3 (time-to-task).** US-1 (add task) проходит за < 5 секунд от старта набора до сохранения в БД (golden flow scenario).
