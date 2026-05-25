# TL Tide BT Dashboard - Setup Instructions

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Application
```bash
npm start
```

The application will run on **http://localhost:3005**

## Prerequisites

- Node.js (v14 or higher)
- Existing Tide backend running on port 4000
- TL must have Tide BT access in `TideBT_Access` MongoDB collection

## Access Flow

1. Login to TL Tide dashboard (port 3000)
2. If you have Tide BT access, a popup will appear
3. Click "Tide BT" button
4. You'll be redirected to this dashboard (port 3005) with automatic login

## Features

- ✅ TL Profile display
- ✅ View FSEs under your Tide BT team
- ✅ Same UI as Tide TL dashboard
- 🚀 More features coming soon!

## Ports

- **3005**: TL Tide BT Frontend (this app)
- **4000**: Existing Tide Backend (authentication & profile)
- **4002**: Future Tide BT Backend (to be built)

## Troubleshooting

### "Cannot connect to backend"
- Make sure the backend is running on port 4000
- Check `.env` file has correct `REACT_APP_API_BASE`

### "No FSEs showing"
- Check `TideBT_Access` collection in MongoDB
- Verify FSEs are assigned to your TL name
- Check browser console for errors

### "Token expired"
- Login again from TL Tide dashboard
- Token is shared between Tide and Tide BT

## Development

- Edit files in `src/` folder
- Changes will hot-reload automatically
- Use same styling as TL dashboard (see `src/style.css`)
