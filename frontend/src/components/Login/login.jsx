import React, { useState } from 'react';
import axios from 'axios';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async () => {
    try {
      const response = await axios.post('http://localhost:3001/login', { email, password });
      localStorage.setItem('token', response.data.token);
      window.location.href = response.data.role === 'admin' ? '/admin' : response.data.role === 'faculty' ? '/faculty' : '/student';
    } catch (err) {
      alert('Login failed: ' + (err.response?.data?.error || 'Server error'));
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h2 className="login-title">Login</h2>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="login-input"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="login-input"
        />
        <button onClick={handleLogin} className="login-button">Login</button>
        <p className="signup-link">
          Don't have an account? <a href="/signup" className="signup-link-text">Sign up</a>
        </p>
      </div>
      <style>
        {`
          body{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          .login-container {
            min-height: 100vh;
            background-color: #1a202c;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
            font-family: Arial, sans-serif;
          }

          .login-card {
            background-color: #2d3748;
            padding: 30px;
            border-radius: 12px;
            box-shadow: 0 6px 12px rgba(0, 0, 0, 0.3);
            width: 100%;
            max-width: 400px;
            text-align: center;
          }

          .login-title {
            font-size: 2rem;
            font-weight: bold;
            color: #2dd4bf;
            margin-bottom: 20px;
            text-shadow: 1px 1px 4px rgba(0, 0, 0, 0.6);
          }

          .login-input {
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

          .login-input:focus {
            border-color: #2dd4bf;
            box-shadow: 0 0 5px rgba(45, 212, 191, 0.5);
            outline: none;
          }

          .login-button {
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

          .login-button:hover {
            background-color: #2563eb;
            transform: translateY(-2px);
          }

          .signup-link {
            font-size: 0.9rem;
            color: #a0aec0;
            margin-top: 10px;
          }

          .signup-link-text {
            color: #3b82f6;
            text-decoration: none;
            transition: color 0.3s ease;
          }

          .signup-link-text:hover {
            color: #2563eb;
          }
        `}
      </style>
    </div>
  );
}

export default Login;