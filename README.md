# 👔 Vegavruddhi TL (Team Leader) Tide BT Panel

Operational management portal for **Team Leaders (TLs)** overseeing Field Sales Executives (FSEs) conducting Tide Balance Transfer operations.

---

## 📑 Table of Contents
- [👤 User Role & Access Level](#-user-role--access-level)
- [📐 Architecture & Port Mapping](#-architecture--port-mapping)
- [✨ Features & Functionalities](#-features--functionalities)
- [🛠️ Tech Stack & Dependencies](#-tech-stack--dependencies)
- [🚀 Quick Start Guide](#-quick-start-guide)

---

## 👤 User Role & Access Level

- **Target User**: Team Leaders, Field Operations Supervisors, and Area Sales Managers.
- **Access Scope**: Team-level read/verify permissions. Supervise assigned FSEs, inspect merchant form submissions, audit visit logs, and reconcile daily float balances.

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

## ✨ Features & Functionalities

### 1. 👤 Team Roster & FSE Performance Tracking
- View full list of assigned FSE team members with real-time target progression status.
- Monitor active vs. inactive field agents, daily form submission counts, and target completion percentages.

### 2. 📋 Merchant Application Audit & Approvals
- Review merchant onboarding forms submitted by team FSEs prior to admin escalation.
- Inspect uploaded verification documents (PAN card, Aadhaar, bank proof, QR codes).
- First-level approval or rejection with feedback notes for FSE remediation.

### 3. 📍 Daily Visit & Geolocation Verification
- Audit daily site visit logs submitted by FSEs.
- Verify timestamped GPS coordinates and merchant check-in details.

### 4. 💰 Opening Balance Synchronization
- Automated balance reconciliation script (`sync_opening_balances.js`) for tracking daily agent float balances.
- Reconciles opening balance vs. closing balance vs. completed merchant balance transfer applications.

### 5. 💳 Mobikwik Withdrawal Verification
- Initial approval queue for Mobikwik wallet withdrawal requests submitted by FSEs on behalf of merchants.

---

## 🛠️ Tech Stack & Dependencies

- **Frontend**: React 19, `@mui/material` v9, `@emotion/react`, `react-router-dom` v6
- **Backend**: Express.js 4, Mongoose 7, `google-auth-library`, `ioredis`, `jsonwebtoken`, `bcryptjs`

---

## 🚀 Quick Start Guide

### Prerequisites
- Node.js (v18.x or higher)
- MongoDB instance running locally or via cloud connection string

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
Internal Proprietary Software – Vegavruddhi Technologies. All Rights Reserved.
