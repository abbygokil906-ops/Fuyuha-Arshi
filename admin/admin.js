(function () {
  const $ = (id) => document.getElementById(id);
  const STATUS_LABEL = { todo: 'Belum', doing: 'Dikerjakan', done: 'Selesai' };
  let state = { enabled: false, message: '', updatedAt: null };

  // Semua panggilan memakai cookie sesi (credentials: same-origin) dan JSON.
  async function api(path, options) {
    const res = await fetch(path, Object.assign({
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
    }, options || {}));
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok) {
      const err = new Error((data && data.error) || ('HTTP ' + res.status));
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function showView(loggedIn) {
    $('loginView').classList.toggle('hidden', loggedIn);
    $('dashView').classList.toggle('hidden', !loggedIn);
    $('logoutBtn').classList.toggle('hidden', !loggedIn);
  }

  function renderMaintenance() {
    const btn = $('maintToggle');
    btn.textContent = state.enabled ? 'Maintenance AKTIF (klik untuk matikan)' : 'Maintenance mati (klik untuk aktifkan)';
    btn.className = state.enabled ? 'toggle-on' : 'toggle-off';
    $('maintMessage').value = state.message || '';
    $('maintUpdated').textContent = state.updatedAt ? 'Terakhir diubah: ' + new Date(state.updatedAt).toLocaleString('id-ID') : '';
  }

  async function loadMaintenance() {
    state = await api('/api/maintenance');
    renderMaintenance();
  }

  async function saveMaintenance(enabled) {
    $('maintError').textContent = '';
    $('maintOk').textContent = '';
    const message = $('maintMessage').value.trim();
    state = await api('/api/maintenance', {
      method: 'POST',
      body: JSON.stringify({ enabled: enabled, message: message }),
    });
    renderMaintenance();
    $('maintOk').textContent = enabled ? 'Maintenance diaktifkan.' : 'Maintenance dimatikan.';
  }

  function taskCard(t) {
    const wrap = document.createElement('div');
    wrap.className = 'task';

    const head = document.createElement('div');
    head.className = 'task-title';
    head.textContent = t.title;
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = STATUS_LABEL[t.status] || t.status;
    head.appendChild(badge);
    wrap.appendChild(head);

    if (t.note) {
      const note = document.createElement('div');
      note.className = 'task-note';
      note.textContent = t.note;
      wrap.appendChild(note);
    }

    const row = document.createElement('div');
    row.className = 'row';
    row.style.marginTop = '10px';

    const sel = document.createElement('select');
    sel.style.width = 'auto';
    Object.keys(STATUS_LABEL).forEach(function (k) {
      const o = document.createElement('option');
      o.value = k; o.textContent = STATUS_LABEL[k];
      if (k === t.status) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', async function () {
      try {
        await api('/api/tasks', { method: 'POST', body: JSON.stringify({ action: 'status', id: t.id, status: sel.value }) });
        await loadTasks();
      } catch (e) { $('taskError').textContent = e.message; }
    });

    const del = document.createElement('button');
    del.className = 'danger';
    del.textContent = 'Hapus';
    del.addEventListener('click', async function () {
      if (!confirm('Hapus tugas ini?')) return;
      try {
        await api('/api/tasks', { method: 'POST', body: JSON.stringify({ action: 'delete', id: t.id }) });
        await loadTasks();
      } catch (e) { $('taskError').textContent = e.message; }
    });

    row.appendChild(sel);
    row.appendChild(del);
    wrap.appendChild(row);
    return wrap;
  }

  async function loadTasks() {
    const tasks = await api('/api/tasks');
    const list = $('taskList');
    list.innerHTML = '';
    if (!tasks.length) {
      const p = document.createElement('p');
      p.className = 'muted';
      p.textContent = 'Belum ada tugas.';
      list.appendChild(p);
      return;
    }
    tasks.forEach(function (t) { list.appendChild(taskCard(t)); });
  }

  async function enterDashboard() {
    showView(true);
    try {
      await Promise.all([loadMaintenance(), loadTasks()]);
    } catch (e) {
      if (e.status === 401) return leave();
      $('maintError').textContent = e.message;
    }
  }

  function leave() {
    showView(false);
    $('loginError').textContent = '';
  }

  // Login
  $('loginForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    $('loginError').textContent = '';
    $('loginBtn').disabled = true;
    try {
      await api('/api/login', {
        method: 'POST',
        body: JSON.stringify({ username: $('username').value.trim(), password: $('password').value }),
      });
      $('password').value = '';
      await enterDashboard();
    } catch (err) {
      $('loginError').textContent = err.message;
    } finally {
      $('loginBtn').disabled = false;
    }
  });

  $('logoutBtn').addEventListener('click', async function () {
    try { await api('/api/logout', { method: 'POST', body: '{}' }); } catch (e) { /* abaikan */ }
    leave();
  });

  // Maintenance
  $('maintToggle').addEventListener('click', function () {
    saveMaintenance(!state.enabled).catch(function (e) { $('maintError').textContent = e.message; });
  });
  $('maintSave').addEventListener('click', function () {
    saveMaintenance(state.enabled).catch(function (e) { $('maintError').textContent = e.message; });
  });

  // Tugas
  $('taskAdd').addEventListener('click', async function () {
    $('taskError').textContent = '';
    const title = $('taskTitle').value.trim();
    if (!title) { $('taskError').textContent = 'Judul wajib diisi'; return; }
    try {
      await api('/api/tasks', {
        method: 'POST',
        body: JSON.stringify({ action: 'add', title: title, note: $('taskNote').value.trim() }),
      });
      $('taskTitle').value = '';
      $('taskNote').value = '';
      await loadTasks();
    } catch (e) { $('taskError').textContent = e.message; }
  });

  // Mulai: cek apakah sudah login
  (async function init() {
    try {
      const s = await api('/api/session');
      if (s.authenticated) return enterDashboard();
    } catch (e) { /* abaikan, tampilkan login */ }
    showView(false);
  })();
})();
