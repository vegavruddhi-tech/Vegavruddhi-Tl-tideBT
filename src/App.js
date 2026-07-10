import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Profile from './pages/Profile';
import BTPaymentForm from './pages/BTPaymentForm';
import DailyVisitForm from './pages/DailyVisitForm';
import RewardPassForm from './pages/RewardPassForm';
import MobikwikWithdrawForm from './pages/MobikwikWithdrawForm';
import TeamMerchants from './pages/TeamMerchants';
import MyMerchants from './pages/MyMerchants';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:4002';

function PrivateRoute({ children }) {
  return localStorage.getItem('token') ? children : <Navigate to="/" replace />;
}

function AutoLogoutHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    const checkAutoLogout = () => {
      const now = new Date();
      const istTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      const hours   = istTime.getHours();
      const minutes = istTime.getMinutes();

      // Trigger at 11:59 PM IST — same as normal TL panel
      if (hours === 23 && minutes === 59) {
        console.log('🕐 11:59 PM IST - TL TideBT Auto logout triggered');
        handleAutoLogout();
      }
    };

    const handleAutoLogout = async () => {
      const token = localStorage.getItem('token');
      if (!token) return;

      try {
        await fetch(`${API_BASE}/api/tl/auto-logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
      } catch (error) {
        console.error('Auto logout error:', error);
      }

      localStorage.removeItem('token');
      localStorage.clear();

      alert('Your session has ended at 11:59 PM. Please login again tomorrow.');

      // Redirect to main TL dashboard (not TideBT login)
      window.location.href = 'https://team-leader-gamma.vercel.app/';
    };

    // Check every 30 seconds
    const interval = setInterval(checkAutoLogout, 30000);
    checkAutoLogout();
    return () => clearInterval(interval);
  }, [navigate]);

  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <AutoLogoutHandler />
      <Routes>
        <Route path="/"          element={<Login />} />
        <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
        <Route path="/daily-visit" element={<PrivateRoute><DailyVisitForm /></PrivateRoute>} />
        <Route path="/reward-pass" element={<PrivateRoute><RewardPassForm /></PrivateRoute>} />
        <Route path="/mobikwik-withdraw" element={<PrivateRoute><MobikwikWithdrawForm /></PrivateRoute>} />
        <Route path="/bt-payment" element={<PrivateRoute><BTPaymentForm /></PrivateRoute>} />
        <Route path="/profile"   element={<PrivateRoute><Profile /></PrivateRoute>} />
        <Route path="/team-merchants" element={<PrivateRoute><TeamMerchants /></PrivateRoute>} />
        <Route path="/my-merchants"   element={<PrivateRoute><MyMerchants /></PrivateRoute>} />
        <Route path="*"          element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
