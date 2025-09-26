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
        semester = data.get('semester')
        college_id = data.get('college_id')
        department_id = data.get('department_id')
        if not job_id or not semester or not college_id:
            logger.error("Missing jobId, semester, or college_id in request")
            return jsonify({'status': 'failed', 'error': 'Missing jobId, semester, or college_id'}), 400

        conn = get_db_connection()
        cur = conn.cursor()

        # Fetch courses
        courses_query = 'SELECT id, credits FROM Courses WHERE semester = %s AND college_id = %s'
        courses_params = [semester, college_id]
        if department_id:
            courses_query += ' AND department_id = %s'
            courses_params.append(department_id)
        cur.execute(courses_query, courses_params)
        courses = cur.fetchall()

        # Fetch faculty
        faculty_query = 'SELECT id, max_load FROM Faculty WHERE college_id = %s'
        faculty_params = [college_id]
        if department_id:
            faculty_query += ' AND department_id = %s'
            faculty_params.append(department_id)
        cur.execute(faculty_query, faculty_params)
        faculty = cur.fetchall()

        # Fetch rooms (global)
        cur.execute('SELECT id FROM Rooms')
        rooms = cur.fetchall()

        # Fetch time slots (global)
        cur.execute('SELECT id FROM Time_Slots')
        time_slots = cur.fetchall()

        # Fetch faculty_courses
        cur.execute('SELECT faculty_id, course_id FROM Faculty_Courses')
        faculty_courses = cur.fetchall()

        logger.info(f"Data for Semester {semester}, College {college_id}{', Department ' + str(department_id) if department_id else ''} - Courses: {len(courses)}, Faculty: {len(faculty)}, Rooms: {len(rooms)}, Time Slots: {len(time_slots)}")
        if not (courses and faculty and rooms and time_slots):
            logger.error("Insufficient data for scheduling")
            return jsonify({'status': 'failed', 'error': 'Insufficient data for scheduling'}), 400

        # Filter faculty_courses
        faculty_ids = {f[0] for f in faculty}
        course_ids = {c[0] for c in courses}
        faculty_courses = [(fc[0], fc[1]) for fc in faculty_courses if fc[0] in faculty_ids and fc[1] in course_ids]

        model = cp_model.CpModel()
        assignments = {}
        fc_set = set(faculty_courses)
        faculty_for_course = {}
        for c in courses:
            c_id = c[0]
            faculty_for_course[c_id] = [f[0] for f in faculty if (f[0], c_id) in fc_set]
            if not faculty_for_course[c_id]:
                logger.error(f"No faculty for course {c_id}")
                return jsonify({'status': 'failed', 'error': 'No faculty assigned to some courses'}), 400
            for f_id in faculty_for_course[c_id]:
                for r in rooms:
                    for t in time_slots:
                        assignments[(c_id, f_id, r[0], t[0])] = model.NewBoolVar(f'c{c_id}_f{f_id}_r{r[0]}_t{t[0]}')

        # Hard constraints
        for c in courses:
            model.Add(sum(assignments[key] for key in assignments if key[0] == c[0]) == 1)

        for r in rooms:
            for t in time_slots:
                model.Add(sum(assignments[key] for key in assignments if key[2] == r[0] and key[3] == t[0]) <= 1)

        for f in faculty:
            for t in time_slots:
                model.Add(sum(assignments[key] for key in assignments if key[1] == f[0] and key[3] == t[0]) <= 1)

        for f in faculty:
            model.Add(sum(assignments[key] * next(c[1] for c in courses if c[0] == key[0]) for key in assignments if key[1] == f[0]) <= f[1])

        logger.info("Starting CP-SAT solver")
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = 120.0
        status = solver.Solve(model)

        if status == cp_model.OPTIMAL or status == cp_model.FEASIBLE:
            logger.info(f"Solver found solution with status: {status}")
            delete_query = 'DELETE FROM Timetable_Assignments WHERE semester = %s AND college_id = %s'
            delete_params = [semester, college_id]
            if department_id:
                delete_query += ' AND department_id = %s'
                delete_params.append(department_id)
            cur.execute(delete_query, delete_params)
            for key, var in assignments.items():
                if solver.Value(var):
                    insert_query = 'INSERT INTO Timetable_Assignments (course_id, faculty_id, room_id, time_slot_id, semester, college_id'
                    insert_params = list(key) + [semester, college_id]
                    if department_id:
                        insert_query += ', department_id'
                        insert_params.append(department_id)
                    insert_query += ') VALUES (%s, %s, %s, %s, %s, %s' + (', %s' if department_id else '') + ')'
                    cur.execute(insert_query, insert_params)
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