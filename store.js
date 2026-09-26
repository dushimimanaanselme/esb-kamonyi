const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

// ---- Database: MySQL if configured, otherwise persisted JSON file ----
const FILE = path.join(__dirname, '..', 'data', 'db.json');
const db = {
  users: [], students: [], teachers: [], parents: [],
  classes: [], subjects: [], attendance: [], exams: [], marks: [],
  assignments: [], submissions: [], materials: [], quizzes: [],
  fees: [], payments: [], admissions: [], announcements: [],
  news: [], events: [], gallery: [], notifications: [],
  timetable: [], discipline: [],
  staff: [],
  settings: { schoolName: 'ESB KAMONYI', fullName: 'ECOLE SAINTE BERNADETTE KAMONYI' },
  audit: []
};
let seq = 1;
const id = (p) => p + '_' + (seq++) + Date.now().toString(36);

// Full subject catalog: Lower secondary O-Level (S1-S3) + Upper secondary A-Level (S4-S6)
const DEFAULT_SUBJECTS = [
  { id: 'sub_nur_kin', name: 'Kinyarwanda', code: 'KIN_N', level: 'Nursery', maxMarks: 100 },
  { id: 'sub_nur_eng', name: 'English', code: 'ENG_N', level: 'Nursery', maxMarks: 100 },
  { id: 'sub_nur_art', name: 'Art & Craft', code: 'ART_N', level: 'Nursery', maxMarks: 100 },
  { id: 'sub_nur_mot', name: 'Motor Skills', code: 'MOT_N', level: 'Nursery', maxMarks: 100 },
  { id: 'sub_nur_soc', name: 'Socialisation', code: 'SOC_N', level: 'Nursery', maxMarks: 100 },
  { id: 'sub_pri_kin', name: 'Kinyarwanda', code: 'KIN_P', level: 'Primary', maxMarks: 100 },
  { id: 'sub_pri_eng', name: 'English', code: 'ENG_P', level: 'Primary', maxMarks: 100 },
  { id: 'sub_pri_fre', name: 'French', code: 'FRE_P', level: 'Primary', maxMarks: 100 },
  { id: 'sub_pri_math', name: 'Mathematics', code: 'MAT_P', level: 'Primary', maxMarks: 100 },
  { id: 'sub_pri_sci', name: 'Science', code: 'SCI_P', level: 'Primary', maxMarks: 100 },
  { id: 'sub_pri_sst', name: 'Social Studies', code: 'SST_P', level: 'Primary', maxMarks: 100 },
  { id: 'sub_pri_rel', name: 'Religion', code: 'REL_P', level: 'Primary', maxMarks: 100 },
  { id: 'sub_math', name: 'Mathematics', code: 'MAT', level: 'Both', maxMarks: 100 },
  { id: 'sub_eng', name: 'English', code: 'ENG', level: 'Both', maxMarks: 100 },
  { id: 'sub_kin', name: 'Kinyarwanda', code: 'KIN', level: 'Both', maxMarks: 100 },
  { id: 'sub_fre', name: 'French', code: 'FRE', level: 'Both', maxMarks: 100 },
  { id: 'sub_kis', name: 'Kiswahili', code: 'KIS', level: 'O-Level', maxMarks: 100 },
  { id: 'sub_phy', name: 'Physics', code: 'PHY', level: 'Both', maxMarks: 100 },
  { id: 'sub_che', name: 'Chemistry', code: 'CHE', level: 'Both', maxMarks: 100 },
  { id: 'sub_bio', name: 'Biology', code: 'BIO', level: 'Both', maxMarks: 100 },
  { id: 'sub_his', name: 'History', code: 'HIS', level: 'Both', maxMarks: 100 },
  { id: 'sub_geo', name: 'Geography', code: 'GEO', level: 'Both', maxMarks: 100 },
  { id: 'sub_ict', name: 'ICT', code: 'ICT', level: 'Both', maxMarks: 100 },
  { id: 'sub_ent', name: 'Entrepreneurship', code: 'ENT', level: 'Both', maxMarks: 100 },
  { id: 'sub_rel', name: 'Religion', code: 'REL', level: 'O-Level', maxMarks: 100 },
  { id: 'sub_amat', name: 'Advanced Mathematics', code: 'AMAT', level: 'A-Level', maxMarks: 100 },
  { id: 'sub_elit', name: 'English Literature', code: 'ELIT', level: 'A-Level', maxMarks: 100 },
  { id: 'sub_eco', name: 'Economics', code: 'ECO', level: 'A-Level', maxMarks: 100 },
  { id: 'sub_csc', name: 'Computer Science', code: 'CSC', level: 'A-Level', maxMarks: 100 },
  { id: 'sub_gp', name: 'General Paper', code: 'GP', level: 'A-Level', maxMarks: 100 }
];
// Staff directory starts empty — the admin adds her own members with photos.
// Adds any missing catalog subjects to existing installs (matched by code)
function ensureSubjects() {
  let changed = false;
  DEFAULT_SUBJECTS.forEach(s => {
    const ex = db.subjects.find(x => x.code === s.code);
    if (!ex) { db.subjects.push({ ...s }); changed = true; }
    else if (!ex.level) { ex.level = s.level; if (!ex.maxMarks) ex.maxMarks = 100; changed = true; }
  });
  if (changed) save();
}

// Save every change so accounts and data survive server restarts
function save() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify({ seq, db }));
  } catch (e) { console.log('save failed:', e.message); }
}
function load() {
  try {
    if (!fs.existsSync(FILE)) return false;
    const f = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (!f.db || !Array.isArray(f.db.users)) return false;
    Object.keys(db).forEach(k => { if (f.db[k] !== undefined) db[k] = f.db[k]; });
    if (f.seq) seq = f.seq;
    return true;
  } catch (e) { console.log('load failed:', e.message); return false; }
}

async function seed() {
  if (load()) { ensureAdmin(); ensureSubjects(); console.log('Loaded saved data from data/db.json'); return; }
  if (db.users.length) return;
  const hash = (p) => bcrypt.hashSync(p, 10);
  db.users.push(
    { id: 'u_admin', name: 'Admin Principal', email: 'eniyongabo31@gmail.com', pass: hash('elyse@2004'), role: 'admin', active: true },
    { id: 'u_teacher', name: 'Jean Bosco Niyonsenga', email: 'teacher@esb.rw', pass: hash('Teacher123!'), role: 'teacher', active: true },
    { id: 'u_student', name: 'Aline Uwase', email: 'student@esb.rw', pass: hash('Student123!'), role: 'student', active: true },
    { id: 'u_parent', name: 'Emmanuel Habimana', email: 'parent@esb.rw', pass: hash('Parent123!'), role: 'parent', active: true }
  );
  db.classes.push(
    { id: 'c_s1a', name: 'S1 A', level: 'Secondary', teacherId: 't1', academicYear: '2025-2026' },
    { id: 'c_s1b', name: 'S1 B', level: 'Secondary', teacherId: 't2', academicYear: '2025-2026' },
    { id: 'c_s2a', name: 'S2 A', level: 'Secondary', teacherId: 't1', academicYear: '2025-2026' },
    { id: 'c_s3', name: 'S3', level: 'Secondary', teacherId: 't2', academicYear: '2025-2026' },
    { id: 'c_s4', name: 'S4', level: 'Secondary', teacherId: 't1', academicYear: '2025-2026' },
    { id: 'c_p6', name: 'P6', level: 'Primary', teacherId: 't2', academicYear: '2025-2026' }
  );
  // Full subject catalog: O-Level (S1-S3) + A-Level (S4-S6) per Rwanda curriculum
  DEFAULT_SUBJECTS.forEach(s => db.subjects.push({ ...s }));
// Staff office profiles are added by the admin herself (portal → Staff);
// nothing is pre-seeded so she starts with her own people and photos.
  const firstNames = ['Aline','Eric','Divine','Kevin','Sandrine','Patrick','Josiane','Claude','Esther','Fabrice','Grace','Innocent','Jeanne','Laurent','Nadine','Olivier','Patience','Ruth','Samuel','Vestine'];
  firstNames.forEach((n, i) => {
    db.students.push({ id: 's' + (i + 1), studentId: 'ESB/2025/' + String(100 + i), name: n + ' ' + ['Uwase','Nkurunziza','Mukeshimana','Habimana','Umutoni'][i % 5], gender: i % 2 ? 'Male' : 'Female', dob: '2010-05-1' + (i % 9), classId: ['c_s1a','c_s1b','c_s2a'][i % 3], parent: 'Emmanuel Habimana', phone: '+2507881000' + String(i).padStart(2, '0'), email: '', address: 'Kamonyi', admissionDate: '2025-09-01', academicYear: '2025-2026', status: 'active' });
  });
  db.parents.push({ id: 'p1', userId: 'u_parent', name: 'Emmanuel Habimana', phone: '+250788200001', email: 'parent@esb.rw', children: ['s1','s2'], status: 'active' });
  db.exams.push({ id: 'e1', name: 'Mid-term Examination', type: 'mid-term', term: 'Term 1', academicYear: '2025-2026', startDate: '2025-10-20', endDate: '2025-10-31', status: 'upcoming' });
  db.assignments.push({ id: 'a1', title: 'Algebra Exercise 5', subject: 'Mathematics', classId: 'c_s1a', instructions: 'Solve all quadratic equations on page 42.', deadline: '2026-10-05', createdBy: 'Jean Bosco Niyonsenga', createdAt: new Date().toISOString() });
  db.materials.push({ id: 'm1', title: 'S1 Mathematics Notes - Algebra', subject: 'Mathematics', classId: 'c_s1a', type: 'PDF', url: '#', uploadedBy: 'J.B. Niyonsenga' });
  db.quizzes.push({ id: 'q1', title: 'Algebra Basics Quiz', subject: 'Mathematics', classId: 'c_s1a', durationMin: 15, questions: [{ q: 'What is 3x + 5 = 20, x = ?', options: ['3', '5', '7', '15'], answer: 1 }, { q: 'True/False: x^2 = 9 means x = 3 only.', options: ['True', 'False'], answer: 1 }] });
  db.announcements.push({ id: 'an1', title: 'Term 1 Mid-term Exams start 20 Oct', body: 'All students must check the timetable posted on the notice board.', audience: 'all', date: '2025-10-01', author: 'Administration' });
  db.news.push({ id: 'n1', title: 'ESB Kamonyi celebrates 98% pass rate', body: 'Our S3 students achieved excellent results in district exams.', date: '2025-09-10', author: 'Admin', category: 'Academics', image: '' });
  db.events.push({ id: 'ev1', title: 'Parents Meeting', description: 'General parents meeting at school hall.', date: '2026-10-10', location: 'School Hall', category: 'Meeting' });
  db.gallery.push({ id: 'g1', title: 'Science Fair 2025', category: 'Events', url: '' });
  db.fees.push({ id: 'f1', classId: 'c_s1a', term: 'Term 1', amount: 45000, academicYear: '2025-2026' });
  db.payments.push({ id: 'pay1', studentId: 's1', amount: 30000, date: '2025-09-15', method: 'Cash', receipt: 'R-0001', receivedBy: 'Bursar' });
  db.attendance.push({ id: 'at1', classId: 'c_s1a', date: new Date().toISOString().slice(0, 10), records: [{ studentId: 's1', status: 'present' }, { studentId: 's4', status: 'present' }] });
  db.marks.push({ id: 'mk1', examId: 'e1', studentId: 's1', subject: 'Mathematics', score: 78, max: 100 });
  db.notifications.push({ id: 'nt1', userId: 'u_student', title: 'New assignment posted', body: 'Algebra Exercise 5 is due 05 Oct.', date: new Date().toISOString(), read: false });
  db.timetable.push(
    { id: 'tt1', classId: 'c_s1a', day: 'Monday', period: 'P1 · 07:30-08:20', subject: 'Mathematics', teacher: 'Jean Bosco Niyonsenga' },
    { id: 'tt2', classId: 'c_s1a', day: 'Monday', period: 'P2 · 08:20-09:10', subject: 'English', teacher: 'Marie Claire Mukamana' },
    { id: 'tt3', classId: 'c_s1b', day: 'Tuesday', period: 'P1 · 07:30-08:20', subject: 'Mathematics', teacher: 'Jean Bosco Niyonsenga' }
  );
  db.discipline.push(
    { id: 'd1', studentId: 's1', date: '2025-09-20', category: 'Excellent Conduct', action: 'Commendation', recordedBy: 'J.B. Niyonsenga', comment: 'Helped a new student settle in.' }
  );
}
// The admin account must always exist so it can log in:
// recreated automatically if missing, never modified if present.
function ensureAdmin() {
  if (!db.users.some(u => u.email === 'eniyongabo31@gmail.com')) {
    db.users.push({ id: 'u_admin', name: 'Admin Principal', email: 'eniyongabo31@gmail.com', pass: bcrypt.hashSync('elyse@2004', 10), role: 'admin', active: true });
    save();
    console.log('Admin account ensured: eniyongabo31@gmail.com');
  }
}
function audit(entry) {
  db.audit.push({ ...entry, at: new Date().toISOString() });
  if (db.audit.length > 500) db.audit = db.audit.slice(-500); // keep data file lean
  save();
}
module.exports = { db, id, seed, audit, save };
