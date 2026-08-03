const Redis = require('ioredis');

const UPSTASH_REST_URL = process.env.UPSTASH_REDIS_REST_URL || 'https://distinct-magpie-119165.upstash.io';
const UPSTASH_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || 'gQAAAAAAAdF9AAIgcDEyMDJmN2EyMWQ4ZWI0ZDU3OGFkN2VjOTc0MzJhMjM4OA';

let ioredisClient = null;
const memoryFallback = new Map();

function getIoRedis() {
  if (!ioredisClient && process.env.REDIS_URL) {
    try {
      ioredisClient = new Redis(process.env.REDIS_URL, {
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
        enableReadyCheck: false,
        retryStrategy() { return 1000; }
      });
      ioredisClient.on('error', () => { ioredisClient = null; });
    } catch (e) {
      ioredisClient = null;
    }
  }
  return ioredisClient;
}

async function upstashRestCall(command, ...args) {
  try {
    const path = [command, ...args.map(a => encodeURIComponent(String(a)))].join('/');
    const url = `${UPSTASH_REST_URL}/${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1200);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${UPSTASH_REST_TOKEN}` },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) return null;
    const json = await res.json();
    return json.result;
  } catch (e) {
    return null;
  }
}

const cacheKey = (...parts) => 'tidebt:' + parts.filter(Boolean).join(':');

const cacheGet = async (key) => {
  const restVal = await upstashRestCall('get', key);
  if (restVal) {
    try { return JSON.parse(restVal); } catch (e) { return restVal; }
  }

  const io = getIoRedis();
  if (io) {
    try {
      const data = await io.get(key);
      if (data) return JSON.parse(data);
    } catch (e) {}
  }

  const mem = memoryFallback.get(key);
  if (mem && mem.expiry > Date.now()) return mem.data;
  return null;
};

const cacheSet = async (key, data, ttlSeconds = 86400) => {
  const json = JSON.stringify(data);
  await upstashRestCall('set', key, json, 'EX', ttlSeconds);

  const io = getIoRedis();
  if (io) {
    try { await io.set(key, json, 'EX', ttlSeconds); } catch (e) {}
  }

  memoryFallback.set(key, { data, expiry: Date.now() + (ttlSeconds * 1000) });
};

const cacheInvalidatePattern = async (pattern) => {
  const io = getIoRedis();
  if (io) {
    try {
      const keys = await io.keys(pattern);
      if (keys.length > 0) await io.del(...keys);
    } catch (e) {}
  }
  for (const k of memoryFallback.keys()) {
    if (k.includes(pattern.replace('*', ''))) memoryFallback.delete(k);
  }
};

module.exports = {
  cacheKey,
  cacheGet,
  cacheSet,
  cacheInvalidatePattern
};
