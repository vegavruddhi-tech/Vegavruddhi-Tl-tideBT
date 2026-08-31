# 👔 Vegavruddhi TL (Team Leader) Tide BT Panel

Operational management portal for **Team Leaders (TLs)** overseeing Field Sales Executives (FSEs) conducting Tide Balance Transfer operations.

---

## 📐 Architecture & Port Mapping

```
Vegavruddhi-Tl-tideBT/
├── backend/          # Node.js + Express Backend Services (Port 4000 / 4002)
└── src/              # React 19 Frontend Web Application (Port 3005)
```

| Service | Technology | Port | Base URL |
| :--- | :--- | :--- | :--- |
| **Frontend** | React 19, MUI v9, React Router v6 | `3005` | `http://localhost:3005` |
| **Backend API** | Express, Mongoose, Google Auth Library, Redis | `4000` / `4002` | `http://localhost:4000` |

---

## ✨ Key Features

- 👤 **TL Profile & Hierarchy**: Manage team structure, inspect assigned FSE list, and review individual agent targets.
- 📋 **Daily Visit & Form Tracking**: Review merchant visit submissions, onboarding status, and Mobikwik withdrawal requests.
- 💰 **Opening Balance Synchronization**: Automated scripts (`sync_opening_balances.js`) for daily financial reconciliation.
- 📈 **Performance Monitoring**: Real-time team output dashboards, target tracking, and activity verification.
- 🔐 **Authentication**: Multi-tier authentication with JWT security and Google Auth integration.

---

## 🛠️ Tech Stack & Dependencies

- **Frontend**: React 19, `@mui/material` v9, `@emotion/react`, `react-router-dom` v6
- **Backend**: Express.js 4, Mongoose 7, `google-auth-library`, `ioredis`, `jsonwebtoken`, `bcryptjs`

---

## 🚀 Quick Start Guide

### Prerequisites
- Node.js (v18.x or higher)
- MongoDB instance running locally or via cloud string

### 1. Backend Setup
```bash
cd backend
npm install
npm start     # Runs backend on http://localhost:4000
```

### 2. Frontend Setup
```bash
npm install
npm start     # Runs frontend on http://localhost:3005
```

---

## 📄 License
Internal Proprietary Software – Vegavruddhi Technologies.
