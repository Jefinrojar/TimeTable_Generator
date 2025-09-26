import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login/login.jsx';
import Signup from './components/Signup/signup.jsx';
import AdminSignup from './components/Admin/adminSignup.jsx';
import AdminDashboard from './components/Admin/adminDashboard.jsx';
import FacultyView from './components/Faculty/FacultyView.jsx';
import StudentView from './components/Student/StudentView.jsx';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/admin-signup" element={<AdminSignup />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/faculty" element={<FacultyView />} />
        <Route path="/student" element={<StudentView />} />
        <Route path="/" element={<Navigate to="/login" />} />
      </Routes>
    </Router>
  );
}












export default App;