import crypto from 'crypto';
import { setVapidDetails, sendNotification } from 'web-push';

const FIREBASE_DB_URL = (process.env.FIREBASE_DATABASE_URL || 'https://mypoltyfarm-default-rtdb.firebaseio.com').replace(/\/+$/, '');
const VAPID_PUBLIC_KEY = (process.env.VAPID_PUBLIC_KEY || '').trim();
const VAPID_PRIVATE_KEY = (process.env.VAPID_PRIVATE_KEY || '').trim();
const VAPID_SUBJECT = (process.env.VAPID_SUBJECT || 'mailto:admin@amarhisab.app').trim();
const FIREBASE_SERVICE_ACCOUNT_RAW = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
const FIREBASE_DATABASE_SECRET = (process.env.FIREBASE_DATABASE_SECRET || '').trim();
const FORCE_SLOT = (process.env.FORCE_SLOT || '').trim();

const STANDARD_FALLBACK_MEDICINES = [
  { day: 1, name: 'চিনির পানি বা গ্লুকোজ স্যালাইন', breed: 'Broiler', time: 'সকাল' },
  { day: 1, name: 'মাল্টিভিটামিন (ভিটামিন সি)', breed: 'Broiler', time: 'সারাদিন' },
  { day: 2, name: 'এনফ্লোক্স ভেট (অ্যান্টিবায়োটিক)', breed: 'Broiler', time: 'সকাল' },
  { day: 3, name: 'ভিটামিন ও অ্যামিনো অ্যাসিড', breed: 'Broiler', time: 'দুপুর' },
  { day: 5, name: 'বিসিআরডিভি (BCRDV) রাণীকক্ষেত ১ম টিকা', breed: 'Broiler', time: 'সকাল' },
  { day: 10, name: 'গাম্বোরো টিকা (১ম ডোজ)', breed: 'Broiler', time: 'সকাল' },
  { day: 12, name: 'ভিটামিন বি কমপ্লেক্স', breed: 'Broiler', time: 'দুপুর' },
  { day: 17, name: 'গাম্বোরো বুস্টার টিকা (২য় ডোজ)', breed: 'Broiler', time: 'সকাল' },
  { day: 20, name: 'ক্যালসিয়াম ও ভিটামিন ডি৩', breed: 'Broiler', time: 'রাত' },
  { day: 24, name: 'বিসিআরডিভি বুস্টার টিকা (২য় ডোজ)', breed: 'Broiler', time: 'সকাল' },
  { day: 28, name: 'কৃমিনাশক ঔষধ (Dewormer)', breed: 'Broiler', time: 'সকাল' },
  { day: 29, name: 'লিভার টনিক (Liver Tonic)', breed: 'Broiler', time: 'সারাদিন' }
];

function toBnDigits(val) {
  return String(val).replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[d]);
}

function getDhakaTimeParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const parts = {};
  for (const p of formatter.formatToParts(date)) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  const hour = parseInt(parts.hour, 10) % 24;
  const minute = parseInt(parts.minute, 10);
  const todayKey = `${parts.year}-${parts.month}-${parts.day}`;
  return { todayKey, hour, minute, totalMinutes: hour * 60 + minute };
}

function base64UrlEncode(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getGoogleAccessTokenFromServiceAccount(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64UrlEncode(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  }));
  const signingInput = `${header}.${claim}`;
  const privateKeyPem = String(serviceAccount.private_key || '').replace(/\\n/g, '\n');
  const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), privateKeyPem);
  const jwt = `${signingInput}.${base64UrlEncode(signature)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });
  if (!res.ok) {
    throw new Error(`OAuth token exchange failed: HTTP ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  return json.access_token;
}

async function createRtdbClient() {
  let authQuery = '';
  if (FIREBASE_SERVICE_ACCOUNT_RAW) {
    const sa = JSON.parse(FIREBASE_SERVICE_ACCOUNT_RAW);
    const accessToken = await getGoogleAccessTokenFromServiceAccount(sa);
    authQuery = `access_token=${encodeURIComponent(accessToken)}`;
  } else if (FIREBASE_DATABASE_SECRET) {
    authQuery = `auth=${encodeURIComponent(FIREBASE_DATABASE_SECRET)}`;
  } else {
    return null;
  }

  async function request(method, dbPath, body) {
    const cleanPath = dbPath.replace(/^\/+/, '');
    const sep = cleanPath.includes('?') ? '&' : '?';
    const url = `${FIREBASE_DB_URL}/${cleanPath}.json${sep}${authQuery}`;
    const res = await fetch(url, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    if (!res.ok) {
      throw new Error(`Firebase RTDB ${method} ${cleanPath} failed: HTTP ${res.status}`);
    }
    if (method === 'DELETE') return null;
    return res.json();
  }

  return {
    get: p => request('GET', p),
    put: (p, data) => request('PUT', p, data),
    patch: (p, data) => request('PATCH', p, data),
    del: p => request('DELETE', p)
  };
}

function getMedStartHour(timeStr) {
  const t = String(timeStr || 'সকাল').trim();
  if (t.includes('দুপুর')) return 12;
  if (t.includes('রাত')) return 16;
  return 6;
}

function getScheduleKey(item) {
  if (item.id) return item.id;
  return `std_${item.day}_${String(item.name || '').replace(/\s+/g, '_')}_${item.time || ''}`;
}

function computePrimaryShipmentAgeDays(shipmentsMap, todayKey) {
  if (!shipmentsMap || typeof shipmentsMap !== 'object') return null;
  const entries = Object.entries(shipmentsMap).map(([id, val]) => ({ id, ...(val || {}) }));
  if (entries.length === 0) return null;

  entries.sort((a, b) => {
    const aEnded = !!(a.isEnded && a.endedAt);
    const bEnded = !!(b.isEnded && b.endedAt);
    if (aEnded !== bEnded) return aEnded ? 1 : -1;
    return new Date(b.startDate || 0) - new Date(a.startDate || 0);
  });

  const primary = entries[0];
  if (!primary || !primary.startDate) return null;
  if (primary.isEnded && primary.endedAt) return null; // Shipment already ended

  const [ty, tm, td] = todayKey.split('-').map(Number);
  const [sy, sm, sd] = String(primary.startDate).split('-').map(Number);
  if (!sy || !sm || !sd) return null;
  const todayUtc = Date.UTC(ty, tm - 1, td);
  const startUtc = Date.UTC(sy, sm - 1, sd);
  const ageDays = Math.floor((todayUtc - startUtc) / (1000 * 60 * 60 * 24)) + 1;
  return {
    name: primary.name || 'সক্রিয় চালান',
    ageDays: ageDays > 0 ? ageDays : 0
  };
}

function determineActiveSlots(dhaka) {
  if (FORCE_SLOT) {
    if (FORCE_SLOT === 'test_all') {
      return ['feed_water_1300', 'feed_water_1530', 'feed_water_2100', 'med_check'];
    }
    return [FORCE_SLOT];
  }

  const slots = [];
  const mins = dhaka.totalMinutes;

  // Medicine slots (Bangladesh time):
  if (mins >= 5 * 60 + 55 && mins < 11 * 60 + 30) slots.push('med_morning');
  if (mins >= 11 * 60 + 55 && mins < 15 * 60 + 30) slots.push('med_noon');
  if (mins >= 15 * 60 + 55 && mins < 20 * 60 + 45) slots.push('med_night');

  // Requested Feed & Water check slots:
  // 1:00 PM (12:45 - 15:14 BDT)
  if (mins >= 12 * 60 + 45 && mins < 15 * 60 + 15) slots.push('feed_water_1300');
  // 3:30 PM (15:15 - 18:30 BDT)
  if (mins >= 15 * 60 + 15 && mins <= 18 * 60 + 30) slots.push('feed_water_1530');
  // 9:00 PM (20:45 - 23:55 BDT)
  if (mins >= 20 * 60 + 45 && mins <= 23 * 60 + 55) slots.push('feed_water_2100');

  return slots;
}

const DEFAULT_LOCATION = { lat: 23.8103, lon: 90.4125, city: 'Bangladesh' };
const weatherCache = new Map();

function extractOpenMeteoEnsembleRain(hourly, dhaka) {
  if (!hourly || typeof hourly !== 'object') return { next3hRainProb: 0, modelsRain: 0 };
  const times = Array.isArray(hourly.time) ? hourly.time : [];
  const models = ['ecmwf_ifs025', 'gfs_seamless', 'icon_seamless', 'jma_seamless'];

  let maxProb = 0;
  let maxModelsRain = 0;

  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    if (typeof t !== 'string' || !t.startsWith(`${dhaka.todayKey}T`)) continue;
    const hr = parseInt(t.slice(11, 13), 10);
    if (!Number.isFinite(hr) || hr < dhaka.hour || hr > Math.min(23, dhaka.hour + 3)) continue;

    const bmProb = Array.isArray(hourly.precipitation_probability_best_match)
      ? Number(hourly.precipitation_probability_best_match[i]) || 0
      : (Array.isArray(hourly.precipitation_probability) ? Number(hourly.precipitation_probability[i]) || 0 : 0);
    if (bmProb > maxProb) maxProb = bmProb;

    let rainVotes = 0;
    let modelProbsSum = 0;
    let modelProbsCount = 0;
    for (const m of models) {
      const pArr = hourly[`precipitation_probability_${m}`];
      const rArr = hourly[`precipitation_${m}`];
      const pVal = Array.isArray(pArr) && typeof pArr[i] === 'number' ? pArr[i] : null;
      const rVal = Array.isArray(rArr) && typeof rArr[i] === 'number' ? rArr[i] : 0;
      if (pVal !== null) {
        modelProbsSum += pVal;
        modelProbsCount++;
      }
      if ((pVal !== null && pVal >= 60) || rVal >= 0.2) {
        rainVotes++;
      }
    }
    if (modelProbsCount > 0) {
      const avgModelProb = Math.round(modelProbsSum / modelProbsCount);
      if (avgModelProb > maxProb) maxProb = avgModelProb;
    }
    if (rainVotes > maxModelsRain) maxModelsRain = rainVotes;
  }

  return { next3hRainProb: maxProb, modelsRain: maxModelsRain };
}

async function fetchDirectOpenMeteo(safeLat, safeLon, dhaka, multiModel) {
  const modelsParam = multiModel
    ? '&models=best_match,ecmwf_ifs025,gfs_seamless,icon_seamless,jma_seamless'
    : '';
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(safeLat.toFixed(4))}&longitude=${encodeURIComponent(safeLon.toFixed(4))}&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,rain,weather_code,wind_speed_10m,wind_gusts_10m&hourly=precipitation_probability,precipitation${modelsParam}&forecast_days=1&timezone=Asia%2FDhaka`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const cur = data && data.current;
    if (!cur || typeof cur.temperature_2m !== 'number') return null;

    const { next3hRainProb, modelsRain } = extractOpenMeteoEnsembleRain(data.hourly, dhaka);

    return {
      source: multiModel ? 'open-meteo-ensemble' : 'open-meteo',
      temp: Number(cur.temperature_2m),
      apparent: typeof cur.apparent_temperature === 'number' ? Number(cur.apparent_temperature) : Number(cur.temperature_2m),
      humidity: typeof cur.relative_humidity_2m === 'number' ? Number(cur.relative_humidity_2m) : 0,
      rain: typeof cur.rain === 'number' ? Number(cur.rain) : 0,
      precipitation: typeof cur.precipitation === 'number' ? Number(cur.precipitation) : 0,
      weatherCode: typeof cur.weather_code === 'number' ? Number(cur.weather_code) : 0,
      windSpeed: typeof cur.wind_speed_10m === 'number' ? Number(cur.wind_speed_10m) : 0,
      windGusts: typeof cur.wind_gusts_10m === 'number' ? Number(cur.wind_gusts_10m) : 0,
      next3hRainProb,
      modelsRain
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchLiveWeather(lat, lon) {
  const safeLat = Number.isFinite(Number(lat)) ? Number(lat) : DEFAULT_LOCATION.lat;
  const safeLon = Number.isFinite(Number(lon)) ? Number(lon) : DEFAULT_LOCATION.lon;
  const cacheKey = `${safeLat.toFixed(2)},${safeLon.toFixed(2)}`;
  if (weatherCache.has(cacheKey)) return weatherCache.get(cacheKey);

  const dhaka = getDhakaTimeParts();

  try {
    const ensemble = await fetchDirectOpenMeteo(safeLat, safeLon, dhaka, true);
    if (ensemble) {
      weatherCache.set(cacheKey, ensemble);
      return ensemble;
    }
  } catch (err) {
    console.warn(`Open-Meteo ensemble warning (${cacheKey}):`, err.message);
  }

  try {
    const fallback = await fetchDirectOpenMeteo(safeLat, safeLon, dhaka, false);
    weatherCache.set(cacheKey, fallback);
    return fallback;
  } catch (err) {
    console.warn(`Open-Meteo fallback warning (${cacheKey}):`, err.message);
    weatherCache.set(cacheKey, null);
    return null;
  }
}

function buildWeatherAwareCarePayload(medSlot, weather, primaryShipment, cityLabel) {
  const areaPrefix = (cityLabel && cityLabel !== 'Bangladesh' && cityLabel !== 'অটো লোকেশন')
    ? `${cityLabel}: `
    : '';

  if (!weather) {
    if (medSlot === 'med_morning') {
      return {
        title: '☀️ সুপ্রভাত ও সকালের যত্ন',
        body: 'পানির পাত্রগুলো পরিষ্কার করে সকালের খাবার ও ঔষধ ঠিকমতো দিন।'
      };
    }
    if (medSlot === 'med_noon') {
      return {
        title: '🌤️ দুপুরের শেড ও যত্ন চেক',
        body: 'শেডের আবহাওয়া ও তাপমাত্রা দেখে পর্দা, বাতাস চলাচল ও পরিষ্কার পানির ব্যবস্থা নিশ্চিত করুন।'
      };
    }
    if (medSlot === 'med_night') {
      return {
        title: '⛅ বিকালের যত্ন ও রাতের ঔষধ চেক',
        body: 'লিটার (বিছানা) শুকনো আছে কি না দেখে নিন এবং রাতের ঔষধের সময় হলে টিক দিন।'
      };
    }
    return {
      title: '💊 ঔষধ ও দৈনিক যত্নের রিমাইন্ডার',
      body: primaryShipment
        ? `"${primaryShipment.name}" (দিন ${toBnDigits(primaryShipment.ageDays)}): এই মুহূর্তে বাকি ঔষধ নেই; আবহাওয়া ও শেডের অবস্থা দেখে নিন।`
        : 'চালান যোগ থাকলে প্রতিদিন সকাল, দুপুর ও বিকালে আবহাওয়া ও ঔষধের রিমাইন্ডার পাবেন।'
    };
  }

  const tempBn = toBnDigits(Math.round(weather.temp));
  const appBn = toBnDigits(Math.round(weather.apparent));
  const humBn = toBnDigits(Math.round(weather.humidity));
  const windBn = toBnDigits(Math.round(Math.max(weather.windSpeed || 0, weather.windGusts || 0)));
  const probBn = toBnDigits(Math.round(weather.next3hRainProb));

  const isStorm = weather.weatherCode >= 95 || weather.windSpeed >= 30 || (weather.windGusts || 0) >= 42;
  const isRaining = weather.rain >= 0.15 || weather.precipitation >= 0.15 || weather.weatherCode >= 51;
  const isRainLikely = !isRaining && (weather.next3hRainProb >= 70 || (weather.modelsRain || 0) >= 3);
  const isHot = !isRaining && (weather.temp >= 32 || weather.apparent >= 35);
  const isCold = weather.temp <= 20;
  const isWarm = !isRaining && !isHot && weather.temp >= 29;

  if (isStorm) {
    return {
      title: `⛈️ ঝড়-বৃষ্টির সতর্কতা (${tempBn}° সে.)`,
      body: `${areaPrefix}বাইরে ঝড়-বৃষ্টি হচ্ছে (দমকা বাতাস ${windBn} কিমি/ঘণ্টা)। শেডের পর্দা শক্ত করে নামিয়ে দিন এবং বৃষ্টির ছাট ও ঠান্ডা বাতাস থেকে মুরগি বাঁচান।`
    };
  }
  if (isRaining) {
    return {
      title: `🌧️ বৃষ্টির আবহাওয়া সতর্কতা (${tempBn}° সে.)`,
      body: `${areaPrefix}এখন বৃষ্টি হচ্ছে (আর্দ্রতা ${humBn}%)। শেডের পর্দা নামিয়ে দিন, লিটার (বিছানা) শুকনো রাখুন এবং ঠান্ডা লাগা থেকে বাচ্চা বাঁচান।`
    };
  }
  if (isRainLikely) {
    return {
      title: `🌦️ বৃষ্টির সম্ভাবনা (${probBn}%, ${tempBn}° সে.)`,
      body: `${areaPrefix}শীঘ্রই বৃষ্টি হতে পারে। শেডের পর্দা ও চালের ছিদ্র আগে থেকেই চেক করে প্রস্তুত রাখুন যেন লিটার না ভেজে।`
    };
  }
  if (isHot) {
    return {
      title: `🔥 অতিরিক্ত গরমের সতর্কতা (${tempBn}° সে.)`,
      body: `${areaPrefix}তাপমাত্রা বেশি (অনুভূত ${appBn}° সে.)! শেডে ফ্যান/স্প্রে চালু রাখুন এবং পানিতে ভিটামিন-সি বা ইলেক্ট্রোলাইট স্যালাইন দিন।`
    };
  }
  if (isCold) {
    return {
      title: `❄️ ঠান্ডা আবহাওয়ার সতর্কতা (${tempBn}° সে.)`,
      body: `${areaPrefix}তাপমাত্রা কম (${tempBn}° সে.)। শেডের পর্দা ভালোভাবে ঢেকে দিন, ঠান্ডা বাতাস আটকান এবং ছোট বাচ্চাদের ব্রুডিং তাপমাত্রা চেক করুন।`
    };
  }
  if (isWarm) {
    return {
      title: `☀️ গরম ও বাতাস চলাচল চেক (${tempBn}° সে.)`,
      body: `${areaPrefix}আবহাওয়া কিছুটা গরম (আর্দ্রতা ${humBn}%)। শেডে পর্যাপ্ত বাতাস চলাচল ও ঠান্ডা পরিষ্কার পানির ব্যবস্থা নিশ্চিত করুন।`
    };
  }

  // স্বাভাবিক আরামদায়ক আবহাওয়া (২১°–২৮° সে., বৃষ্টি নেই)
  if (medSlot === 'med_morning') {
    return {
      title: `☀️ সুপ্রভাত ও সকালের যত্ন (${tempBn}° সে.)`,
      body: `${areaPrefix}আবহাওয়া ভালো আছে (${tempBn}° সে.)। পানির পাত্র পরিষ্কার করে সকালের খাবার ও ঔষধ ঠিকমতো দিন।`
    };
  }
  if (medSlot === 'med_noon') {
    return {
      title: `🌤️ দুপুরের শেড ও যত্ন চেক (${tempBn}° সে.)`,
      body: `${areaPrefix}আবহাওয়া স্বাভাবিক আছে (${tempBn}° সে., আর্দ্রতা ${humBn}%)। শেডের বাতাস চলাচল, পরিষ্কার পানি ও লিটারের অবস্থা দেখে নিন।`
    };
  }
  if (medSlot === 'med_night') {
    return {
      title: `⛅ বিকালের যত্ন ও রাতের প্রস্তুতি (${tempBn}° সে.)`,
      body: `${areaPrefix}আবহাওয়া স্বাভাবিক (${tempBn}° সে.)। লিটার শুকনো আছে কি না দেখুন এবং রাতের ঔষধের সময় হলে টিক দিন।`
    };
  }
  return {
    title: `🌤️ খামার ও আবহাওয়া আপডেট (${tempBn}° সে.)`,
    body: primaryShipment
      ? `"${primaryShipment.name}" (দিন ${toBnDigits(primaryShipment.ageDays)}): ${areaPrefix}আবহাওয়া স্বাভাবিক (${tempBn}° সে., আর্দ্রতা ${humBn}%) ও এই মুহূর্তে বাকি ঔষধ নেই।`
      : `${areaPrefix}বর্তমান আবহাওয়া স্বাভাবিক (${tempBn}° সে., আর্দ্রতা ${humBn}%)। শেডের বাতাস ও পরিষ্কার পানি চেক করুন।`
  };
}

async function deduplicateUserSubscriptions(db, uid, rawSubsEntries) {
  // Sort newest first
  const sorted = [...rawSubsEntries].sort((a, b) => (Number(b[1].updatedAt) || 0) - (Number(a[1].updatedAt) || 0));
  const kept = [];
  const toDelete = [];
  const seenEndpoints = new Set();
  const seenDeviceIds = new Set();
  const platformsWithModernSub = new Set();

  for (const [, sub] of sorted) {
    if (sub && sub.deviceId && sub.platform) {
      platformsWithModernSub.add(sub.platform);
    }
  }

  for (const entry of sorted) {
    const [subId, sub] = entry;
    if (!sub || !sub.endpoint) continue;

    // Duplicate endpoint
    if (seenEndpoints.has(sub.endpoint)) {
      toDelete.push(subId);
      continue;
    }

    // Duplicate deviceId -> keep only newest
    if (sub.deviceId) {
      if (seenDeviceIds.has(sub.deviceId)) {
        toDelete.push(subId);
        continue;
      }
      seenDeviceIds.add(sub.deviceId);
    } else if (sub.platform && platformsWithModernSub.has(sub.platform)) {
      // Legacy subscription (pre-deviceId, e.g. old repo/old install) on same platform -> prune to stop duplicates
      toDelete.push(subId);
      continue;
    }

    seenEndpoints.add(sub.endpoint);
    kept.push(entry);
  }

  for (const staleId of toDelete) {
    await db.del(`users/${uid}/push_subscriptions/${staleId}`).catch(() => {});
  }

  return { kept, prunedCount: toDelete.length };
}

async function run() {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.log('VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY is not configured in GitHub Secrets yet. Skipping push run.');
    return;
  }

  const db = await createRtdbClient();
  if (!db) {
    console.log('FIREBASE_SERVICE_ACCOUNT or FIREBASE_DATABASE_SECRET is not configured in GitHub Secrets yet. Skipping push run.');
    return;
  }

  setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  // Publish VAPID public key to RTDB so GitHub Pages PWAs always have it
  try {
    const existingPub = await db.get('breed_video_links/_push_public_key');
    if (existingPub !== VAPID_PUBLIC_KEY) {
      await db.put('breed_video_links/_push_public_key', VAPID_PUBLIC_KEY);
    }
  } catch (err) {
    console.warn('Could not sync _push_public_key to RTDB:', err.message);
  }

  const dhaka = getDhakaTimeParts();
  const activeSlots = determineActiveSlots(dhaka);
  console.log(`Dhaka time: ${dhaka.todayKey} ${dhaka.hour}:${String(dhaka.minute).padStart(2, '0')} | Active slots: ${activeSlots.join(', ') || 'none'}`);

  if (activeSlots.length === 0) return;

  const [usersData, scheduleData] = await Promise.all([
    db.get('users'),
    db.get('medicine_schedule')
  ]);

  if (!usersData || typeof usersData !== 'object') {
    console.log('No users found in RTDB.');
    return;
  }

  const schedulesList = scheduleData && typeof scheduleData === 'object'
    ? Object.entries(scheduleData).map(([id, val]) => ({ id, ...(val || {}) }))
    : STANDARD_FALLBACK_MEDICINES;

  let totalSent = 0;
  let totalRemoved = 0;

  for (const [uid, userObj] of Object.entries(usersData)) {
    if (!userObj || !userObj.push_subscriptions) continue;
    const rawSubsEntries = Object.entries(userObj.push_subscriptions).filter(([, s]) => s && s.endpoint);
    if (rawSubsEntries.length === 0) continue;

    const { kept: subsEntries, prunedCount } = await deduplicateUserSubscriptions(db, uid, rawSubsEntries);
    totalRemoved += prunedCount;
    if (subsEntries.length === 0) continue;

    const sentLog = userObj.push_sent_log || {};
    const messagesToSend = [];

    // Resolve user's location for live weather-aware notifications
    const userLoc = userObj.weather_location || subsEntries.find(([, s]) => s.location && s.location.lat)?.[1]?.location || DEFAULT_LOCATION;

    // 1. Feed & Water reminders (1:00 PM, 3:30 PM, 9:00 PM BDT)
    if (activeSlots.includes('feed_water_1300')) {
      const logKey = `${dhaka.todayKey}_feed_water_1300`;
      if (FORCE_SLOT || !sentLog[logKey]) {
        messagesToSend.push({
          logKey,
          payload: {
            title: 'দুপুর ১টার খাবার ও পানি চেক 🐔',
            body: 'মুরগির পাত্রে পর্যাপ্ত খাবার ও পরিষ্কার পানি আছে কি না এখনই দেখে নিন।',
            tag: `feed_water_1300_${dhaka.todayKey}`,
            action: 'pk_chatbot'
          }
        });
      }
    }

    if (activeSlots.includes('feed_water_1530')) {
      const logKey = `${dhaka.todayKey}_feed_water_1530`;
      if (FORCE_SLOT || !sentLog[logKey]) {
        messagesToSend.push({
          logKey,
          payload: {
            title: 'বিকাল ৩:৩০টার খাবার ও পানি চেক 💧',
            body: 'বিকেলে আবার মুরগির পাত্রে খাবার ও পরিষ্কার পানি আছে কি না চেক করে নিন।',
            tag: `feed_water_1530_${dhaka.todayKey}`,
            action: 'pk_chatbot'
          }
        });
      }
    }

    if (activeSlots.includes('feed_water_2100')) {
      const logKey = `${dhaka.todayKey}_feed_water_2100`;
      if (FORCE_SLOT || !sentLog[logKey]) {
        messagesToSend.push({
          logKey,
          payload: {
            title: 'রাত ৯টার খাবার ও পানি চেক 🌙',
            body: 'রাতে ঘুমানোর আগে মুরগির পর্যাপ্ত খাবার ও পানি দেওয়া হয়েছে কি না নিশ্চিত করুন।',
            tag: `feed_water_2100_${dhaka.todayKey}`,
            action: 'pk_chatbot'
          }
        });
      }
    }

    // 2. Active shipment medicine & live weather-aware farm care reminders
    const primaryShipment = computePrimaryShipmentAgeDays(userObj.shipments, dhaka.todayKey);
    const medSlot = activeSlots.find(s => s.startsWith('med_'));
    if (medSlot) {
      const medLogKey = `${dhaka.todayKey}_${medSlot}`;
      if (FORCE_SLOT || !sentLog[medLogKey]) {
        let medPushed = false;

        if (primaryShipment) {
          const firstSubBreed = subsEntries.find(([, s]) => s.breed)?.[1]?.breed || 'Broiler';
          const completed = userObj.completed_medicines || {};
          const skipped = userObj.skipped_medicines || {};

          const matching = schedulesList.filter(item => !item.breed || item.breed === 'All' || item.breed === firstSubBreed);
          const dueNow = matching.filter(item => {
            const d = parseInt(item.day, 10) || 1;
            const key = getScheduleKey(item);
            if (completed[key] || skipped[key]) return false;
            if (d !== primaryShipment.ageDays) return false;
            return dhaka.hour >= getMedStartHour(item.time);
          });
          const overdue = matching.filter(item => {
            const d = parseInt(item.day, 10) || 1;
            const key = getScheduleKey(item);
            return d < primaryShipment.ageDays && !completed[key] && !skipped[key];
          });

          if (dueNow.length > 0 || overdue.length > 0) {
            const parts = [];
            if (dueNow.length > 0) {
              parts.push(`আজ ${toBnDigits(dueNow.length)}টি ঔষধ বাকি (${dueNow.slice(0, 2).map(m => m.name).join(', ')})`);
            }
            if (overdue.length > 0) {
              parts.push(`আগের ${toBnDigits(overdue.length)}টি টিক বাকি`);
            }
            messagesToSend.push({
              logKey: medLogKey,
              payload: {
                title: `PK Chat Bot: ${primaryShipment.name} (দিন ${toBnDigits(primaryShipment.ageDays)})`,
                body: `${parts.join(' · ')}। টিক দিতে ট্যাপ করুন।`,
                tag: `${medSlot}_${dhaka.todayKey}`,
                action: 'medicine'
              }
            });
            medPushed = true;
          }
        }

        if (!medPushed) {
          const liveWeather = await fetchLiveWeather(userLoc.lat, userLoc.lon, userLoc.city);
          const care = buildWeatherAwareCarePayload(medSlot, liveWeather, primaryShipment, userLoc.city);
          messagesToSend.push({
            logKey: medLogKey,
            payload: {
              title: care.title,
              body: care.body,
              tag: `${medSlot}_${dhaka.todayKey}`,
              action: 'medicine'
            }
          });
        }
      }
    }

    // 3. Low stock alert (once per day)
    if (userObj.stock && typeof userObj.stock === 'object') {
      const lowItems = Object.values(userObj.stock).filter(it => it && parseFloat(it.quantity) <= 2);
      const stockLogKey = `${dhaka.todayKey}_low_stock`;
      if (lowItems.length > 0 && (FORCE_SLOT || !sentLog[stockLogKey])) {
        messagesToSend.push({
          logKey: stockLogKey,
          payload: {
            title: '⚠️ স্টক অ্যালার্ট!',
            body: `${lowItems[0].name} প্রায় শেষ (মাত্র ${toBnDigits(lowItems[0].quantity)} ${lowItems[0].unit || ''})।`,
            tag: `stock_alert_${dhaka.todayKey}`,
            action: 'stock'
          }
        });
      }
    }

    if (messagesToSend.length === 0) continue;

    for (const msg of messagesToSend) {
      let deliveredAny = false;
      for (const [subId, sub] of subsEntries) {
        try {
          await sendNotification(
            {
              endpoint: sub.endpoint,
              keys: sub.keys
            },
            JSON.stringify({
              ...msg.payload,
              icon: './icon.png',
              badge: './icon.png',
              timestamp: Date.now()
            })
          );
          deliveredAny = true;
          totalSent++;
        } catch (err) {
          const code = err && err.statusCode;
          if (code === 404 || code === 410) {
            await db.del(`users/${uid}/push_subscriptions/${subId}`).catch(() => {});
            totalRemoved++;
          } else {
            console.warn(`Push send warning for user ${uid} sub ${subId}:`, code || err.message);
          }
        }
      }
      if (deliveredAny && !FORCE_SLOT) {
        await db.put(`users/${uid}/push_sent_log/${msg.logKey}`, Date.now()).catch(() => {});
      }
    }
  }

  console.log(`Push run complete. Sent: ${totalSent}, Expired/duplicate removed: ${totalRemoved}`);
}

run().catch(err => {
  console.error('Push notification script error:', err);
  process.exit(1);
});
