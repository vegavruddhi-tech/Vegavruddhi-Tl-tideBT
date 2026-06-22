const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
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

// Only listen when running locally, not on Vercel
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 TL TideBT Backend running on port ${PORT}`);
  });
}

module.exports = app;
