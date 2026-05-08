// Synthetic JSX fixture for tests/introspect_block_ui.selftest.mjs.
// Exercises every shape the parser cares about, including JSX expressions
// with `>` inside arrow functions (the historical naive-regex breaker).

function SyntheticPanel({ tasks, onCreate }) {
  return (
    <div className="panel">
      <h2>Tasks</h2>
      <form onSubmit={(e) => { e.preventDefault(); onCreate(name); }} action="/api/tasks" method="POST">
        <label>Название</label>
        <input type="text" name="title" placeholder="Введите название" required />
        <textarea name="notes" rows="3" placeholder="Описание (опционально)"></textarea>
        <button type="submit" onClick={() => onCreate(name)}>Создать задачу</button>
        <button onClick={() => { if (window.confirm('Удалить?')) deleteAll(); }}>Очистить всё</button>
      </form>
      <div>
        <Link to="/tasks/active">Активные</Link>
        <NavLink to="/tasks/done">Готовые</NavLink>
        <a href="https://example.com/help">Справка</a>
      </div>
      <button onClick={async () => {
        const r = await fetch('/api/tasks', { method: 'POST', body: JSON.stringify({ name }) });
        return r.json();
      }}>Сохранить</button>
      <Routes>
        <Route path="/tasks" element={<TaskList />} />
        <Route path="/tasks/:id" element={<TaskDetail />} />
      </Routes>
    </div>
  );
}
