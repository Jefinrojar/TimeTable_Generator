import React, { useEffect, useState } from 'react';
import axios from 'axios';

function StudentView() {
  const [timetable, setTimetable] = useState([]);
  const token = localStorage.getItem('token');

  useEffect(() => {
    const fetchTimetable = async () => {
      try {
        const response = await axios.get('http://localhost:3001/timetable', {
          headers: { Authorization: `Bearer ${token}` },
        });
        console.log('Timetable Response:', response.data); // Debug output
        // Map backend data to a structure for the table
        const weeklyData = Array(5).fill().map(() => []); // Initialize 5 days (Mon-Fri)
        response.data.forEach(row => {
          const dayIndex = { Monday: 0, Tuesday: 1, Wednesday: 2, Thursday: 3, Friday: 4 }[row.day];
          if (dayIndex !== undefined && row.start_time) {
            const timeHour = parseInt(row.start_time.split(':')[0]);
            if (timeHour >= 9 && timeHour <= 16) { // Match time slots 09:00-16:00
              weeklyData[dayIndex].push({
                time: row.start_time,
                course: row.course_name || 'N/A',
                room: row.room_name || 'N/A',
              });
            }
          }
        });
        setTimetable(weeklyData);
      } catch (err) {
        alert('Failed to fetch timetable: ' + (err.response?.data?.error || 'Server error'));
      }
    };
    fetchTimetable();
  }, []);

  const handleDownload = async (type) => {
    try {
      const response = await fetch(`http://localhost:3001/export/${type}`, {
        headers: { Authorization: `Bearer ${token}` },
        method: 'GET',
      });
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `timetable.${type === 'pdf' ? 'pdf' : 'ics'}`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Download failed: ${err.message}`);
    }
  };

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const timeSlots = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00'];

  return (
    <div className="student-timetable-container">
      <h2 className="timetable-title">Student Timetable</h2>
      <p className="timetable-subtitle">Weekly Schedule for Semester (Repeating)</p>
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
                    {timetable[dayIndex]?.find(slot => slot.time.startsWith(time))?.course && (
                      <div className="schedule-event">
                        {timetable[dayIndex].find(slot => slot.time.startsWith(time)).course}<br />
                        <span className="room-info">{timetable[dayIndex].find(slot => slot.time.startsWith(time)).room}</span>
                      </div>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="download-buttons">
        <button onClick={() => handleDownload('pdf')} className="download-btn pdf-btn">
          Download PDF
        </button>
        <button onClick={() => handleDownload('ical')} className="download-btn ical-btn">
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
          .student-timetable-container {
            padding: 20px;
            min-height: 100vh;
            background-color: #1a202c;
            color: #e2e8f0;
            font-family: Arial, sans-serif;
          }

          .timetable-title {
            font-size: 2.5rem;
            font-weight: bold;
            text-align: center;
            margin-bottom: 10px;
            color: #2dd4bf;
            text-shadow: 1px 1px 4px rgba(0, 0, 0, 0.6);
          }

          .timetable-subtitle {
            text-align: center;
            margin-bottom: 20px;
            color: #a0aec0;
            font-size: 1rem;
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

          .room-info {
            font-size: 0.8rem;
            color: #2d3748;
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

          .pdf-btn {
            background-color: #48bb78;
            color: white;
          }

          .pdf-btn:hover {
            background-color: #38a169;
            transform: translateY(-2px);
          }

          .ical-btn {
            background-color: #9f7aea;
            color: white;
          }

          .ical-btn:hover {
            background-color: #7e5cef;
            transform: translateY(-2px);
          }
        `}
      </style>
    </div>
  );
}

export default StudentView;