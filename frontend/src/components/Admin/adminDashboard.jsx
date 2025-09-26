import React, { useEffect, useState } from 'react';
import axios from 'axios';

function AdminDashboard() {
  const [events, setEvents] = useState([]);
  const [semester, setSemester] = useState('');
  const [collegeId, setCollegeId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [colleges, setColleges] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [courses, setCourses] = useState([]);
  const [faculty, setFaculty] = useState([]);
  const [facultyCourses, setFacultyCourses] = useState({});
  const [selectedCourses, setSelectedCourses] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const token = localStorage.getItem('token');

  // Fetch colleges on mount
  useEffect(() => {
    const fetchColleges = async () => {
      setIsLoading(true);
      try {
        const response = await axios.get('http://localhost:3001/colleges', {
          headers: { Authorization: `Bearer ${token}` },
        });
        setColleges(response.data);
        setError('');
      } catch (err) {
        console.error('Failed to fetch colleges:', err);
        setError('Failed to fetch colleges: ' + (err.response?.data?.error || 'Server error'));
      } finally {
        setIsLoading(false);
      }
    };
    fetchColleges();
  }, [token]);

  // Fetch departments when collegeId changes
  useEffect(() => {
    if (collegeId) {
      const fetchDepartments = async () => {
        setIsLoading(true);
        try {
          const response = await axios.get('http://localhost:3001/departments', {
            headers: { Authorization: `Bearer ${token}` },
            params: { college_id: collegeId },
          });
          setDepartments(response.data);
          setError('');
        } catch (err) {
          console.error('Failed to fetch departments:', err);
          setError('Failed to fetch departments: ' + (err.response?.data?.error || 'Server error'));
        } finally {
          setIsLoading(false);
        }
      };
      fetchDepartments();
    } else {
      setDepartments([]);
      setDepartmentId('');
    }
  }, [collegeId, token]);

  // Fetch timetable, courses, and faculty when collegeId or departmentId changes
  useEffect(() => {
    if (collegeId) {
      fetchTimetable();
      fetchCourses();
      fetchFaculty();
    } else {
      setEvents([]);
      setCourses([]);
      setFaculty([]);
      setFacultyCourses({});
    }
  }, [collegeId, departmentId, token]);

  const fetchTimetable = async () => {
    setIsLoading(true);
    try {
      const response = await axios.get('http://localhost:3001/timetable', {
        headers: { Authorization: `Bearer ${token}` },
        params: { college_id: collegeId, department_id: departmentId },
      });
      console.log('Timetable Response:', response.data);
      const weeklyData = Array(5).fill().map(() => []);
      response.data.forEach(row => {
        const dayIndex = { Monday: 0, Tuesday: 1, Wednesday: 2, Thursday: 3, Friday: 4 }[row.day];
        if (dayIndex !== undefined && row.start_time) {
          const timeHour = parseInt(row.start_time.split(':')[0]);
          if (timeHour >= 9 && timeHour <= 16) {
            weeklyData[dayIndex].push({
              time: row.start_time,
              course: row.course_name || 'N/A',
              room: row.room_name || 'N/A',
              faculty: row.faculty_name || 'N/A',
            });
          }
        }
      });
      setEvents(weeklyData);
      setError('');
    } catch (err) {
      console.error('Failed to fetch timetable:', err);
      setError('Failed to fetch timetable: ' + (err.response?.data?.error || 'Server error'));
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCourses = async () => {
    setIsLoading(true);
    try {
      const response = await axios.get('http://localhost:3001/courses', {
        headers: { Authorization: `Bearer ${token}` },
        params: { college_id: collegeId, department_id: departmentId },
      });
      setCourses(response.data);
      setError('');
    } catch (err) {
      console.error('Failed to fetch courses:', err);
      setError('Failed to fetch courses: ' + (err.response?.data?.error || 'Server error'));
    } finally {
      setIsLoading(false);
    }
  };

  const fetchFaculty = async () => {
    setIsLoading(true);
    try {
      const response = await axios.get('http://localhost:3001/faculty', {
        headers: { Authorization: `Bearer ${token}` },
        params: { college_id: collegeId, department_id: departmentId },
      });
      setFaculty(response.data);
      const coursesPromises = response.data.map(f =>
        axios.get(`http://localhost:3001/faculty_courses/${f.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then(r => ({ [f.id]: r.data }))
      );
      const coursesArr = await Promise.all(coursesPromises);
      setFacultyCourses(Object.assign({}, ...coursesArr));
      setError('');
    } catch (err) {
      console.error('Failed to fetch faculty:', err);
      setError('Failed to fetch faculty: ' + (err.response?.data?.error || 'Server error'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!semester || isNaN(semester) || !collegeId) {
      alert('Please enter a valid semester number and select a college');
      return;
    }
    setIsLoading(true);
    try {
      await axios.post('http://localhost:3001/generate-timetable', {
        semester: parseInt(semester),
        college_id: collegeId,
        department_id: departmentId,
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      alert(`Timetable generation started for Semester ${semester}, College ID ${collegeId}${departmentId ? `, Department ID ${departmentId}` : ''}. Refresh to see results.`);
      setTimeout(fetchTimetable, 2000);
      setError('');
    } catch (err) {
      console.error('Timetable generation failed:', err);
      setError('Timetable generation failed: ' + (err.response?.data?.error || 'Server error'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddCourse = async (e) => {
    e.preventDefault();
    const form = e.target;
    if (!semester || isNaN(semester) || !collegeId || !departmentId) {
      alert('Please enter a valid semester number, college, and department');
      return;
    }
    setIsLoading(true);
    try {
      await axios.post('http://localhost:3001/courses', {
        name: form.name.value,
        code: form.code.value,
        credits: parseInt(form.credits.value),
        is_elective: form.is_elective.checked,
        semester: parseInt(semester),
        college_id: collegeId,
        department_id: departmentId,
      }, { headers: { Authorization: `Bearer ${token}` } });
      alert('Course added successfully');
      form.reset();
      fetchCourses();
      setError('');
    } catch (err) {
      console.error('Failed to add course:', err);
      setError('Failed to add course: ' + (err.response?.data?.error || 'Server error'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddExpertise = async (faculty_id, course_id) => {
    if (!course_id) {
      alert('Please select a course to add expertise');
      return;
    }
    setIsLoading(true);
    try {
      await axios.post('http://localhost:3001/faculty_courses', { faculty_id, course_id }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      alert('Expertise added successfully');
      fetchFaculty();
      setError('');
    } catch (err) {
      console.error('Failed to add expertise:', err);
      setError('Failed to add expertise: ' + (err.response?.data?.error || 'Server error'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async (type) => {
    setIsLoading(true);
    try {
      const response = await fetch(`http://localhost:3001/export/${type}?college_id=${collegeId}&department_id=${departmentId}`, {
        headers: { Authorization: `Bearer ${token}` },
        method: 'GET',
      });
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `timetable.${type === 'pdf' ? 'pdf' : type === 'excel' ? 'xlsx' : 'ics'}`;
      a.click();
      window.URL.revokeObjectURL(url);
      setError('');
    } catch (err) {
      console.error(`Download failed (${type}):`, err);
      setError(`Download failed: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const timeSlots = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00'];

  return (
    <div className="admin-dashboard-container">
      <h2 className="dashboard-title">Admin Dashboard</h2>
      {isLoading && <p>Loading...</p>}
      {error && <p className="error-message">{error}</p>}
      <div className="controls-section">
        <div className="college-input">
          <label>College:</label>
          <select
            value={collegeId}
            onChange={(e) => setCollegeId(e.target.value)}
            required
          >
            <option value="">Select College</option>
            {colleges.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="department-input">
          <label>Department:</label>
          <select
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
          >
            <option value="">Select Department (optional)</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div className="semester-input">
          <label>Semester:</label>
          <input
            type="number"
            value={semester}
            onChange={(e) => setSemester(e.target.value)}
            placeholder="Enter Semester (e.g., 1)"
            required
          />
        </div>
        <button onClick={handleGenerate} className="generate-btn" disabled={isLoading}>
          Generate Timetable
        </button>
      </div>
      <div className="course-section">
        <h3 className="section-title">Add Course</h3>
        <form onSubmit={handleAddCourse} className="course-form">
          <input name="name" placeholder="Course Name" required />
          <input name="code" placeholder="Course Code" required />
          <input name="credits" type="number" placeholder="Credits" required />
          <label><input name="is_elective" type="checkbox" /> Elective</label>
          <button type="submit" className="add-course-btn" disabled={isLoading}>Add Course</button>
        </form>
      </div>
      <div className="faculty-section">
        <h3 className="section-title">Faculty Expertise</h3>
        {faculty.map(f => (
          <div key={f.id} className="faculty-item">
            <h4>{f.name} (ID: {f.id})</h4>
            <ul>
              {facultyCourses[f.id]?.map(c => (
                <li key={c.id}>{c.name}</li>
              ))}
            </ul>
            <select
              value={selectedCourses[f.id] || ''}
              onChange={e => setSelectedCourses({ ...selectedCourses, [f.id]: e.target.value })}
            >
              <option value="">Select course to add</option>
              {courses.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button onClick={() => handleAddExpertise(f.id, selectedCourses[f.id])} className="add-expertise-btn" disabled={isLoading}>
              Add Expertise
            </button>
          </div>
        ))}
      </div>
      <div className="timetable-wrapper">
        <table className="timetable-table">
          <thead>
            <tr>
              <th className="time-column">Time</th>
              {days.map((day, index) => (
                <th key={index} className="day-header">{day}<br />(Sep 22-26)</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {timeSlots.map((time, timeIndex) => (
              <tr key={timeIndex}>
                <td className="time-slot">{time}:00</td>
                {days.map((day, dayIndex) => (
                  <td key={dayIndex} className="schedule-cell">
                    {events[dayIndex]?.find(slot => slot.time.startsWith(time))?.course && (
                      <div className="schedule-event">
                        {events[dayIndex].find(slot => slot.time.startsWith(time)).course}<br />
                        <span className="faculty-info">{events[dayIndex].find(slot => slot.time.startsWith(time)).faculty}</span><br />
                        <span className="room-info">{events[dayIndex].find(slot => slot.time.startsWith(time)).room}</span>
                      </div>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="course-list">
        <h3 className="section-title">Added Courses</h3>
        <ul className="course-items">
          {courses.map((course, index) => (
            <li key={index} className="course-item">
              {course.name} (Code: {course.code}, Credits: {course.credits}, Elective: {course.is_elective ? 'Yes' : 'No'}, Semester: {course.semester})
            </li>
          ))}
        </ul>
      </div>
      <div className="download-buttons">
        <button onClick={() => handleDownload('pdf')} className="download-btn pdf-btn" disabled={isLoading}>
          Download PDF
        </button>
        <button onClick={() => handleDownload('excel')} className="download-btn excel-btn" disabled={isLoading}>
          Download Excel
        </button>
        <button onClick={() => handleDownload('ical')} className="download-btn ical-btn" disabled={isLoading}>
          Download iCal
        </button>
      </div>
      <style>
        {`
          body {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          .admin-dashboard-container {
            padding: 20px;
            min-height: 100vh;
            background-color: #1a202c;
            color: #e2e8f0;
            font-family: Arial, sans-serif;
          }
          .dashboard-title {
            font-size: 2.5rem;
            font-weight: bold;
            text-align: center;
            margin-bottom: 20px;
            color: #2dd4bf;
            text-shadow: 1px 1px 4px rgba(0, 0, 0, 0.6);
          }
          .error-message {
            color: #f56565;
            text-align: center;
            margin-bottom: 20px;
          }
          .controls-section {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
            flex-wrap: wrap;
          }
          .college-input, .department-input, .semester-input {
            flex: 1;
            min-width: 200px;
          }
          .college-input label, .department-input label, .semester-input label {
            margin-right: 10px;
            font-weight: 500;
          }
          .college-input select, .department-input select, .semester-input input {
            padding: 8px;
            border: 1px solid #4a5568;
            border-radius: 4px;
            background-color: #2d3748;
            color: #e2e8f0;
            width: 100%;
          }
          .generate-btn {
            padding: 8px 16px;
            background-color: #3b82f6;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            transition: background-color 0.3s ease;
          }
          .generate-btn:hover {
            background-color: #2563eb;
          }
          .generate-btn:disabled {
            background-color: #718096;
            cursor: not-allowed;
          }
          .course-section, .faculty-section {
            margin-bottom: 20px;
          }
          .section-title {
            font-size: 1.5rem;
            font-weight: bold;
            margin-bottom: 10px;
            color: #2dd4bf;
          }
          .course-form {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
          }
          .course-form input {
            padding: 8px;
            border: 1px solid #4a5568;
            border-radius: 4px;
            background-color: #2d3748;
            color: #e2e8f0;
            flex: 1;
            min-width: 200px;
          }
          .course-form label {
            margin-right: 10px;
          }
          .add-course-btn {
            padding: 8px 16px;
            background-color: #10b981;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            transition: background-color 0.3s ease;
          }
          .add-course-btn:hover {
            background-color: #059669;
          }
          .add-course-btn:disabled {
            background-color: #718096;
            cursor: not-allowed;
          }
          .faculty-item {
            background-color: #2d3748;
            padding: 10px;
            margin-bottom: 10px;
            border-radius: 4px;
          }
          .faculty-item h4 {
            margin-bottom: 5px;
          }
          .faculty-item ul {
            margin-bottom: 10px;
          }
          .faculty-item select {
            padding: 8px;
            margin-right: 10px;
            border: 1px solid #4a5568;
            border-radius: 4px;
            background-color: #2d3748;
            color: #e2e8f0;
          }
          .add-expertise-btn {
            padding: 8px 16px;
            background-color: #ecc94b;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
          }
          .add-expertise-btn:hover {
            background-color: #d69e2e;
          }
          .add-expertise-btn:disabled {
            background-color: #718096;
            cursor: not-allowed;
          }
          .timetable-wrapper {
            background-color: #2d3748;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 6px 12px rgba(0, 0, 0, 0.2);
            padding: 10px;
            margin-bottom: 20px;
          }
          .timetable-table {
            width: 100%;
            border-collapse: separate;
            border-spacing: 0;
            font-size: 0.95rem;
          }
          .timetable-table th {
            background-color: #4a5568;
            padding: 12px;
            text-align: center;
            border-bottom: 2px solid #4a5568;
            font-weight: 500;
          }
          .time-column {
            width: 80px;
            background-color: #4a5568;
            position: sticky;
            left: 0;
            z-index: 1;
          }
          .day-header {
            min-width: 150px;
          }
          .timetable-table td {
            padding: 8px;
            text-align: center;
            border: 1px solid #4a5568;
            vertical-align: middle;
          }
          .time-slot {
            font-weight: 500;
            background-color: #4a5568;
            color: #e2e8f0;
          }
          .schedule-cell {
            min-height: 60px;
            position: relative;
          }
          .schedule-event {
            background-color: #81e6d9;
            color: #1a202c;
            border-radius: 6px;
            padding: 4px 8px;
            font-size: 0.9rem;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            margin: 2px 0;
          }
          .faculty-info {
            font-size: 0.8rem;
            color: #2d3748;
          }
          .room-info {
            font-size: 0.8rem;
            color: #2d3748;
          }
          .course-list {
            margin-bottom: 20px;
          }
          .course-items {
            list-style: none;
            padding: 0;
          }
          .course-item {
            background-color: #2d3748;
            padding: 10px;
            margin-bottom: 5px;
            border-radius: 4px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          }
          .download-buttons {
            margin-top: 20px;
            text-align: center;
          }
          .download-btn {
            padding: 10px 20px;
            text-decoration: none;
            border-radius: 6px;
            margin: 0 10px;
            font-size: 1rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.3s ease;
            border: none;
          }
          .download-btn:disabled {
            background-color: #718096;
            cursor: not-allowed;
          }
          .pdf-btn {
            background-color: #48bb78;
            color: white;
          }
          .pdf-btn:hover:not(:disabled) {
            background-color: #38a169;
            transform: translateY(-2px);
          }
          .excel-btn {
            background-color: #f6ad55;
            color: white;
          }
          .excel-btn:hover:not(:disabled) {
            background-color: #ed8936;
            transform: translateY(-2px);
          }
          .ical-btn {
            background-color: #9f7aea;
            color: white;
          }
          .ical-btn:hover:not(:disabled) {
            background-color: #7e5cef;
            transform: translateY(-2px);
          }
        `}
      </style>
    </div>
  );
}

export default AdminDashboard;