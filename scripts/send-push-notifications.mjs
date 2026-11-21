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

const CURRENT_REPO_NAME = (process.env.CURRENT_REPO_NAME || '').trim();

function determineActiveSlots(dhaka) {
  if (FORCE_SLOT) {
    if (FORCE_SLOT === 'test_all') {
      return ['feed_water_1300', 'feed_water_1530', 'feed_water_2100', 'med_check'];
    }
    return [FORCE_SLOT];
  }

  const mins = dhaka.totalMinutes;

  // Non-overlapping smart schedule (Bangladesh time) — 1 clear primary slot per window:
  if (mins >= 5 * 60 + 50 && mins <= 7 * 60 + 30) return ['med_morning'];        // 6:00 AM window
  if (mins >= 11 * 60 + 50 && mins <= 12 * 60 + 42) return ['med_noon'];          // 12:00 PM window
  if (mins >= 12 * 60 + 45 && mins <= 15 * 60 + 10) return ['feed_water_1300'];   // 1:00 PM Feed & Water + Weather
  if (mins >= 15 * 60 + 15 && mins <= 15 * 60 + 55) return ['feed_water_1530'];   // 3:30 PM Feed & Water + Weather
  if (mins >= 15 * 60 + 58 && mins <= 18 * 60 + 30) return ['med_night'];         // 4:00 PM Night Medicine / Alert
  if (mins >= 20 * 60 + 45 && mins <= 23 * 60 + 55) return ['feed_water_2100'];   // 9:00 PM Night Feed & Water + Security

  return [];
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
  const timer = setTimeout(() => controller.abort(), 12000);
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

async function fetchWttrBackup(safeLat, safeLon) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`https://wttr.in/${safeLat.toFixed(2)},${safeLon.toFixed(2)}?format=j1`, { signal: controller.signal });
    if (!res.ok) return null;
    const data = await res.json();
    const cc = data && Array.isArray(data.current_condition) ? data.current_condition[0] : null;
    if (!cc || cc.temp_C === undefined) return null;
    const precipMm = parseFloat(cc.precipMM || '0') || 0;
    const wmoCode = parseInt(cc.weatherCode, 10) || 0;
    const isWttrRain = precipMm >= 0.1 || [176, 263, 266, 293, 296, 299, 302, 305, 308, 353, 356, 359, 386, 389].includes(wmoCode);
    return {
      source: 'wttr-backup',
      temp: parseFloat(cc.temp_C),
      apparent: parseFloat(cc.FeelsLikeC || cc.temp_C),
      humidity: parseFloat(cc.humidity || '0') || 0,
      rain: precipMm,
      precipitation: precipMm,
      weatherCode: isWttrRain ? 61 : 2,
      windSpeed: parseFloat(cc.windspeedKmph || '0') || 0,
      windGusts: parseFloat(cc.windspeedKmph || '0') || 0,
      next3hRainProb: isWttrRain ? 80 : 0,
      modelsRain: 0
    };
  } catch (_) {
    return null;
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

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const ensemble = await fetchDirectOpenMeteo(safeLat, safeLon, dhaka, true);
      if (ensemble) {
        weatherCache.set(cacheKey, ensemble);
        return ensemble;
      }
    } catch (err) {
      console.warn(`Open-Meteo ensemble attempt ${attempt + 1} (${cacheKey}):`, err.message);
    }
  }

  try {
    const fallback = await fetchDirectOpenMeteo(safeLat, safeLon, dhaka, false);
    if (fallback) {
      weatherCache.set(cacheKey, fallback);
      return fallback;
    }
  } catch (err) {
    console.warn(`Open-Meteo single fallback (${cacheKey}):`, err.message);
  }

  const wttr = await fetchWttrBackup(safeLat, safeLon);
  if (wttr) {
    weatherCache.set(cacheKey, wttr);
    return wttr;
  }

  return null;
}

function classifyWeatherForPoultry(weather, hour, cityLabel) {
  const areaPrefix = (cityLabel && cityLabel !== 'Bangladesh' && cityLabel !== 'অটো লোকেশন')
    ? `${cityLabel}: `
    : '';
  const isNight = hour >= 18 || hour < 5;

  if (!weather) {
    return {
      icon: isNight ? '🌙' : '🐔',
      label: 'আবহাওয়া ও শেড',
      shortNote: `${areaPrefix}শেডের আবহাওয়া ও তাপমাত্রা দেখে পর্দা, বাতাস ও পরিষ্কার পানি চেক করুন`,
      isUrgent: false
    };
  }

  const tempBn = toBnDigits(Math.round(weather.temp));
  const appBn = toBnDigits(Math.round(weather.apparent));
  const humBn = toBnDigits(Math.round(weather.humidity));
  const windBn = toBnDigits(Math.round(Math.max(weather.windSpeed || 0, weather.windGusts || 0)));
  const probBn = toBnDigits(Math.round(weather.next3hRainProb));

  const isStorm = weather.weatherCode >= 95 || weather.windSpeed >= 30 || (weather.windGusts || 0) >= 42;
  const isRaining = weather.rain >= 0.1 || weather.precipitation >= 0.1 || (weather.weatherCode >= 51 && weather.weatherCode <= 86);
  const isDrizzle = isRaining && weather.rain < 0.5 && weather.weatherCode >= 51 && weather.weatherCode <= 55;
  const isRainLikely = !isRaining && (weather.next3hRainProb >= 65 || (weather.modelsRain || 0) >= 3);
  const isFog = !isRaining && (weather.weatherCode === 45 || weather.weatherCode === 48);
  const isHot = !isRaining && (weather.temp >= 32 || weather.apparent >= 35);
  const isCold = weather.temp <= 20;
  const isWarm = !isRaining && !isHot && weather.temp >= 29;
  const isOvercast = weather.weatherCode === 3;
  const isPartlyCloudy = weather.weatherCode === 2;

  if (isStorm) {
    return {
      icon: '⛈️',
      tempBn,
      label: `ঝড়-বৃষ্টি (${tempBn}° সে.)`,
      shortNote: `${areaPrefix}ঝড়-বৃষ্টি হচ্ছে (দমকা বাতাস ${windBn} কিমি/ঘণ্টা) — শেডের পর্দা শক্ত করে নামিয়ে দিন`,
      fullTitle: `⛈️ ঝড়-বৃষ্টির সতর্কতা (${tempBn}° সে.)`,
      fullBody: `${areaPrefix}বাইরে ঝড়-বৃষ্টি হচ্ছে (দমকা বাতাস ${windBn} কিমি/ঘণ্টা)। শেডের পর্দা শক্ত করে নামিয়ে দিন এবং বৃষ্টির ছাট ও ঠান্ডা বাতাস থেকে মুরগি বাঁচান।`,
      isUrgent: true
    };
  }
  if (isRaining) {
    return {
      icon: isDrizzle ? '🌦️' : '🌧️',
      tempBn,
      label: `${isDrizzle ? 'হালকা বৃষ্টি' : 'বৃষ্টি'} (${tempBn}° সে.)`,
      shortNote: `${areaPrefix}বৃষ্টি হচ্ছে (${tempBn}° সে., আর্দ্রতা ${humBn}%) — শেডের পর্দা নামিয়ে দিন ও লিটার শুকনো রাখুন`,
      fullTitle: `${isDrizzle ? '🌦️ গুঁড়ি গুঁড়ি বৃষ্টির' : '🌧️ বৃষ্টির আবহাওয়া'} সতর্কতা (${tempBn}° সে.)`,
      fullBody: `${areaPrefix}এখন বৃষ্টি হচ্ছে (আর্দ্রতা ${humBn}%)। শেডের পর্দা নামিয়ে দিন, লিটার (বিছানা) শুকনো রাখুন এবং ঠান্ডা লাগা থেকে বাচ্চা বাঁচান।`,
      isUrgent: true
    };
  }
  if (isRainLikely) {
    return {
      icon: '🌦️',
      tempBn,
      label: `বৃষ্টির সম্ভাবনা (${probBn}%, ${tempBn}° সে.)`,
      shortNote: `${areaPrefix}শীঘ্রই বৃষ্টির সম্ভাবনা (${probBn}%) — পর্দা প্রস্তুত রাখুন`,
      fullTitle: `🌦️ বৃষ্টির সম্ভাবনা (${probBn}%, ${tempBn}° সে.)`,
      fullBody: `${areaPrefix}শীঘ্রই বৃষ্টি হতে পারে। শেডের পর্দা ও চালের ছিদ্র আগে থেকেই চেক করে প্রস্তুত রাখুন যেন লিটার না ভেজে।`,
      isUrgent: true
    };
  }
  if (isFog) {
    return {
      icon: '🌫️',
      tempBn,
      label: `কুয়াশা ও ঠান্ডা (${tempBn}° সে.)`,
      shortNote: `${areaPrefix}কুয়াশা ও আর্দ্রতা ${humBn}% — শেডের পর্দা দিয়ে ঠান্ডা বাতাস আটকান`,
      fullTitle: `🌫️ কুয়াশা ও স্যাঁতসেঁতে আবহাওয়া (${tempBn}° সে.)`,
      fullBody: `${areaPrefix}বাইরে কুয়াশা ও ঠান্ডা (${tempBn}° সে.)। শেডের পর্দা ঢেকে দিন ও ছোট বাচ্চাদের তাপমাত্রা চেক করুন।`,
      isUrgent: true
    };
  }
  if (isHot) {
    return {
      icon: '🔥',
      tempBn,
      label: `অতিরিক্ত গরম (${tempBn}° সে.)`,
      shortNote: `${areaPrefix}গরম বেশি (অনুভূত ${appBn}° সে.) — ফ্যান/স্প্রে চালু রাখুন ও পানিতে ভিটামিন-সি/স্যালাইন দিন`,
      fullTitle: `🔥 অতিরিক্ত গরমের সতর্কতা (${tempBn}° সে.)`,
      fullBody: `${areaPrefix}তাপমাত্রা বেশি (অনুভূত ${appBn}° সে.)! শেডে ফ্যান/স্প্রে চালু রাখুন এবং পানিতে ভিটামিন-সি বা ইলেক্ট্রোলাইট স্যালাইন দিন।`,
      isUrgent: true
    };
  }
  if (isCold) {
    return {
      icon: '❄️',
      tempBn,
      label: `ঠান্ডা (${tempBn}° সে.)`,
      shortNote: `${areaPrefix}তাপমাত্রা কম (${tempBn}° সে.) — পর্দা ঢেকে দিন ও ব্রুডিং তাপমাত্রা দেখুন`,
      fullTitle: `❄️ ঠান্ডা আবহাওয়ার সতর্কতা (${tempBn}° সে.)`,
      fullBody: `${areaPrefix}তাপমাত্রা কম (${tempBn}° সে.)। শেডের পর্দা ভালোভাবে ঢেকে দিন, ঠান্ডা বাতাস আটকান এবং ছোট বাচ্চাদের ব্রুডিং তাপমাত্রা চেক করুন।`,
      isUrgent: true
    };
  }
  if (isWarm) {
    const icon = isOvercast ? '☁️' : (isPartlyCloudy ? '⛅' : '☀️');
    return {
      icon,
      tempBn,
      label: `গরম (${tempBn}° সে.)`,
      shortNote: `${areaPrefix}${isOvercast ? 'মেঘলা ও গরম' : 'গরম আবহাওয়া'} (${tempBn}° সে.) — পর্যাপ্ত বাতাস ও ঠান্ডা পানি রাখুন`,
      fullTitle: `${icon} গরম ও বাতাস চলাচল চেক (${tempBn}° সে.)`,
      fullBody: `${areaPrefix}আবহাওয়া কিছুটা গরম (আর্দ্রতা ${humBn}%)। শেডে পর্যাপ্ত বাতাস চলাচল ও ঠান্ডা পরিষ্কার পানির ব্যবস্থা নিশ্চিত করুন।`,
      isUrgent: false
    };
  }
  if (isOvercast) {
    return {
      icon: '☁️',
      tempBn,
      label: `মেঘলা (${tempBn}° সে.)`,
      shortNote: `${areaPrefix}আকাশ মেঘলা (${tempBn}° সে., আর্দ্রতা ${humBn}%) — পর্দা ও লিটার চেক করুন`,
      fullTitle: null,
      fullBody: null,
      isUrgent: false
    };
  }
  if (isPartlyCloudy) {
    return {
      icon: '⛅',
      tempBn,
      label: `আংশিক মেঘলা (${tempBn}° সে.)`,
      shortNote: `${areaPrefix}আংশিক মেঘলা ও আরামদায়ক (${tempBn}° সে.) — শেডের বাতাস ও লিটার দেখুন`,
      fullTitle: null,
      fullBody: null,
      isUrgent: false
    };
  }

  return {
    icon: isNight ? '🌙' : '☀️',
    tempBn,
    label: `পরিষ্কার (${tempBn}° সে.)`,
    shortNote: `${areaPrefix}আবহাওয়া ${isNight ? 'শান্ত ও স্বাভাবিক' : 'পরিষ্কার ও স্বাভাবিক'} (${tempBn}° সে., আর্দ্রতা ${humBn}%)`,
    fullTitle: null,
    fullBody: null,
    isUrgent: false
  };
}

function buildWeatherAwareCarePayload(medSlot, weather, primaryShipment, cityLabel, dhakaHour) {
  const mood = classifyWeatherForPoultry(weather, dhakaHour, cityLabel);

  if (mood.fullTitle && mood.fullBody) {
    return { title: mood.fullTitle, body: mood.fullBody };
  }

  const tempSuffix = mood.tempBn ? ` (${mood.tempBn}° সে.)` : '';

  if (medSlot === 'med_morning') {
    return {
      title: `${mood.icon} সকালের যত্ন ও আবহাওয়া${tempSuffix}`,
      body: `${mood.shortNote}। পানির পাত্র পরিষ্কার করে সকালের খাবার ও ঔষধ দিন।`
    };
  }
  if (medSlot === 'med_noon') {
    return {
      title: `${mood.icon} দুপুরের শেড ও যত্ন চেক${tempSuffix}`,
      body: `${mood.shortNote}। শেডের বাতাস চলাচল, পরিষ্কার পানি ও লিটারের অবস্থা দেখে নিন।`
    };
  }
  if (medSlot === 'med_night') {
    return {
      title: `${mood.icon} বিকালের যত্ন ও ঔষধ চেক${tempSuffix}`,
      body: `${mood.shortNote}। লিটার শুকনো আছে কি না দেখুন এবং বাকি ঔষধ থাকলে টিক দিন।`
    };
  }
  return {
    title: `${mood.icon} খামার ও আবহাওয়া আপডেট${tempSuffix}`,
    body: primaryShipment
      ? `"${primaryShipment.name}" (দিন ${toBnDigits(primaryShipment.ageDays)}): ${mood.shortNote}।`
      : `${mood.shortNote}।`
  };
}

function getDueMedicinesSummary(userObj, subsEntries, schedulesList, dhaka, primaryShipment) {
  if (!primaryShipment) return null;
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

  if (dueNow.length === 0 && overdue.length === 0) return null;
  const parts = [];
  if (dueNow.length > 0) {
    parts.push(`আজ ${toBnDigits(dueNow.length)}টি ঔষধ বাকি (${dueNow.slice(0, 2).map(m => m.name).join(', ')})`);
  }
  if (overdue.length > 0) {
    parts.push(`আগের ${toBnDigits(overdue.length)}টি টিক বাকি`);
  }
  return parts.join(' · ');
}

function getLowStockHint(userObj, sentLog, todayKey) {
  if (!userObj.stock || typeof userObj.stock !== 'object') return null;
  const stockLogKey = `${todayKey}_low_stock`;
  if (!FORCE_SLOT && sentLog[stockLogKey]) return null;
  const lowItems = Object.values(userObj.stock).filter(it => it && parseFloat(it.quantity) <= 2);
  if (lowItems.length === 0) return null;
  return {
    logKey: stockLogKey,
    text: `স্টক অ্যালার্ট: ${lowItems[0].name} প্রায় শেষ (মাত্র ${toBnDigits(lowItems[0].quantity)} ${lowItems[0].unit || ''})`
  };
}

function isWrongAppRepoScope(appScope) {
  if (!CURRENT_REPO_NAME || !appScope) return false;
  try {
    const u = new URL(appScope);
    const pathLower = u.pathname.toLowerCase();
    // Local dev or root custom domains stay allowed; filter out other GitHub Pages repo subpaths (e.g. old amarhisab repo)
    if (u.hostname.endsWith('.github.io')) {
      return !pathLower.includes(`/${CURRENT_REPO_NAME.toLowerCase()}/`);
    }
  } catch (_) {}
  return false;
}

async function deduplicateAllSubscriptions(db, usersData) {
  const allEntries = [];
  for (const [uid, userObj] of Object.entries(usersData)) {
    if (!userObj || !userObj.push_subscriptions) continue;
    for (const [subId, sub] of Object.entries(userObj.push_subscriptions)) {
      if (!sub || !sub.endpoint) continue;
      allEntries.push({
        uid,
        subId,
        sub,
        updatedAt: Number(sub.updatedAt) || 0
      });
    }
  }

  // Sort globally newest first across ALL users so same phone only keeps the latest active account/subscription
  allEntries.sort((a, b) => b.updatedAt - a.updatedAt);

  const seenEndpoints = new Set();
  const seenDeviceIds = new Set();
  const platformsWithModernSubByUid = new Map();
  for (const item of allEntries) {
    if (item.sub.deviceId && item.sub.platform) {
      if (!platformsWithModernSubByUid.has(item.uid)) {
        platformsWithModernSubByUid.set(item.uid, new Set());
      }
      platformsWithModernSubByUid.get(item.uid).add(item.sub.platform);
    }
  }

  const keptByUid = new Map();
  let prunedCount = 0;

  for (const item of allEntries) {
    if (isWrongAppRepoScope(item.sub.appScope)) {
      continue; // Don't push from this repo to a different GitHub Pages app URL
    }

    let shouldPrune = false;
    if (seenEndpoints.has(item.sub.endpoint)) {
      shouldPrune = true;
    } else if (item.sub.deviceId && seenDeviceIds.has(item.sub.deviceId)) {
      shouldPrune = true;
    } else if (!item.sub.deviceId && item.sub.platform && platformsWithModernSubByUid.get(item.uid)?.has(item.sub.platform)) {
      shouldPrune = true;
    }

    if (shouldPrune) {
      await db.del(`users/${item.uid}/push_subscriptions/${item.subId}`).catch(() => {});
      prunedCount++;
      continue;
    }

    seenEndpoints.add(item.sub.endpoint);
    if (item.sub.deviceId) seenDeviceIds.add(item.sub.deviceId);

    if (!keptByUid.has(item.uid)) keptByUid.set(item.uid, []);
    keptByUid.get(item.uid).push([item.subId, item.sub]);
  }

  return { keptByUid, prunedCount };
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

  const { keptByUid, prunedCount } = await deduplicateAllSubscriptions(db, usersData);

  let totalSent = 0;
  let totalRemoved = prunedCount;
  const globalSentTargets = new Set();

  for (const [uid, subsEntries] of keptByUid.entries()) {
    const userObj = usersData[uid];
    if (!userObj || subsEntries.length === 0) continue;

    const sentLog = userObj.push_sent_log || {};
    const userLoc = userObj.weather_location || subsEntries.find(([, s]) => s.location && s.location.lat)?.[1]?.location || DEFAULT_LOCATION;
    const primaryShipment = computePrimaryShipmentAgeDays(userObj.shipments, dhaka.todayKey);
    const liveWeather = await fetchLiveWeather(userLoc.lat, userLoc.lon);
    const mood = classifyWeatherForPoultry(liveWeather, dhaka.hour, userLoc.city);
    const medSummary = getDueMedicinesSummary(userObj, subsEntries, schedulesList, dhaka, primaryShipment);
    const lowStockHint = getLowStockHint(userObj, sentLog, dhaka.todayKey);

    const messagesToSend = [];
    const extraLogKeys = [];

    // 1. Unified Feed & Water + Live Weather Check slots (max 1 smart notification per run)
    if (activeSlots.includes('feed_water_1300')) {
      const logKey = `${dhaka.todayKey}_feed_water_1300`;
      if (FORCE_SLOT || !sentLog[logKey]) {
        const tempBadge = mood.tempBn ? ` (${mood.tempBn}° সে.)` : '';
        const notes = [mood.shortNote];
        if (medSummary) notes.push(`💊 ${medSummary}`);
        if (lowStockHint) {
          notes.push(`⚠️ ${lowStockHint.text}`);
          extraLogKeys.push(lowStockHint.logKey);
        }
        messagesToSend.push({
          logKey,
          payload: {
            title: `${mood.icon} দুপুর ১টার খাবার ও পানি চেক${tempBadge}`,
            body: `মুরগির পাত্রে খাবার ও পরিষ্কার পানি দেখে নিন। ${notes.join(' · ')}।`,
            tag: `feed_water_1300_${dhaka.todayKey}`,
            action: medSummary ? 'medicine' : 'pk_chatbot'
          }
        });
      }
    } else if (activeSlots.includes('feed_water_1530')) {
      const logKey = `${dhaka.todayKey}_feed_water_1530`;
      if (FORCE_SLOT || !sentLog[logKey]) {
        const tempBadge = mood.tempBn ? ` (${mood.tempBn}° সে.)` : '';
        const notes = [mood.shortNote];
        if (lowStockHint) {
          notes.push(`⚠️ ${lowStockHint.text}`);
          extraLogKeys.push(lowStockHint.logKey);
        }
        messagesToSend.push({
          logKey,
          payload: {
            title: `${mood.icon} বিকাল ৩:৩০টার খাবার ও পানি চেক${tempBadge}`,
            body: `বিকেলে পাত্রে পর্যাপ্ত খাবার ও পরিষ্কার পানি আছে কি না দেখে নিন। ${notes.join(' · ')}।`,
            tag: `feed_water_1530_${dhaka.todayKey}`,
            action: 'pk_chatbot'
          }
        });
      }
    } else if (activeSlots.includes('feed_water_2100')) {
      const logKey = `${dhaka.todayKey}_feed_water_2100`;
      if (FORCE_SLOT || !sentLog[logKey]) {
        const tempBadge = mood.tempBn ? ` (${mood.tempBn}° সে.)` : '';
        const notes = [mood.shortNote];
        if (medSummary) notes.push(`💊 ${medSummary}`);
        messagesToSend.push({
          logKey,
          payload: {
            title: `${mood.icon} রাত ৯টার খাবার, পানি ও শেড চেক${tempBadge}`,
            body: `ঘুমানোর আগে খাবার, পানি ও শেডের দরজা-পর্দা নিশ্চিত করুন। ${notes.join(' · ')}।`,
            tag: `feed_water_2100_${dhaka.todayKey}`,
            action: 'pk_chatbot'
          }
        });
      }
    } else {
      // 2. Morning (6 AM), Noon (12 PM), Night Med (4 PM) slots
      const medSlot = activeSlots.find(s => s.startsWith('med_'));
      if (medSlot) {
        const medLogKey = `${dhaka.todayKey}_${medSlot}`;
        if (FORCE_SLOT || !sentLog[medLogKey]) {
          // At 4 PM (right after 3:30 PM feed/water), only push if a medicine is due OR weather is urgent/alert OR low stock
          const skipSilentAfternoonUpdate = (medSlot === 'med_night' && !FORCE_SLOT && !medSummary && !mood.isUrgent && !lowStockHint);
          if (!skipSilentAfternoonUpdate) {
            if (medSummary) {
              messagesToSend.push({
                logKey: medLogKey,
                payload: {
                  title: `💊 ${primaryShipment.name} (দিন ${toBnDigits(primaryShipment.ageDays)})`,
                  body: `${medSummary}। ${mood.icon} ${mood.shortNote}।`,
                  tag: `${medSlot}_${dhaka.todayKey}`,
                  action: 'medicine'
                }
              });
            } else {
              const care = buildWeatherAwareCarePayload(medSlot, liveWeather, primaryShipment, userLoc.city, dhaka.hour);
              const stockNote = lowStockHint ? ` ⚠️ ${lowStockHint.text}` : '';
              if (lowStockHint) extraLogKeys.push(lowStockHint.logKey);
              messagesToSend.push({
                logKey: medLogKey,
                payload: {
                  title: care.title,
                  body: `${care.body}${stockNote}`,
                  tag: `${medSlot}_${dhaka.todayKey}`,
                  action: lowStockHint ? 'stock' : 'pk_chatbot'
                }
              });
            }
          }
        }
      }
    }

    if (messagesToSend.length === 0) continue;

    for (const msg of messagesToSend) {
      let deliveredAny = false;
      for (const [subId, sub] of subsEntries) {
        const globalKey = `${sub.endpoint}::${msg.logKey}`;
        if (globalSentTargets.has(globalKey)) continue;

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
          globalSentTargets.add(globalKey);
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
        for (const ek of extraLogKeys) {
          await db.put(`users/${uid}/push_sent_log/${ek}`, Date.now()).catch(() => {});
        }
      }
    }
  }

  console.log(`Push run complete. Sent: ${totalSent}, Expired/duplicate removed: ${totalRemoved}`);
}

run().catch(err => {
  console.error('Push notification script error:', err);
  process.exit(1);
});
