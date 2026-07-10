const jwt      = require('jsonwebtoken');
const mongoose = require('mongoose');

function verifyToken(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token provided' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Block admin-impersonation tokens — not real TL sessions
    if (!decoded.id || !mongoose.Types.ObjectId.isValid(decoded.id)) {
      return res.status(403).json({ message: 'Admin view-as mode is not supported on this panel.' });
    }
    req.user = { id: decoded.id, email: decoded.email };
    next();
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }
}

module.exports = verifyToken;
