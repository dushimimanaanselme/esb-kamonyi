const express = require('express');
const bcrypt = require('bcryptjs');
const { db, id, audit } = require('../models/store');
const { auth, allow } = require('../middleware/auth');

// Never expose password hashes through the API
function safe(item) {
  if (!item || typeof item !== 'object') return item;
  const { pass, password, ...rest } = item;
  return rest;
}

// Generic CRUD factory with RBAC + validation + audit + search/filter
function crud(key, opts = {}) {
  const r = express.Router();
  const readRoles = opts.read || ['admin', 'teacher', 'student', 'parent', 'dos'];
  const writeRoles = opts.write || ['admin'];
  function listHandler(req, res) {
    let items = [...(db[key] || [])];
    const { q, classId, page = 1, limit = 100, sort } = req.query;
    if (q) { const s = q.toLowerCase(); items = items.filter(o => JSON.stringify(o).toLowerCase().includes(s)); }
    if (classId) items = items.filter(o => o.classId === classId);
    if (sort) { const k = sort.replace('-', ''); const d = sort.startsWith('-') ? -1 : 1; items.sort((a, b) => String(a[k] || '').localeCompare(String(b[k] || '')) * d); }
    const p = Math.max(1, +page), l = Math.min(500, +limit);
    const out = items.slice((p - 1) * l, p * l);
    res.json({ total: items.length, data: opts.hashPassword ? out.map(safe) : out });
  }
  // Public website content (news, events, announcements, gallery) is readable without login
  if (opts.publicRead) r.get('/', listHandler);
  else r.get('/', auth, allow(...readRoles), listHandler);
  r.get('/:rid', auth, allow(...readRoles), (req, res) => {
    const item = (db[key] || []).find(o => o.id === req.params.rid);
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(opts.hashPassword ? safe(item) : item);
  });
  r.post('/', auth, allow(...writeRoles), (req, res) => {
    if (!req.body || typeof req.body !== 'object') return res.status(400).json({ error: 'Invalid body' });
    if (opts.hashPassword) {
      // Admin sets the login email + password when creating the user
      const email = String(req.body.email || '').trim().toLowerCase();
      if (!email) return res.status(400).json({ error: 'email required' });
      if (db.users.some(u => u.email === email)) return res.status(400).json({ error: 'email already in use' });
      req.body.email = email;
      if (!req.body.password || String(req.body.password).length < 6)
        return res.status(400).json({ error: 'password must be at least 6 characters' });
      const roles = ['admin', 'teacher', 'student', 'parent', 'dos'];
      if (!req.body.role) req.body.role = 'student';
      if (!roles.includes(req.body.role)) return res.status(400).json({ error: 'invalid role' });
      req.body.active = !(req.body.active === false || req.body.active === 'false');
      req.body.pass = bcrypt.hashSync(String(req.body.password), 10);
      delete req.body.password;
    }
    const item = { id: id(key), ...req.body, createdAt: new Date().toISOString() };
    db[key].push(item);
    audit({ actor: req.user.email, action: `create ${key} ${item.id}` });
    res.status(201).json(opts.hashPassword ? safe(item) : item);
  });
  r.put('/:rid', auth, allow(...writeRoles), (req, res) => {
    const i = (db[key] || []).findIndex(o => o.id === req.params.rid);
    if (i < 0) return res.status(404).json({ error: 'Not found' });
    if (opts.hashPassword) {
      const roles = ['admin', 'teacher', 'student', 'parent', 'dos'];
      if (req.body.email !== undefined) {
        const email = String(req.body.email).trim().toLowerCase();
        if (!email) return res.status(400).json({ error: 'email required' });
        if (db.users.some(u => u.email === email && u.id !== req.params.rid))
          return res.status(400).json({ error: 'email already in use' });
        req.body.email = email;
      }
      if (req.body.password !== undefined && req.body.password !== '') {
        if (String(req.body.password).length < 6)
          return res.status(400).json({ error: 'password must be at least 6 characters' });
        req.body.pass = bcrypt.hashSync(String(req.body.password), 10);
      }
      delete req.body.password;
      if (req.body.role !== undefined && !roles.includes(req.body.role))
        return res.status(400).json({ error: 'invalid role' });
      if (req.body.active !== undefined)
        req.body.active = (req.body.active === true || req.body.active === 'true');
      if (req.params.rid === req.user.id && req.body.active === false)
        return res.status(400).json({ error: 'you cannot deactivate your own account' });
    }
    db[key][i] = { ...db[key][i], ...req.body, id: req.params.rid };
    audit({ actor: req.user.email, action: `update ${key} ${req.params.rid}` });
    res.json(opts.hashPassword ? safe(db[key][i]) : db[key][i]);
  });
  r.delete('/:rid', auth, allow('admin'), (req, res) => {
    const i = (db[key] || []).findIndex(o => o.id === req.params.rid);
    if (i < 0) return res.status(404).json({ error: 'Not found' });
    const [gone] = db[key].splice(i, 1);
    audit({ actor: req.user.email, action: `delete ${key} ${req.params.rid}` });
    res.json({ message: 'Deleted', item: opts.hashPassword ? safe(gone) : gone });
  });
  return r;
}
module.exports = crud;
