const Redis = require('ioredis');
const mongoose = require('mongoose');

let redis = null;
const CACHE_COLLECTION = 'TideBT_SummaryCache';

function getRedis() {
  if (!redis && process.env.REDIS_URL) {
    try {
      redis = new Redis(process.env.REDIS_URL, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        retryStrategy(times) {
          return Math.min(times * 50, 2000);
        }
      });
      redis.on('connect', () => console.log('⚡ Connected to Upstash Redis (TL)'));
      redis.on('error', (err) => console.warn('⚠️ Redis error:', err.message));
    } catch (e) {
      redis = null;
    }
  }
  return redis;
}

function getDb() {
  return mongoose.connection.readyState === 1 ? mongoose.connection.db : null;
}

function cacheKey(...parts) {
  return 'tidebt:tl:' + parts.filter(p => p != null).join(':').replace(/\s+/g, '_').toUpperCase();
}

async function cacheGet(key, maxAgeMs = 300000) {
  const client = getRedis();
  if (client) {
    try {
      const data = await client.get(key);
      if (data) return JSON.parse(data);
    } catch (e) {
      console.warn('Redis get error:', e.message);
    }
  }
  // MongoDB fallback
  try {
    const db = getDb(); if (!db) return null;
    const doc = await db.collection(CACHE_COLLECTION).findOne({ cacheKey: key });
    if (doc && doc.updatedAt) {
      const age = Date.now() - new Date(doc.updatedAt).getTime();
      if (age < maxAgeMs) return doc.data;
    }
  } catch {}
  return null;
}

async function cacheSet(key, value, ttlSeconds = 300) {
  const client = getRedis();
  const json = JSON.stringify(value);
  if (client) {
    try {
      await client.set(key, json, 'EX', ttlSeconds);
    } catch (e) {
      console.warn('Redis set error:', e.message);
    }
  }
  // Also write MongoDB fallback
  try {
    const db = getDb(); if (!db) return;
    await db.collection(CACHE_COLLECTION).updateOne(
      { cacheKey: key },
      { $set: { cacheKey: key, data: value, updatedAt: new Date() } },
      { upsert: true }
    );
  } catch {}
}

async function cacheInvalidatePattern(pattern) {
  const client = getRedis();
  if (client) {
    try {
      const keys = await client.keys('tidebt:tl:' + pattern);
      if (keys.length > 0) await client.del(...keys);
    } catch {}
  }
  try {
    const db = getDb(); if (!db) return;
    const regex = '^tidebt:tl:' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$';
    await db.collection(CACHE_COLLECTION).deleteMany({ cacheKey: { $regex: new RegExp(regex, 'i') } });
  } catch {}
}

module.exports = { cacheGet, cacheSet, cacheInvalidatePattern, cacheKey };
