/**
 * cache.js — Two-layer cache: in-memory (instant) + MongoDB (persistent)
 * TTL: 30 minutes
 */

const mongoose = require('mongoose');
const AGE_MS = 5 * 60 * 1000; // 5 Minutes TTL auto-expiration

// ── In-memory cache ────────────────────────────────────────────────────────
const memCache = new Map();

function memGet(key) {
  const entry = memCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > AGE_MS) { memCache.delete(key); return null; }
  return entry.data;
}

function memSet(key, value) {
  memCache.set(key, { data: value, ts: Date.now() });
}

function memDel(pattern) {
  if (!pattern || pattern === '*') { memCache.clear(); return; }
  const regex = new RegExp('^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i');
  for (const k of memCache.keys()) { if (regex.test(k)) memCache.delete(k); }
}

function getDb() {
  return mongoose.connection.readyState === 1 ? mongoose.connection.db : null;
}

async function cacheGet(key) {
  // Layer 1: in-memory
  const mem = memGet(key);
  if (mem !== null) { console.log(`⚡ [MemCache HIT] ${key}`); return mem; }

  // Layer 2: MongoDB
  try {
    const db = getDb(); if (!db) return null;
    const doc = await db.collection(CACHE_COLLECTION).findOne({ cacheKey: key });
    if (!doc) return null;
    if (doc.updatedAt && (Date.now() - new Date(doc.updatedAt).getTime()) > AGE_MS) {
      console.log(`⏰ [Cache EXPIRED] ${key}`);
      await db.collection(CACHE_COLLECTION).deleteOne({ cacheKey: key });
      return null;
    }
    if (doc.data) memSet(key, doc.data);
    console.log(`⚡ [MongoDB Cache HIT] ${key}`);
    return doc.data;
  } catch { return null; }
}

async function cacheSet(key, value) {
  memSet(key, value);
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
  memDel(pattern);
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
