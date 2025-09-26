import React, { useState, useEffect } from 'react';
import axios from 'axios';

function AdminSignup() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [adminKey, setAdminKey] = useState('');
  const [collegeId, setCollegeId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [colleges, setColleges] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Fetch colleges on load
  useEffect(() => {
    axios
      .get('http://localhost:3001/colleges')
      .then((res) => {
        setColleges(res.data);
        if (res.data.length === 0) {
          setError('No colleges available. Please contact support.');
        }
      })
      .catch((err) => {
        console.error('Failed to fetch colleges:', err.response?.data?.error || err.message);
        setError('Failed to load colleges. Please try again.');
      });
  }, []);

  // Fetch departments when college changes
  useEffect(() => {
    if (collegeId) {
      axios
        .get('http://localhost:3001/departments', { params: { college_id: collegeId } })
        .then((res) => {
          setDepartments(res.data);
          if (res.data.length === 0) {
            console.warn('No departments found for college_id:', collegeId);
          }
        })
        .catch((err) => {
          console.error('Failed to fetch departments:', err.response?.data?.error || err.message);
          setError('Failed to load departments. Please try again.');
        });
    } else {
      setDepartments([]);
      setDepartmentId('');
    }
  }, [collegeId]);

  const handleSignup = async () => {
    // Clear previous errors
    setError('');
    setIsLoading(true);

    // Client-side validation
    if (!name || !email || !password || !adminKey || !collegeId) {
      setError('Please fill in all required fields: Name, Email, Password, Admin Key, and College.');
      setIsLoading(false);
      return;
    }
    if (adminKey !== 'adminUnlock123') {
      setError('Invalid admin key.');
      setIsLoading(false);
      return;
    }

    const payload = {
      name,
      email,
      password,
      adminKey,
      college_id: parseInt(collegeId), // Ensure integer
      department_id: departmentId ? parseInt(departmentId) : null,
    };
    console.log('Sending admin-signup payload:', payload); // Debug payload

    try {
      const response = await axios.post('http://localhost:3001/admin-signup', payload);
      localStorage.setItem('token', response.data.token);
      setIsLoading(false);
      window.location.href = '/admin';
    } catch (err) {
      console.error('Signup error:', err.response?.data || err.message);
      setError('Signup failed: ' + (err.response?.data?.error || 'Server error'));
      setIsLoading(false);
    }
  };

  return (
    <div className="signup-container">
      <div className="signup-card">
        <h2 className="signup-title">Admin Sign Up</h2>
        {error && <p className="error-message">{error}</p>}
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          className="signup-input"
          disabled={isLoading}
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="signup-input"
          disabled={isLoading}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="signup-input"
          disabled={isLoading}
        />
        <select
          value={collegeId}
          onChange={(e) => setCollegeId(e.target.value)}
          className="signup-input"
          disabled={isLoading}
          required
        >
          <option value="">Select College</option>
          {colleges.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
          className="signup-input"
          disabled={isLoading}
        >
          <option value="">Select Department (optional)</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <input
          type="password"
          value={adminKey}
          onChange={(e) => setAdminKey(e.target.value)}
          placeholder="Admin Key"
          className="signup-input"
          disabled={isLoading}
        />
        <button
          onClick={handleSignup}
          className="signup-button"
          disabled={isLoading}
        >
          {isLoading ? 'Signing Up...' : 'Sign Up as Admin'}
        </button>
        <p className="login-link">
          Already have an account?{' '}
          <a href="/login" className="login-link-text">
            Log in
          </a>
        </p>
      </div>
      <style>
        {`
          body {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          .signup-container {
            min-height: 100vh;
            background-color: #1a202c;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
            font-family: Arial, sans-serif;
          }
          .signup-card {
            background-color: #2d3748;
            padding: 30px;
            border-radius: 12px;
            box-shadow: 0 6px 12px rgba(0, 0, 0, 0.3);
            width: 100%;
            max-width: 400px;
            text-align: center;
          }
          .signup-title {
            font-size: 2rem;
            font-weight: bold;
            color: #2dd4bf;
            margin-bottom: 20px;
            text-shadow: 1px 1px 4px rgba(0, 0, 0, 0.6);
          }
          .signup-input {
            width: 100%;
            padding: 10px;
            margin-bottom: 15px;
            border: 1px solid #4a5568;
            border-radius: 6px;
            background-color: #1a202c;
            color: #e2e8f0;
            font-size: 1rem;
            transition: border-color 0.3s ease, box-shadow 0.3s ease;
          }
          .signup-input:focus {
            border-color: #2dd4bf;
            box-shadow: 0 0 5px rgba(45, 212, 191, 0.5);
            outline: none;
          }
          .signup-input:disabled {
            background-color: #2d3748;
            cursor: not-allowed;
            opacity: 0.6;
          }
          .signup-button {
            width: 100%;
            padding: 12px;
            background-color: #3b82f6;
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 1rem;
            font-weight: 500;
            cursor: pointer;
            transition: background-color 0.3s ease, transform 0.2s ease;
          }
          .signup-button:hover:not(:disabled) {
            background-color: #2563eb;
            transform: translateY(-2px);
          }
          .signup-button:disabled {
            background-color: #4a5568;
            cursor: not-allowed;
          }
          .login-link {
            font-size: 0.9rem;
            color: #a0aec0;
            margin-top: 10px;
          }
          .login-link-text {
            color: #3b82f6;
            text-decoration: none;
            transition: color 0.3s ease;
          }
          .login-link-text:hover {
            color: #2563eb;
          }
          .error-message {
            color: #f56565;
            font-size: 0.9rem;
            margin-bottom: 15px;
            text-align: left;
          }
        `}
      </style>
    </div>
  );
}

export default AdminSignup;
