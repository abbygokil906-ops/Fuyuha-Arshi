const crypto = require('crypto');
const { redis, requireAdmin, requireJson } = require('../lib/auth');

const KEY = 'tasks:all';
const STATUSES = ['todo', 'doing', 'done'];

async function readTasks() {
  const raw = await redis('GET', KEY);
  if (!raw) return [];
  try { const t = JSON.parse(raw); return Array.isArray(t) ? t : []; } catch (e) { return []; }
}

async function writeTasks(tasks) {
  await redis('SET', KEY, JSON.stringify(tasks));
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!(await requireAdmin(req, res))) return;

  try {
    if (req.method === 'GET') {
      return res.status(200).json(await readTasks());
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method tidak diizinkan' });
    if (!requireJson(req, res)) return;

    const body = req.body || {};
    const tasks = await readTasks();

    if (body.action === 'add') {
      const title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : '';
      if (!title) return res.status(400).json({ error: 'Judul wajib diisi' });
      const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : '';
      const task = {
        id: crypto.randomBytes(8).toString('hex'),
        title, note, status: 'todo', createdAt: new Date().toISOString(),
      };
      tasks.unshift(task);
      await writeTasks(tasks);
      return res.status(201).json(task);
    }

    if (body.action === 'status') {
      const task = tasks.find(t => t.id === body.id);
      if (!task) return res.status(404).json({ error: 'Tugas tidak ditemukan' });
      if (!STATUSES.includes(body.status)) return res.status(400).json({ error: 'Status tidak valid' });
      task.status = body.status;
      task.updatedAt = new Date().toISOString();
      await writeTasks(tasks);
      return res.status(200).json(task);
    }

    if (body.action === 'delete') {
      const next = tasks.filter(t => t.id !== body.id);
      if (next.length === tasks.length) return res.status(404).json({ error: 'Tugas tidak ditemukan' });
      await writeTasks(next);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Action tidak dikenal' });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
};
