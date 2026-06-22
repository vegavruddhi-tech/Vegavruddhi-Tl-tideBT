import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Profile from './pages/Profile';
import BTPaymentForm from './pages/BTPaymentForm';
import DailyVisitForm from './pages/DailyVisitForm';
import RewardPassForm from './pages/RewardPassForm';
import MobikwikWithdrawForm from './pages/MobikwikWithdrawForm';
import TeamMerchants from './pages/TeamMerchants';
import MyMerchants from './pages/MyMerchants';

function PrivateRoute({ children }) {
  return localStorage.getItem('token') ? children : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
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
