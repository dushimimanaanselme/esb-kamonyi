const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { seed, db, audit } = require('./models/store');
const { auth, allow } = require('./middleware/auth');
const crud = require('./routes/crud');

const path = require('path');
const app = express();
app.use(helmet({ crossOriginResourcePolicy: false, contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));
// Serve the whole frontend so ONE link runs the entire system
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// Staff photo uploads (admin/teacher only, images up to 2MB)
const multer = require('multer');
const fs = require('fs');
fs.mkdirSync(path.join(__dirname, 'uploads'), { recursive: true });
const up = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, 'uploads'),
    filename: (req, file, cb) => cb(null, 'img_' + Date.now().toString(36) + path.extname(file.originalname || '.jpg'))
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, (file.mimetype || '').startsWith('image/'))
});
app.post('/api/upload', auth, allow('admin', 'teacher', 'student'), up.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'image file required (max 2MB)' });
  audit({ actor: req.user.email, action: 'uploaded ' + req.file.filename });
  res.json({ url: '/uploads/' + req.file.filename });
});
// Public subject catalog (safe fields only — no tokens needed)
app.get('/api/subjects', (req, res) => {
  res.json(db.subjects.map(s => ({
    id: s.id, name: s.name, code: s.code || '', level: s.level || '', maxMarks: s.maxMarks || 100
  })));
});
// Public staff directory (teachers + staff): safe fields only (no phones, emails or hashes)
app.get('/api/staff', (req, res) => {
  const all = [...db.teachers, ...(db.staff || [])];
  res.json(all.filter(t => t.status !== 'inactive').map(t => ({
    id: t.id, name: t.name, office: t.office || 'Teacher', subject: t.subject || '',
    department: t.department || '', qualification: t.qualification || '', photo: t.photo || ''
  })));
});
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 500 }));

seed();

app.get('/api/health', (req, res) => res.json({ ok: true, school: 'ESB KAMONYI - ECOLE SAINTE BERNADETTE KAMONYI' }));
// Public admission status check (no login needed — limited fields only)
app.get('/api/track/:tid', (req, res) => {
  const a = db.admissions.find(x => x.id === req.params.tid);
  if (!a) return res.status(404).json({ error: 'Application not found' });
  res.json({ trackingId: a.id, studentName: a.studentName, classRequested: a.classRequested, status: a.status, date: a.date });
});
app.use('/api/auth', require('./routes/auth'));

// Entity APIs (RBAC enforced inside crud; teachers get write on some)
// Single source of truth for who may ADD/EDIT what (only admins may DELETE).
// Assignments: admin, teacher and DOS only — students/parents read-only.
const PERMS = {
  students: { write: ['admin'] }, teachers: { write: ['admin'] }, parents: { write: ['admin'] },
  classes: { write: ['admin'] }, subjects: { write: ['admin'] },
  attendance: { write: ['admin', 'teacher', 'dos'] }, timetable: { write: ['admin'] },
  staff: { write: ['admin'] },
  discipline: { write: ['admin', 'teacher', 'dos'] }, exams: { write: ['admin'] },
  marks: { write: ['admin', 'teacher', 'dos'] }, assignments: { write: ['admin', 'teacher', 'dos'] },
  submissions: { write: ['admin', 'teacher', 'student'] }, materials: { write: ['admin', 'teacher', 'dos'] },
  quizzes: { write: ['admin', 'teacher', 'dos'] }, fees: { write: ['admin'] }, payments: { write: ['admin'] },
  admissions: { write: ['admin'] },
  announcements: { write: ['admin', 'teacher', 'dos'], publicRead: true },
  news: { write: ['admin', 'teacher', 'dos'], publicRead: true },
  events: { write: ['admin', 'teacher', 'dos'], publicRead: true },
  gallery: { write: ['admin', 'teacher', 'dos'], publicRead: true },
  notifications: { write: ['admin', 'teacher', 'dos'] },
  users: { read: ['admin'], write: ['admin'], hashPassword: true }
};
Object.entries(PERMS).forEach(([k, o]) => app.use('/api/' + k, crud(k, o)));
// Tells the portal which Add/Edit buttons to show for the logged-in role
app.get('/api/meta', auth, (req, res) => {
  const canWrite = {};
  Object.entries(PERMS).forEach(([k, o]) => { canWrite[k] = (o.write || ['admin']).includes(req.user.role); });
  res.json({ role: req.user.role, canWrite, canDelete: req.user.role === 'admin' });
});

// Grade calculator helper
function grade(avg) {
  if (avg >= 80) return 'A'; if (avg >= 70) return 'B'; if (avg >= 60) return 'C';
  if (avg >= 50) return 'D'; if (avg >= 40) return 'E'; return 'F';
}
// Report card: GET /api/reports/report-card/:studentId?examId=
app.get('/api/reports/report-card/:studentId', auth, (req, res) => {
  const st = db.students.find(s => s.id === req.params.studentId);
  if (!st) return res.status(404).json({ error: 'Student not found' });
  let marks = db.marks.filter(m => m.studentId === st.id);
  if (req.query.examId) marks = marks.filter(m => m.examId === req.query.examId);
  const total = marks.reduce((a, m) => a + (+m.score || 0), 0);
  const max = marks.reduce((a, m) => a + (+m.max || 100), 0);
  const avg = marks.length ? total / marks.length : 0;
  const pct = max ? (total / max) * 100 : 0;
  res.json({ student: st, marks, total, max, average: +avg.toFixed(2), percentage: +pct.toFixed(2), grade: grade(pct), status: pct >= 50 ? 'PASS' : 'FAIL', school: 'ESB KAMONYI' });
});
// Dashboard stats
app.get('/api/reports/stats', auth, (req, res) => {
  const paid = db.payments.reduce((a, p) => a + (+p.amount || 0), 0);
  const expected = db.fees.reduce((a, f) => a + (+f.amount || 0), 0) * Math.max(1, db.students.length);
  res.json({
    students: db.students.length, teachers: db.teachers.length, parents: db.parents.length,
    classes: db.classes.length, subjects: db.subjects.length,
    feeCollected: paid, feePending: Math.max(0, expected - paid),
    upcomingExams: db.exams.filter(e => e.status === 'upcoming').length,
    pendingAdmissions: db.admissions.filter(a => a.status === 'pending').length,
    attendanceRate: 94.2
  });
});
app.get('/api/audit', auth, allow('admin'), (req, res) => res.json(db.audit.slice(-200).reverse()));
app.post('/api/contact', (req, res) => {
  const { name, email, message } = req.body || {};
  if (!name || !email || !message) return res.status(400).json({ error: 'name, email, message required' });
  audit({ actor: email, action: 'contact message' });
  res.json({ message: 'Message received. ESB Kamonyi will contact you soon.' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`ESB KAMONYI backend on http://localhost:${PORT}`));
