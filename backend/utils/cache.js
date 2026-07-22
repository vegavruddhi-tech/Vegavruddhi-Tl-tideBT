/**
 * cache.js — MongoDB-backed permanent cache (invalidate-on-write)
 * Uses mongoose.connection.db — works in both standalone and Vercel serverless.
 */
const mongoose = require('mongoose');
const CACHE_COLLECTION = 'TideBT_SummaryCache';

function getDb() {
  return mongoose.connection.readyState === 1 ? mongoose.connection.db : null;
}

async function cacheGet(key) {
  try {
    const db = getDb(); if (!db) return null;
    const doc = await db.collection(CACHE_COLLECTION).findOne({ cacheKey: key });
    if (!doc) return null;
    // Expire cache after 30 minutes so fresh BT data shows after sync
    const AGE_MS = 30 * 60 * 1000;
    if (doc.updatedAt && (Date.now() - new Date(doc.updatedAt).getTime()) > AGE_MS) {
      console.log(`⏰ [Cache EXPIRED] ${key}`);
      await db.collection(CACHE_COLLECTION).deleteOne({ cacheKey: key });
      return null;
    }
    console.log(`⚡ [Cache HIT] ${key}`);
    return doc.data;
  } catch { return null; }
}

async function cacheSet(key, value) {
  try {
    const db = getDb(); if (!db) return;
    await db.collection(CACHE_COLLECTION).updateOne(
      { cacheKey: key },
      { $set: { cacheKey: key, data: value, updatedAt: new Date() } },
      { upsert: true }
    );
    console.log(`💾 [Cache] Written: ${key}`);
  } catch (e) { console.warn(`⚠️ [Cache] Write failed: ${e.message}`); }
}

async function cacheInvalidatePattern(pattern) {
  try {
    const db = getDb(); if (!db) return;
    let result;
    if (!pattern || pattern === '*') {
      result = await db.collection(CACHE_COLLECTION).deleteMany({});
    } else {
      const regex = '^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$';
      result = await db.collection(CACHE_COLLECTION).deleteMany({ cacheKey: { $regex: new RegExp(regex, 'i') } });
    }
    console.log(`🗑️ [Cache] Cleared "${pattern}" — ${result.deletedCount} entries`);
  } catch (e) { console.warn(`⚠️ [Cache] Invalidate failed: ${e.message}`); }
}

function cacheKey(...parts) {
  return parts.filter(p => p != null).join(':').replace(/\s+/g, '_').toUpperCase();
}

module.exports = { cacheGet, cacheSet, cacheInvalidatePattern, cacheKey };
