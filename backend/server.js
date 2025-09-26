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
    const { name, email, password, role, college_id, department_id } = req.body;
    if (!name || !email || !password || !role || !college_id) return res.status(400).json({ error: 'Name, email, password, role, and college_id are required' });
    if (role === 'faculty' && !department_id) return res.status(400).json({ error: 'Department_id is required for faculty' });
    if (!['student', 'faculty'].includes(role)) return res.status(400).json({ error: 'Role must be student or faculty' });

    // Verify college_id exists
    const collegeCheck = await pool.query('SELECT 1 FROM Colleges WHERE id = $1', [college_id]);
    if (collegeCheck.rows.length === 0) return res.status(400).json({ error: 'Invalid college_id' });

    // Verify department_id exists (if provided)
    if (department_id) {
      const deptCheck = await pool.query('SELECT 1 FROM Departments WHERE id = $1 AND college_id = $2', [department_id, college_id]);
      if (deptCheck.rows.length === 0) return res.status(400).json({ error: 'Invalid department_id or department does not belong to college' });
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    let result;
    if (role === 'student') {
      result = await pool.query(
        'INSERT INTO Students (name, email, password, role, college_id, department_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, email, role',
        [name, email, hashedPassword, role, college_id, department_id || null]
      );
    } else {
      result = await pool.query(
        'INSERT INTO Faculty (name, email, password, max_load, role, college_id, department_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, email, role',
        [name, email, hashedPassword, 20, role, college_id, department_id]
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
    const { name, email, password, adminKey, college_id, department_id } = req.body;
    console.log('Received admin-signup payload:', req.body); // Debug
    if (!name || !email || !password || !adminKey || !college_id) {
      return res.status(400).json({ error: 'All fields except department_id are required' });
    }
    if (adminKey !== 'adminUnlock123') {
      return res.status(403).json({ error: 'Invalid admin key' });
    }

    // Verify college_id
    const collegeCheck = await pool.query('SELECT 1 FROM Colleges WHERE id = $1', [college_id]);
    if (collegeCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid college_id' });
    }

    // Verify department_id (if provided)
    if (department_id) {
      const deptCheck = await pool.query('SELECT 1 FROM Departments WHERE id = $1 AND college_id = $2', [department_id, college_id]);
      if (deptCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Invalid department_id or department does not belong to college' });
      }
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const result = await pool.query(
      'INSERT INTO Faculty (name, email, password, max_load, role, college_id, department_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, email, role',
      [name, email, hashedPassword, 0, 'admin', college_id, department_id || null]
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

// Get Faculty
app.get('/faculty', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { college_id, department_id } = req.query;
    console.log('Faculty query params:', { college_id, department_id }); // Debug
    let query = 'SELECT id, name, email, max_load, role, college_id, department_id FROM Faculty';
    let where = '';
    let params = [];
    let idx = 1;
    if (college_id || department_id) {
      where = ' WHERE ';
      if (college_id) {
        where += `college_id = $${idx++}`;
        params.push(parseInt(college_id));
      }
      if (department_id) {
        if (college_id) where += ' AND ';
        where += `department_id = $${idx++}`;
        params.push(parseInt(department_id));
      }
    }
    const result = await pool.query(query + where, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Faculty error:', err.message, err.stack);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// Get Faculty Courses
app.get('/faculty_courses/:faculty_id', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const result = await pool.query(
      'SELECT c.* FROM Courses c JOIN Faculty_Courses fc ON c.id = fc.course_id WHERE fc.faculty_id = $1',
      [req.params.faculty_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Faculty courses error:', err.message, err.stack);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// Add Faculty Course
app.post('/faculty_courses', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { faculty_id, course_id } = req.body;
    const result = await pool.query(
      'INSERT INTO Faculty_Courses (faculty_id, course_id) VALUES ($1, $2) RETURNING *',
      [faculty_id, course_id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Add faculty course error:', err.message, err.stack);
    if (err.code === '23505') return res.status(400).json({ error: 'Already assigned' });
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// CRUD APIs (Courses)
app.get('/courses', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { college_id, department_id } = req.query;
    console.log('Courses query params:', { college_id, department_id }); // Debug
    let query = 'SELECT * FROM Courses';
    let where = '';
    let params = [];
    let idx = 1;
    if (college_id || department_id) {
      where = ' WHERE ';
      if (college_id) {
        where += `college_id = $${idx++}`;
        params.push(parseInt(college_id));
      }
      if (department_id) {
        if (college_id) where += ' AND ';
        where += `department_id = $${idx++}`;
        params.push(parseInt(department_id));
      }
    }
    const result = await pool.query(query + where, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Courses error:', err.message, err.stack);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

app.post('/courses', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { name, code, credits, is_elective, semester, college_id, department_id } = req.body;
    console.log('Add course payload:', req.body); // Debug
    if (!name || !code || !credits || !semester || !college_id || !department_id) return res.status(400).json({ error: 'All fields are required' });

    // Verify college_id
    const collegeCheck = await pool.query('SELECT 1 FROM Colleges WHERE id = $1', [college_id]);
    if (collegeCheck.rows.length === 0) return res.status(400).json({ error: 'Invalid college_id' });

    // Verify department_id
    const deptCheck = await pool.query('SELECT 1 FROM Departments WHERE id = $1 AND college_id = $2', [department_id, college_id]);
    if (deptCheck.rows.length === 0) return res.status(400).json({ error: 'Invalid department_id or department does not belong to college' });

    const existing = await pool.query('SELECT 1 FROM Courses WHERE code = $1', [code]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Course code already exists' });
    }
    const result = await pool.query(
      'INSERT INTO Courses (name, code, credits, is_elective, semester, college_id, department_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [name, code, credits, is_elective, semester, college_id, department_id]
    );
    await pool.query('INSERT INTO Audit_Logs (user_id, action) VALUES ($1, $2)', [null, `Create Course ${code}`]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Add course error:', err.message, err.stack);
    if (err.code === '23505') return res.status(400).json({ error: 'Course code already exists' });
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
    console.error('Time slots error:', err.message, err.stack);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// Generate Timetable
app.post('/generate-timetable', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { semester, college_id, department_id } = req.body;
    console.log('Generate timetable payload:', { semester, college_id, department_id }); // Debug
    if (!semester || isNaN(semester) || !college_id) return res.status(400).json({ error: 'Semester and college_id are required' });

    // Verify college_id
    const collegeCheck = await pool.query('SELECT 1 FROM Colleges WHERE id = $1', [college_id]);
    if (collegeCheck.rows.length === 0) return res.status(400).json({ error: 'Invalid college_id' });

    // Verify department_id (if provided)
    if (department_id) {
      const deptCheck = await pool.query('SELECT 1 FROM Departments WHERE id = $1 AND college_id = $2', [department_id, college_id]);
      if (deptCheck.rows.length === 0) return res.status(400).json({ error: 'Invalid department_id or department does not belong to college' });
    }

    const params = [semester, college_id];
    if (department_id) params.push(department_id);
    const [courses, faculty, rooms, timeSlots] = await Promise.all([
      pool.query(
        'SELECT COUNT(*) FROM Courses WHERE semester = $1 AND college_id = $2' + (department_id ? ' AND department_id = $3' : ''),
        params
      ),
      pool.query(
        'SELECT COUNT(*) FROM Faculty WHERE college_id = $1' + (department_id ? ' AND department_id = $2' : ''),
        department_id ? [college_id, department_id] : [college_id]
      ),
      pool.query('SELECT COUNT(*) FROM Rooms'),
      pool.query('SELECT COUNT(*) FROM Time_Slots')
    ]);
    if (courses.rows[0].count === '0' || faculty.rows[0].count === '0' || rooms.rows[0].count === '0' || timeSlots.rows[0].count === '0') {
      return res.status(400).json({ error: `Insufficient data for Semester ${semester}, College ${college_id}${department_id ? `, Department ${department_id}` : ''}` });
    }

    const job = await pool.query('INSERT INTO Timetable_Jobs (status) VALUES ($1) RETURNING id', ['running']);
    const jobId = job.rows[0].id;

    const payload = { jobId, semester, college_id, department_id };
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
    let params = [];
    if (req.user.role === 'admin') {
      const { college_id, department_id } = req.query;
      console.log('Timetable query params:', { college_id, department_id }); // Debug
      query = `
        SELECT ta.*, c.name AS course_name, f.name AS faculty_name, r.name AS room_name, ts.day, ts.start_time, ts.end_time
        FROM Timetable_Assignments ta
        JOIN Courses c ON ta.course_id = c.id
        JOIN Faculty f ON ta.faculty_id = f.id
        JOIN Rooms r ON ta.room_id = r.id
        JOIN Time_Slots ts ON ta.time_slot_id = ts.id
        WHERE 1=1
      `;
      let idx = 1;
      if (college_id) {
        query += ` AND ta.college_id = $${idx++}`;
        params.push(parseInt(college_id));
      }
      if (department_id) {
        query += ` AND ta.department_id = $${idx++}`;
        params.push(parseInt(department_id));
      }
    } else {
      const userTable = req.user.role === 'student' ? 'Students' : 'Faculty';
      const userRes = await pool.query(`SELECT id, college_id, department_id FROM ${userTable} WHERE email = $1`, [req.user.email]);
      if (userRes.rows.length === 0) return res.status(404).json({ error: 'User not found' });
      const user = userRes.rows[0];
      if (req.user.role === 'student') {
        query = `
          SELECT ta.*, c.name AS course_name, f.name AS faculty_name, r.name AS room_name, ts.day, ts.start_time, ts.end_time
          FROM Timetable_Assignments ta
          JOIN Courses c ON ta.course_id = c.id
          JOIN Faculty f ON ta.faculty_id = f.id
          JOIN Rooms r ON ta.room_id = r.id
          JOIN Time_Slots ts ON ta.time_slot_id = ts.id
          JOIN Enrollments e ON ta.course_id = e.course_id
          WHERE e.student_id = $1
        `;
        params = [user.id];
      } else {
        query = `
          SELECT ta.*, c.name AS course_name, f.name AS faculty_name, r.name AS room_name, ts.day, ts.start_time, ts.end_time
          FROM Timetable_Assignments ta
          JOIN Courses c ON ta.course_id = c.id
          JOIN Faculty f ON ta.faculty_id = f.id
          JOIN Rooms r ON ta.room_id = r.id
          JOIN Time_Slots ts ON ta.time_slot_id = ts.id
          WHERE ta.college_id = $1 AND ta.department_id = $2
        `;
        params = [user.college_id, user.department_id];
      }
    }
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Timetable error:', err.message, err.stack);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// Export PDF
app.get('/export/pdf', authenticate, async (req, res) => {
  try {
    const { college_id, department_id } = req.query;
    console.log('PDF export query params:', { college_id, department_id }); // Debug
    let query = `
      SELECT ta.*, c.name AS course_name, f.name AS faculty_name, r.name AS room_name, ts.day, ts.start_time, ts.end_time
      FROM Timetable_Assignments ta
      JOIN Courses c ON ta.course_id = c.id
      JOIN Faculty f ON ta.faculty_id = f.id
      JOIN Rooms r ON ta.room_id = r.id
      JOIN Time_Slots ts ON ta.time_slot_id = ts.id
      WHERE 1=1
    `;
    let params = [];
    let idx = 1;
    if (college_id) {
      query += ` AND ta.college_id = $${idx++}`;
      params.push(parseInt(college_id));
    }
    if (department_id) {
      query += ` AND ta.department_id = $${idx++}`;
      params.push(parseInt(department_id));
    }
    const timetable = await pool.query(query, params);
    const doc = new PDFDocument();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=timetable.pdf');
    doc.pipe(res);
    doc.fontSize(16).text(`Timetable - Semester ${timetable.rows.length ? timetable.rows[0].semester : 'Unknown'}`, { align: 'center' });
    timetable.rows.forEach(row => {
      doc.fontSize(12).text(`${row.day} ${row.start_time}-${row.end_time}: ${row.course_name} | ${row.faculty_name} | ${row.room_name}`);
    });
    doc.end();
  } catch (err) {
    console.error('PDF export error:', err.message, err.stack);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// Export Excel
app.get('/export/excel', authenticate, async (req, res) => {
  try {
    const { college_id, department_id } = req.query;
    console.log('Excel export query params:', { college_id, department_id }); // Debug
    let query = `
      SELECT ta.*, c.name AS course_name, f.name AS faculty_name, r.name AS room_name, ts.day, ts.start_time, ts.end_time
      FROM Timetable_Assignments ta
      JOIN Courses c ON ta.course_id = c.id
      JOIN Faculty f ON ta.faculty_id = f.id
      JOIN Rooms r ON ta.room_id = r.id
      JOIN Time_Slots ts ON ta.time_slot_id = ts.id
      WHERE 1=1
    `;
    let params = [];
    let idx = 1;
    if (college_id) {
      query += ` AND ta.college_id = $${idx++}`;
      params.push(parseInt(college_id));
    }
    if (department_id) {
      query += ` AND ta.department_id = $${idx++}`;
      params.push(parseInt(department_id));
    }
    const timetable = await pool.query(query, params);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Timetable');
    sheet.addRow(['Day', 'Time', 'Course', 'Faculty', 'Room']);
    timetable.rows.forEach(row => {
      sheet.addRow([row.day, `${row.start_time}-${row.end_time}`, row.course_name, row.faculty_name, row.room_name]);
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=timetable.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Excel export error:', err.message, err.stack);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// Export iCal
app.get('/export/ical', authenticate, async (req, res) => {
  try {
    const { college_id, department_id } = req.query;
    console.log('iCal export query params:', { college_id, department_id }); // Debug
    let query = `
      SELECT ta.*, c.name AS course_name, r.name AS room_name, ts.day, ts.start_time, ts.end_time
      FROM Timetable_Assignments ta
      JOIN Courses c ON ta.course_id = c.id
      JOIN Rooms r ON ta.room_id = r.id
      JOIN Time_Slots ts ON ta.time_slot_id = ts.id
      WHERE 1=1
    `;
    let params = [];
    let idx = 1;
    if (college_id) {
      query += ` AND ta.college_id = $${idx++}`;
      params.push(parseInt(college_id));
    }
    if (department_id) {
      query += ` AND ta.department_id = $${idx++}`;
      params.push(parseInt(department_id));
    }
    const timetable = await pool.query(query, params);
    const calendar = ical({ name: 'Timetable' });
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
    console.error('iCal export error:', err.message, err.stack);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// Manual Adjustment
app.put('/timetable/:id', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { course_id, faculty_id, room_id, time_slot_id, semester, college_id, department_id } = req.body;
    console.log('Timetable update payload:', req.body); // Debug
    if (!semester || isNaN(semester) || !college_id) return res.status(400).json({ error: 'Semester and college_id are required' });

    // Verify college_id
    const collegeCheck = await pool.query('SELECT 1 FROM Colleges WHERE id = $1', [college_id]);
    if (collegeCheck.rows.length === 0) return res.status(400).json({ error: 'Invalid college_id' });

    // Verify department_id (if provided)
    if (department_id) {
      const deptCheck = await pool.query('SELECT 1 FROM Departments WHERE id = $1 AND college_id = $2', [department_id, college_id]);
      if (deptCheck.rows.length === 0) return res.status(400).json({ error: 'Invalid department_id or department does not belong to college' });
    }

    const result = await pool.query(
      'UPDATE Timetable_Assignments SET course_id = $1, faculty_id = $2, room_id = $3, time_slot_id = $4, semester = $5, college_id = $6, department_id = $7 WHERE id = $8 RETURNING *',
      [course_id, faculty_id, room_id, time_slot_id, semester, college_id, department_id || null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Assignment not found' });
    await pool.query('INSERT INTO Audit_Logs (user_id, action) VALUES ($1, $2)', [null, `Update Timetable Assignment ${req.params.id}`]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Timetable update error:', err.message, err.stack);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// Get Colleges
app.get('/colleges', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM Colleges ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    console.error('Colleges error:', err.message, err.stack);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// Get Departments
app.get('/departments', async (req, res) => {
  try {
    const { college_id } = req.query;
    if (!college_id) return res.status(400).json({ error: 'college_id is required' });
    const result = await pool.query(
      'SELECT * FROM Departments WHERE college_id = $1 ORDER BY name',
      [parseInt(college_id)]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Departments error:', err.message, err.stack);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

app.listen(3001, () => console.log('Backend running on port 3001'));