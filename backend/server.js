const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const dotenv = require('dotenv');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const ical = require('ical-generator').default;
const axios = require('axios');

dotenv.config();
const app = express();
app.use(bodyParser.json());
app.use(cors());

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Test DB connection on startup
pool.connect((err, client, release) => {
  if (err) {
    console.error('Database connection failed:', err.message, err.stack);
    process.exit(1);
  }
  console.log('Connected to PostgreSQL');
  release();
});

// Auth middleware
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      console.error('JWT verification failed:', err.message);
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Login API
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('Login attempt:', { email });
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
    const result = await pool.query(
      `SELECT id, email, password, role FROM Students WHERE email = $1
       UNION
       SELECT id, email, password, role FROM Faculty WHERE email = $1`,
      [email]
    );
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
    await pool.query('INSERT INTO Audit_Logs (user_id, action) VALUES ($1, $2)', [user.id, 'Login']);
    res.json({ token, role: user.role });
  } catch (err) {
    console.error('Login error:', err.message, err.stack);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// Signup API
app.post('/signup', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password || !role) return res.status(400).json({ error: 'All fields are required' });
    if (!['student', 'faculty'].includes(role)) return res.status(400).json({ error: 'Role must be student or faculty' });
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    let result;
    if (role === 'student') {
      result = await pool.query(
        'INSERT INTO Students (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id, email, role',
        [name, email, hashedPassword, role]
      );
    } else {
      result = await pool.query(
        'INSERT INTO Faculty (name, email, password, max_load, role) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, role',
        [name, email, hashedPassword, 20, role]
      );
    }
    const user = result.rows[0];
    const token = jwt.sign({ email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
    await pool.query('INSERT INTO Audit_Logs (user_id, action) VALUES ($1, $2)', [user.id, 'Signup']);
    res.status(201).json({ token, role: user.role, message: 'User created successfully' });
  } catch (err) {
    console.error('Signup error:', err.message, err.stack);
    if (err.code === '23505') return res.status(400).json({ error: 'Email already exists' });
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// Admin Signup API
app.post('/admin-signup', async (req, res) => {
  try {
    const { name, email, password, adminKey } = req.body;
    if (!name || !email || !password || !adminKey) return res.status(400).json({ error: 'All fields are required' });
    if (adminKey !== 'adminUnlock123') return res.status(403).json({ error: 'Invalid admin key' });
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const result = await pool.query(
      'INSERT INTO Faculty (name, email, password, max_load, role) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, role',
      [name, email, hashedPassword, 0, 'admin']
    );
    const user = result.rows[0];
    const token = jwt.sign({ email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
    await pool.query('INSERT INTO Audit_Logs (user_id, action) VALUES ($1, $2)', [user.id, 'Admin Signup']);
    res.status(201).json({ token, role: user.role, message: 'Admin user created successfully' });
  } catch (err) {
    console.error('Admin signup error:', err.message, err.stack);
    if (err.code === '23505') return res.status(400).json({ error: 'Email already exists' });
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// CRUD APIs (Courses)
app.get('/courses', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const result = await pool.query('SELECT * FROM Courses');
    res.json(result.rows);
  } catch (err) {
    console.error('Courses error:', err.message);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

app.post('/courses', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { name, code, credits, is_elective, semester } = req.body;
    if (!semester || isNaN(semester)) return res.status(400).json({ error: 'Semester is required and must be a number' });
    const existing = await pool.query('SELECT 1 FROM Courses WHERE code = $1', [code]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Course code already exists' });
    }
    const result = await pool.query(
      'INSERT INTO Courses (name, code, credits, is_elective, semester) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name, code, credits, is_elective, semester]
    );
    await pool.query('INSERT INTO Audit_Logs (user_id, action) VALUES ($1, $2)', [null, `Create Course ${code}`]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Add course error:', err.message);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// Time Slots for event drop
app.get('/time_slots', authenticate, async (req, res) => {
  try {
    const { day, start_time } = req.query;
    const result = await pool.query('SELECT * FROM Time_Slots WHERE day = $1 AND start_time = $2', [day, start_time]);
    res.json(result.rows);
  } catch (err) {
    console.error('Time slots error:', err.message);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// Generate Timetable
app.post('/generate-timetable', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { semester } = req.body;
    if (!semester || isNaN(semester)) return res.status(400).json({ error: 'Semester is required and must be a number' });

    const [courses, faculty, rooms, timeSlots] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM Courses WHERE semester = $1', [semester]),
      pool.query('SELECT COUNT(*) FROM Faculty'),
      pool.query('SELECT COUNT(*) FROM Rooms'),
      pool.query('SELECT COUNT(*) FROM Time_Slots')
    ]);
    if (courses.rows[0].count === '0' || faculty.rows[0].count === '0' || rooms.rows[0].count === '0' || timeSlots.rows[0].count === '0') {
      return res.status(400).json({ error: `Insufficient data for Semester ${semester}: Ensure Courses, Faculty, Rooms, and Time Slots are populated` });
    }

    const job = await pool.query('INSERT INTO Timetable_Jobs (status) VALUES ($1) RETURNING id', ['running']);
    const jobId = job.rows[0].id;

    const payload = { jobId, semester };
    console.log('Sending payload to solver:', payload);

    const response = await axios.post('http://localhost:5000/solve', payload).catch(err => {
      console.error('Solver response:', err.response?.data || err.message);
      throw new Error(`Solver error: ${err.response?.data?.error || err.message}`);
    });

    await pool.query('UPDATE Timetable_Jobs SET status = $1, completed_at = CURRENT_TIMESTAMP WHERE id = $2', ['completed', jobId]);
    await pool.query('INSERT INTO Audit_Logs (user_id, action) VALUES ($1, $2)', [null, `Generate Timetable Job ${jobId} for Semester ${semester}`]);
    res.json({ message: 'Timetable generated', jobId });
  } catch (err) {
    console.error('Generate timetable error:', err.message, err.stack);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// View Timetable
app.get('/timetable', authenticate, async (req, res) => {
  try {
    let query;
    if (req.user.role === 'student') {
      query = `
        SELECT ta.*, c.name AS course_name, f.name AS faculty_name, r.name AS room_name, ts.day, ts.start_time, ts.end_time
        FROM Timetable_Assignments ta
        JOIN Courses c ON ta.course_id = c.id
        JOIN Faculty f ON ta.faculty_id = f.id
        JOIN Rooms r ON ta.room_id = r.id
        JOIN Time_Slots ts ON ta.time_slot_id = ts.id
        JOIN Enrollments e ON ta.course_id = e.course_id
        WHERE e.student_id = (SELECT id FROM Students WHERE email = $1) AND ta.semester = (SELECT semester FROM Courses WHERE id = ta.course_id LIMIT 1)
      `;
    } else if (req.user.role === 'faculty') {
      query = `
        SELECT ta.*, c.name AS course_name, f.name AS faculty_name, r.name AS room_name, ts.day, ts.start_time, ts.end_time
        FROM Timetable_Assignments ta
        JOIN Courses c ON ta.course_id = c.id
        JOIN Faculty f ON ta.faculty_id = f.id
        JOIN Rooms r ON ta.room_id = r.id
        JOIN Time_Slots ts ON ta.time_slot_id = ts.id
        WHERE ta.faculty_id = (SELECT id FROM Faculty WHERE email = $1) AND ta.semester = (SELECT semester FROM Courses WHERE id = ta.course_id LIMIT 1)
      `;
    } else {
      query = `
        SELECT ta.*, c.name AS course_name, f.name AS faculty_name, r.name AS room_name, ts.day, ts.start_time, ts.end_time
        FROM Timetable_Assignments ta
        JOIN Courses c ON ta.course_id = c.id
        JOIN Faculty f ON ta.faculty_id = f.id
        JOIN Rooms r ON ta.room_id = r.id
        JOIN Time_Slots ts ON ta.time_slot_id = ts.id
      `;
    }
    const result = await pool.query(query, req.user.role !== 'admin' ? [req.user.email] : []);
    res.json(result.rows);
  } catch (err) {
    console.error('Timetable error:', err.message);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// Export PDF
// Replace the existing export endpoints
app.get('/export/pdf', async (req, res) => {
  try {
    const doc = new PDFDocument();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=timetable.pdf');
    doc.pipe(res);
    const timetable = await pool.query(`
      SELECT ta.*, c.name AS course_name, f.name AS faculty_name, r.name AS room_name, ts.day, ts.start_time, ts.end_time
      FROM Timetable_Assignments ta
      JOIN Courses c ON ta.course_id = c.id
      JOIN Faculty f ON ta.faculty_id = f.id
      JOIN Rooms r ON ta.room_id = r.id
      JOIN Time_Slots ts ON ta.time_slot_id = ts.id
    `);
    doc.fontSize(16).text(`Timetable - Semester ${timetable.rows.length ? timetable.rows[0].semester : 'Unknown'}`, { align: 'center' });
    timetable.rows.forEach(row => {
      doc.fontSize(12).text(`${row.day} ${row.start_time}-${row.end_time}: ${row.course_name} | ${row.faculty_name} | ${row.room_name}`);
    });
    doc.end();
  } catch (err) {
    console.error('PDF export error:', err.message);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

app.get('/export/excel', async (req, res) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Timetable');
    sheet.addRow(['Day', 'Time', 'Course', 'Faculty', 'Room']);
    const timetable = await pool.query(`
      SELECT ta.*, c.name AS course_name, f.name AS faculty_name, r.name AS room_name, ts.day, ts.start_time, ts.end_time
      FROM Timetable_Assignments ta
      JOIN Courses c ON ta.course_id = c.id
      JOIN Faculty f ON ta.faculty_id = f.id
      JOIN Rooms r ON ta.room_id = r.id
      JOIN Time_Slots ts ON ta.time_slot_id = ts.id
    `);
    timetable.rows.forEach(row => {
      sheet.addRow([row.day, `${row.start_time}-${row.end_time}`, row.course_name, row.faculty_name, row.room_name]);
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=timetable.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Excel export error:', err.message);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// Export iCal
app.get('/export/ical', authenticate, async (req, res) => {
  try {
    const calendar = ical({ name: 'Timetable' });
    const timetable = await pool.query(`
      SELECT ta.*, c.name AS course_name, r.name AS room_name, ts.day, ts.start_time, ts.end_time
      FROM Timetable_Assignments ta
      JOIN Courses c ON ta.course_id = c.id
      JOIN Rooms r ON ta.room_id = r.id
      JOIN Time_Slots ts ON ta.time_slot_id = ts.id
    `);
    timetable.rows.forEach(row => {
      const dayMap = { Monday: 0, Tuesday: 1, Wednesday: 2, Thursday: 3, Friday: 4 };
      const start = new Date('2025-09-22');
      start.setDate(start.getDate() + dayMap[row.day]);
      const [startHour, startMinute] = row.start_time.split(':');
      start.setHours(parseInt(startHour), parseInt(startMinute));
      const [endHour, endMinute] = row.end_time.split(':');
      const end = new Date(start);
      end.setHours(parseInt(endHour), parseInt(endMinute));
      calendar.createEvent({
        start,
        end,
        summary: row.course_name,
        location: row.room_name,
      });
    });
    res.setHeader('Content-Type', 'text/calendar');
    res.setHeader('Content-Disposition', 'attachment; filename=timetable.ics');
    res.send(calendar.toString());
  } catch (err) {
    console.error('iCal export error:', err.message);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// Manual Adjustment
app.put('/timetable/:id', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { course_id, faculty_id, room_id, time_slot_id, semester } = req.body;
    if (!semester || isNaN(semester)) return res.status(400).json({ error: 'Semester is required and must be a number' });
    const result = await pool.query(
      'UPDATE Timetable_Assignments SET course_id = $1, faculty_id = $2, room_id = $3, time_slot_id = $4, semester = $5 WHERE id = $6 RETURNING *',
      [course_id, faculty_id, room_id, time_slot_id, semester, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Assignment not found' });
    await pool.query('INSERT INTO Audit_Logs (user_id, action) VALUES ($1, $2)', [null, `Update Timetable Assignment ${req.params.id}`]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Timetable update error:', err.message);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

app.listen(3001, () => console.log('Backend running on port 3001'));