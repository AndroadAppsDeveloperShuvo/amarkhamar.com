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
    const subsEntries = Object.entries(userObj.push_subscriptions).filter(([, s]) => s && s.endpoint);
    if (subsEntries.length === 0) continue;

    const sentLog = userObj.push_sent_log || {};
    const messagesToSend = [];

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

    // 2. Active shipment medicine & regular farm care reminders
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
          let careTitle = '☀️ সুপ্রভাত ও সকালের ঔষধ চেক';
          let careBody = 'পানির পাত্রগুলো পরিষ্কার করেছেন কি? সকালের খাবার ও ঔষধ ঠিকমতো দিন।';

          if (medSlot === 'med_noon') {
            careTitle = '🔥 দুপুরের তাপমাত্রা ও স্যালাইন সতর্কতা';
            careBody = 'শেডের তাপমাত্রা চেক করুন। গরম বেশি থাকলে পানিতে ভিটামিন-সি বা স্যালাইন দিন।';
          } else if (medSlot === 'med_night') {
            careTitle = '⛅ বিকালের যত্ন ও রাতের ঔষধ চেক';
            careBody = 'লিটার (বিছানা) শুকনো আছে কি না দেখে নিন এবং রাতের ঔষধের সময় হলে টিক দিন।';
          } else if (medSlot === 'med_check') {
            careTitle = '💊 ঔষধ ও দৈনিক যত্নের রিমাইন্ডার';
            careBody = primaryShipment
              ? `"${primaryShipment.name}" (দিন ${toBnDigits(primaryShipment.ageDays)}): এই মুহূর্তে বাকি ঔষধ নেই; প্রতিদিন সকাল, দুপুর ও বিকালে অটো রিমাইন্ডার পাবেন।`
              : 'চালান যোগ থাকলে প্রতিদিন সকাল ৬টা, দুপুর ১২টা ও বিকাল ৪টায় স্বয়ংক্রিয় ঔষধের নোটিফিকেশন পাবেন।';
          }

          messagesToSend.push({
            logKey: medLogKey,
            payload: {
              title: careTitle,
              body: careBody,
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

  console.log(`Push run complete. Sent: ${totalSent}, Expired removed: ${totalRemoved}`);
}

run().catch(err => {
  console.error('Push notification script error:', err);
  process.exit(1);
});
