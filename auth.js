const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { db, audit } = require('../models/store');
const { sign } = require('../middleware/auth');
const router = express.Router();

router.post('/login',
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid input', details: errors.array() });
    const { email, password } = req.body;
    const user = db.users.find(u => u.email === email && u.active);
    if (!user || !bcrypt.compareSync(password, user.pass))
      return res.status(401).json({ error: 'Invalid email or password' });
    audit({ actor: user.email, action: 'login' });
    res.json({ token: sign(user), user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  });

// Public self-registration: anyone can create student/parent/teacher
// account and log in immediately. Admin role can NEVER self-register.
router.post('/register',
  body('name').trim().isLength({ min: 2 }),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('role').optional().isIn(['student', 'parent', 'teacher']),
  body('subject').optional().trim().isLength({ max: 100 }),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid input', details: errors.array() });
    const { name, email, password, role, subject } = req.body;
    if (db.users.some(u => u.email === email)) return res.status(400).json({ error: 'email already in use' });
    const user = { id: 'u_' + Date.now().toString(36), name, email, pass: bcrypt.hashSync(password, 10), role: role || 'student', active: true, createdAt: new Date().toISOString() };
    if (user.role === 'teacher' && subject) user.subject = subject;
    db.users.push(user);
    audit({ actor: email, action: 'self-registered as ' + user.role });
    res.status(201).json({ token: sign(user), user: { id: user.id, name: user.name, email: user.email, role: user.role, subject: user.subject || '' } });
  });

router.post('/register-admission', (req, res) => {  const { studentName, parentName, phone, classRequested } = req.body;
  if (!studentName || !parentName || !phone) return res.status(400).json({ error: 'studentName, parentName, phone required' });
  const adm = { id: 'adm_' + Date.now(), ...req.body, status: 'pending', date: new Date().toISOString() };
  db.admissions.push(adm);
  db.notifications.push({ id: 'nt_' + Date.now(), userId: 'u_admin', title: 'New admission application', body: studentName + ' applied for ' + (classRequested || ''), date: new Date().toISOString(), read: false });
  audit({ actor: req.body.email || 'website', action: 'new admission application ' + adm.id });
  res.status(201).json({ message: 'Application received', trackingId: adm.id });
});
module.exports = router;
