from flask import Flask, request, jsonify
from ortools.sat.python import cp_model
import psycopg2
from dotenv import load_dotenv
import os
import logging

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

load_dotenv()
app = Flask(__name__)

def get_db_connection():
    try:
        return psycopg2.connect(os.getenv('DB_CONNECTION_STRING', 'postgresql://postgres:123456789@localhost:5432/timetable_generator'))
    except psycopg2.Error as e:
        logger.error(f"Database connection failed: {str(e)}")
        raise

@app.route('/solve', methods=['POST'])
def solve():
    try:
        data = request.get_json()
        job_id = data.get('jobId')
        semester = data.get('semester')  # No default; must be provided
        if not job_id or not semester:
            logger.error("Missing jobId or semester in request")
            return jsonify({'status': 'failed', 'error': 'Missing jobId or semester'}), 400

        conn = get_db_connection()
        cur = conn.cursor()

        # Fetch data for the specified semester
        cur.execute('SELECT id, credits FROM Courses WHERE semester = %s', (semester,))
        courses = cur.fetchall()
        cur.execute('SELECT id, max_load FROM Faculty')
        faculty = cur.fetchall()
        cur.execute('SELECT id FROM Rooms')
        rooms = cur.fetchall()
        cur.execute('SELECT id FROM Time_Slots')
        time_slots = cur.fetchall()
        cur.execute('SELECT faculty_id, course_id FROM Faculty_Courses')
        faculty_courses = cur.fetchall()

        logger.info(f"Data for Semester {semester} - Courses: {len(courses)}, Faculty: {len(faculty)}, Rooms: {len(rooms)}, Time Slots: {len(time_slots)}")
        if not (courses and faculty and rooms and time_slots):
            logger.error("Insufficient data for scheduling")
            return jsonify({'status': 'failed', 'error': 'Insufficient data for scheduling'}), 400

        model = cp_model.CpModel()
        assignments = {}
        # Relaxed constraint: Allow all faculty to teach all courses
        for c in courses:
            for f in faculty:
                for r in rooms:
                    for t in time_slots:
                        assignments[(c[0], f[0], r[0], t[0])] = model.NewBoolVar(f'c{c[0]}_f{f[0]}_r{r[0]}_t{t[0]}')

        if not assignments:
            logger.error("No valid assignments possible")
            return jsonify({'status': 'failed', 'error': 'No valid assignments possible'}), 400

        # Hard constraints
        for c in courses:
            model.Add(sum(assignments[(c[0], f[0], r[0], t[0])] for f in faculty for r in rooms for t in time_slots) == 1)

        for r in rooms:
            for t in time_slots:
                model.Add(sum(assignments[(c[0], f[0], r[0], t[0])] for c in courses for f in faculty) <= 1)

        for f in faculty:
            for t in time_slots:
                model.Add(sum(assignments[(c[0], f[0], r[0], t[0])] for c in courses for r in rooms) <= 1)

        for f in faculty:
            model.Add(sum(assignments[(c[0], f[0], r[0], t[0])] * c[1] for c in courses for r in rooms for t in time_slots) <= f[1])

        logger.info("Starting CP-SAT solver")
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = 120.0
        status = solver.Solve(model)

        if status == cp_model.OPTIMAL or status == cp_model.FEASIBLE:
            logger.info(f"Solver found solution with status: {status}")
            cur.execute('DELETE FROM Timetable_Assignments WHERE semester = %s', (semester,))
            for (c_id, f_id, r_id, t_id), var in assignments.items():
                if solver.Value(var):
                    cur.execute(
                        'INSERT INTO Timetable_Assignments (course_id, faculty_id, room_id, time_slot_id, semester) VALUES (%s, %s, %s, %s, %s)',
                        (c_id, f_id, r_id, t_id, semester)
                    )
            conn.commit()
            cur.close()
            conn.close()
            return jsonify({'status': 'success', 'jobId': job_id})
        else:
            logger.error(f"Solver failed with status: {status}")
            cur.close()
            conn.close()
            return jsonify({'status': 'failed', 'error': f'No solution found, status: {status}'}), 500

    except psycopg2.Error as e:
        logger.error(f"Database error: {str(e)}")
        cur.close()
        conn.close()
        return jsonify({'status': 'failed', 'error': f'Database error: {str(e)}'}), 500
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}", exc_info=True)
        cur.close()
        conn.close()
        return jsonify({'status': 'failed', 'error': f'Unexpected error: {str(e)}'}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)