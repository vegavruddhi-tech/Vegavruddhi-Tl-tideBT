const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    // Allow all vercel.app domains and localhost
    if (
      origin.endsWith('.vercel.app') ||
      origin.startsWith('http://localhost')
    ) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connected - TL TideBT'))
  .catch(err => console.error('❌ MongoDB connection error:', err.message));

// Routes
const tlRoutes = require('./routes/tl');
app.use('/api/tl', tlRoutes);

// Health check
app.get('/', (req, res) => {
  res.json({ message: 'TL TideBT Backend is running', port: process.env.PORT });
});

const PORT = process.env.PORT || 4002;
app.listen(PORT, () => {
  console.log(`🚀 TL TideBT Backend running on port ${PORT}`);
});
