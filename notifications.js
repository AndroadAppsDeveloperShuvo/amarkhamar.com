/* 🔔 SMART NOTIFICATION SYSTEM
   ১. দিনের সময় অনুযায়ী পরামর্শ দেখাবে।
   ২. স্টক কমে গেলে (২ বা তার কম) অ্যালার্ট দিবে।
   ৩. PK Chat Bot থেকে দৈনিক ঔষধ বাকি বা রিমাইন্ডার মেসেজ যুক্ত করবে।
*/

// গ্লোবাল ভেরিয়েবল
let timeNotifications = [];
let stockNotifications = [];
let botNotifications = [];
let liveWeatherState = null;

function notifToBnDigits(val) {
    return String(val).replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[d]);
}

function extractBellEnsembleRain(hourly) {
    if (!hourly || typeof hourly !== 'object') return { next3hRainProb: 0, modelsRain: 0 };
    const times = Array.isArray(hourly.time) ? hourly.time : [];
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const curHour = now.getHours();
    const models = ['ecmwf_ifs025', 'gfs_seamless', 'icon_seamless', 'jma_seamless'];

    let maxProb = 0;
    let maxModelsRain = 0;

    for (let i = 0; i < times.length; i++) {
        const t = times[i];
        if (typeof t !== 'string' || !t.startsWith(`${todayStr}T`)) continue;
        const hr = parseInt(t.slice(11, 13), 10);
        if (!Number.isFinite(hr) || hr < curHour || hr > Math.min(23, curHour + 3)) continue;

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

async function fetchBellWeatherFromDirectOpenMeteo(lat, lon, city, multiModel) {
    const modelsParam = multiModel
        ? '&models=best_match,ecmwf_ifs025,gfs_seamless,icon_seamless,jma_seamless'
        : '';
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat.toFixed(4))}&longitude=${encodeURIComponent(lon.toFixed(4))}&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,rain,weather_code,wind_speed_10m,wind_gusts_10m&hourly=precipitation_probability,precipitation${modelsParam}&forecast_days=1&timezone=auto`;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 7000) : null;
    try {
        const res = await fetch(url, controller ? { signal: controller.signal } : undefined);
        if (!res.ok) return null;
        const data = await res.json();
        const cur = data && data.current;
        if (!cur || typeof cur.temperature_2m !== 'number') return null;

        const { next3hRainProb, modelsRain } = extractBellEnsembleRain(data.hourly);

        return {
            source: multiModel ? 'open-meteo-ensemble' : 'open-meteo',
            city: city && city !== 'Bangladesh' ? city : '',
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
    } catch (_) {
        return null;
    } finally {
        if (timer) clearTimeout(timer);
    }
}

async function refreshLiveWeatherForBell(forceRefresh = false) {
    if (!forceRefresh) {
        try {
            const cachedRaw = localStorage.getItem('pk_live_weather_cache');
            if (cachedRaw) {
                const cached = JSON.parse(cachedRaw);
                if (cached && cached.data && cached.fetchedAt && (Date.now() - cached.fetchedAt < 30 * 60 * 1000)) {
                    liveWeatherState = cached.data;
                    generateTimeBasedNotifications();
                    renderAllNotifications();
                    return;
                }
            }
        } catch (_) {}
    }

    if (!navigator.onLine) return;

    let lat = 23.8103;
    let lon = 90.4125;
    let city = 'Bangladesh';
    try {
        const locRaw = localStorage.getItem('pk_weather_location');
        if (locRaw) {
            const loc = JSON.parse(locRaw);
            if (loc && Number.isFinite(Number(loc.lat)) && Number.isFinite(Number(loc.lon))) {
                lat = Number(loc.lat);
                lon = Number(loc.lon);
                if (loc.city) city = loc.city;
            }
        } else {
            const geoRes = await fetch('https://get.geojs.io/v1/ip/geo.json');
            if (geoRes.ok) {
                const geo = await geoRes.json();
                if (geo && Number.isFinite(Number(geo.latitude)) && Number.isFinite(Number(geo.longitude))) {
                    lat = Number(geo.latitude);
                    lon = Number(geo.longitude);
                    city = geo.city || geo.region || 'Bangladesh';
                    localStorage.setItem('pk_weather_location', JSON.stringify({
                        lat,
                        lon,
                        city,
                        source: 'ip',
                        updatedAt: Date.now()
                    }));
                }
            }
        }
    } catch (_) {}

    const fresh = (await fetchBellWeatherFromDirectOpenMeteo(lat, lon, city, true))
        || (await fetchBellWeatherFromDirectOpenMeteo(lat, lon, city, false));
    if (!fresh) return;

    liveWeatherState = fresh;
    try {
        localStorage.setItem('pk_live_weather_cache', JSON.stringify({
            data: liveWeatherState,
            fetchedAt: Date.now()
        }));
    } catch (_) {}

    generateTimeBasedNotifications();
    renderAllNotifications();
}
window.refreshLiveWeatherForBell = refreshLiveWeatherForBell;

document.addEventListener('DOMContentLoaded', () => {
    try {
        const cachedRaw = localStorage.getItem('pk_live_weather_cache');
        if (cachedRaw) {
            const parsed = JSON.parse(cachedRaw);
            if (parsed && parsed.data) liveWeatherState = parsed.data;
        }
    } catch (_) {}

    generateTimeBasedNotifications();
    renderAllNotifications();
    refreshLiveWeatherForBell();

    setInterval(() => {
        generateTimeBasedNotifications();
        renderAllNotifications();
    }, 60000);
    setInterval(() => refreshLiveWeatherForBell(false), 30 * 60 * 1000);
});

// ফায়ারবেস অথেন্টিকেশন লিসেনার (লগইন করলে স্টক চেক শুরু হবে)
if (typeof auth !== 'undefined') {
    auth.onAuthStateChanged(user => {
        if (user) {
            startStockListener(user.uid);
        } else {
            stockNotifications = []; // লগআউট হলে স্টক অ্যালার্ট ক্লিয়ার
            botNotifications = [];
            renderAllNotifications();
        }
    });
}

function buildWeatherNotifCards(w) {
    if (!w) return [];
    const tempBn = notifToBnDigits(Math.round(w.temp));
    const appBn = notifToBnDigits(Math.round(w.apparent));
    const humBn = notifToBnDigits(Math.round(w.humidity));
    const windBn = notifToBnDigits(Math.round(Math.max(w.windSpeed || 0, w.windGusts || 0)));
    const probBn = notifToBnDigits(Math.round(w.next3hRainProb));
    const areaPrefix = (w.city && w.city !== 'Bangladesh' && w.city !== 'অটো লোকেশন') ? `${w.city}: ` : '';

    const hour = new Date().getHours();
    const isNight = hour >= 18 || hour < 5;

    const isStorm = w.weatherCode >= 95 || w.windSpeed >= 30 || (w.windGusts || 0) >= 42;
    const isRaining = w.rain >= 0.1 || w.precipitation >= 0.1 || (w.weatherCode >= 51 && w.weatherCode <= 86);
    const isDrizzle = isRaining && w.rain < 0.5 && w.weatherCode >= 51 && w.weatherCode <= 55;
    const isRainLikely = !isRaining && (w.next3hRainProb >= 65 || (w.modelsRain || 0) >= 3);
    const isFog = !isRaining && (w.weatherCode === 45 || w.weatherCode === 48);
    const isHot = !isRaining && (w.temp >= 32 || w.apparent >= 35);
    const isCold = w.temp <= 20;
    const isWarm = !isRaining && !isHot && w.temp >= 29;
    const isOvercast = w.weatherCode === 3;
    const isPartlyCloudy = w.weatherCode === 2;

    if (isStorm) {
        return [{
            icon: '⛈️',
            color: 'bg-slate-200 text-slate-700',
            title: `ঝড়-বৃষ্টির সতর্কতা (${tempBn}° সে.)`,
            desc: `${areaPrefix}দমকা বাতাস ${windBn} কিমি/ঘণ্টা ও বৃষ্টি হচ্ছে। শেডের পর্দা শক্ত করে নামিয়ে দিন এবং বাচ্চাগুলোকে নিরাপদ রাখুন।`
        }];
    }
    if (isRaining) {
        return [{
            icon: isDrizzle ? '🌦️' : '🌧️',
            color: 'bg-sky-100 text-sky-700',
            title: `${isDrizzle ? 'গুঁড়ি গুঁড়ি বৃষ্টির' : 'বৃষ্টির আবহাওয়া'} সতর্কতা (${tempBn}° সে.)`,
            desc: `${areaPrefix}এখন বৃষ্টি হচ্ছে (আর্দ্রতা ${humBn}%)। শেডের পর্দা নামিয়ে দিন, বৃষ্টির ছাট আটকান এবং লিটার (বিছানা) শুকনো রাখুন।`
        }];
    }
    if (isRainLikely) {
        return [{
            icon: '🌦️',
            color: 'bg-blue-100 text-blue-700',
            title: `বৃষ্টির সম্ভাবনা (${probBn}%, ${tempBn}° সে.)`,
            desc: `${areaPrefix}শীঘ্রই বৃষ্টি হতে পারে। শেডের পর্দা প্রস্তুত রাখুন যেন বৃষ্টির পানিতে লিটার না ভেজে।`
        }];
    }
    if (isFog) {
        return [{
            icon: '🌫️',
            color: 'bg-gray-200 text-gray-700',
            title: `কুয়াশা ও স্যাঁতসেঁতে আবহাওয়া (${tempBn}° সে.)`,
            desc: `${areaPrefix}আকাশ কুয়াশাচ্ছন্ন (আর্দ্রতা ${humBn}%)। ঠান্ডা বাতাস আটকান এবং লিটার ও বাচ্চাদের তাপমাত্রা চেক করুন।`
        }];
    }
    if (isHot) {
        return [
            {
                icon: '🔥',
                color: 'bg-red-100 text-red-600',
                title: `অতিরিক্ত গরমের সতর্কতা (${tempBn}° সে.)`,
                desc: `${areaPrefix}তাপমাত্রা বেশি (অনুভূত ${appBn}° সে.)। শেডে ফ্যান বা স্প্রে ব্যবহার করুন।`
            },
            {
                icon: '💧',
                color: 'bg-cyan-100 text-cyan-600',
                title: 'স্যালাইন ও ভিটামিন-সি',
                desc: 'অতিরিক্ত গরমে মুরগির পানিতে ভিটামিন-সি বা ইলেক্ট্রোলাইট স্যালাইন দিন।'
            }
        ];
    }
    if (isCold) {
        return [{
            icon: '❄️',
            color: 'bg-indigo-100 text-indigo-700',
            title: `ঠান্ডা আবহাওয়ার সতর্কতা (${tempBn}° সে.)`,
            desc: `${areaPrefix}তাপমাত্রা কম। শেডের পর্দা ভালোভাবে ঢেকে দিন, ঠান্ডা বাতাস আটকান এবং ব্রুডিং তাপমাত্রা চেক করুন।`
        }];
    }
    if (isWarm) {
        return [{
            icon: isOvercast ? '☁️' : (isPartlyCloudy ? '⛅' : '☀️'),
            color: 'bg-amber-100 text-amber-700',
            title: `গরম ও বাতাস চেক (${tempBn}° সে.)`,
            desc: `${areaPrefix}আর্দ্রতা ${humBn}%। শেডে পর্যাপ্ত বাতাস চলাচল ও ঠান্ডা পরিষ্কার পানির ব্যবস্থা নিশ্চিত করুন।`
        }];
    }
    if (isOvercast) {
        return [{
            icon: '☁️',
            color: 'bg-slate-100 text-slate-700',
            title: `মেঘলা আবহাওয়া (${tempBn}° সে.)`,
            desc: `${areaPrefix}আকাশ মেঘলা (আর্দ্রতা ${humBn}%)। শেডের পর্দা, বাতাস ও লিটারের অবস্থা দেখে নিন।`
        }];
    }
    if (isPartlyCloudy) {
        return [{
            icon: '⛅',
            color: 'bg-teal-100 text-teal-700',
            title: `আংশিক মেঘলা আবহাওয়া (${tempBn}° সে.)`,
            desc: `${areaPrefix}আবহাওয়া আরামদায়ক আছে (আর্দ্রতা ${humBn}%)। শেডের বাতাস ও পানি চেক করুন।`
        }];
    }
    return [{
        icon: isNight ? '🌙' : '☀️',
        color: isNight ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700',
        title: `${isNight ? 'রাতের স্বাভাবিক আবহাওয়া' : 'পরিষ্কার ও স্বাভাবিক আবহাওয়া'} (${tempBn}° সে.)`,
        desc: `${areaPrefix}বর্তমানে আবহাওয়া আরামদায়ক আছে (আর্দ্রতা ${humBn}%)। শেডের বাতাস, পানি ও লিটারের অবস্থা দেখে নিন।`
    }];
}

// ১. সময় ও লাইভ আবহাওয়ার উপর ভিত্তি করে নোটিফিকেশন তৈরি
function generateTimeBasedNotifications() {
    timeNotifications = [];
    const now = new Date();
    const hour = now.getHours();
    const totalMinutes = hour * 60 + now.getMinutes();

    // নির্ধারিত খাবার ও পানি চেক নোটিফিকেশন (দুপুর ১টা, বিকাল ৩:৩০, রাত ৯টা)
    if (totalMinutes >= 13 * 60 && totalMinutes < 15 * 60 + 30) {
        timeNotifications.push({
            icon: '🍽️',
            color: 'bg-teal-100 text-teal-700',
            title: 'দুপুর ১টার খাবার ও পানি চেক',
            desc: 'মুরগির পাত্রে পর্যাপ্ত খাবার ও পরিষ্কার পানি আছে কি না এখনই চেক করুন।'
        });
    } else if (totalMinutes >= 15 * 60 + 30 && totalMinutes < 21 * 60) {
        timeNotifications.push({
            icon: '💧',
            color: 'bg-cyan-100 text-cyan-700',
            title: 'বিকাল ৩:৩০টার খাবার ও পানি চেক',
            desc: 'বিকেলে আবার মুরগির পাত্রে খাবার ও পরিষ্কার পানি আছে কি না দেখে নিন।'
        });
    } else if (totalMinutes >= 21 * 60 || totalMinutes < 5 * 60) {
        timeNotifications.push({
            icon: '🥛',
            color: 'bg-indigo-100 text-indigo-700',
            title: 'রাত ৯টার খাবার ও পানি চেক',
            desc: 'রাতে ঘুমানোর আগে মুরগির পর্যাপ্ত খাবার ও পানি দেওয়া হয়েছে কি না নিশ্চিত করুন।'
        });
    }

    // লাইভ আবহাওয়া ভিত্তিক পরামর্শ
    const weatherCards = buildWeatherNotifCards(liveWeatherState);
    if (weatherCards.length > 0) {
        timeNotifications.push(...weatherCards);
    }

    // সকাল
    if (hour >= 5 && hour < 12) {
        timeNotifications.push({ icon: '📝', color: 'bg-blue-100 text-blue-600', title: 'সকালের খাবার ও পানি', desc: 'পানির পাত্র পরিষ্কার করে সকালের খাবার ও ঔষধ ঠিকমতো দিন।' });
    }
    // দুপুর (যদি লাইভ আবহাওয়া এখনো লোড না হয়)
    else if (hour >= 12 && hour < 16 && weatherCards.length === 0) {
        timeNotifications.push({ icon: '🌤️', color: 'bg-teal-100 text-teal-600', title: 'দুপুরের শেড চেক', desc: 'শেডের আবহাওয়া ও তাপমাত্রা বুঝে পর্দা, বাতাস ও পরিষ্কার পানির ব্যবস্থা করুন।' });
    }
    // বিকাল
    else if (hour >= 16 && hour < 19) {
        timeNotifications.push({ icon: '⛅', color: 'bg-green-100 text-green-600', title: 'বিকালের যত্ন', desc: 'লিটার (বিছানা) শুকনো আছে কি না দেখে নিন।' });
    }
    // রাত
    else if (hour >= 19 || hour < 5) {
        timeNotifications.push({ icon: '🔒', color: 'bg-gray-100 text-gray-600', title: 'রাতের নিরাপত্তা', desc: 'ঘুমানোর আগে শেডের দরজা, লাইট ও পর্দা ঠিক আছে কি না নিশ্চিত করুন।' });
    }
}

// ২. স্টক চেক করার লিসেনার (Real-time)
function startStockListener(uid) {
    if (typeof db === 'undefined') return;

    db.ref(`users/${uid}/stock`).on('value', snapshot => {
        stockNotifications = []; // আগের অ্যালার্ট ক্লিয়ার
        const data = snapshot.val();

        if (data) {
            Object.values(data).forEach(item => {
                // শর্ত: যদি পরিমাণ ২ বা তার কম হয় (১ বা ২)
                const qty = parseFloat(item.quantity);
                if (qty <= 2) {
                    stockNotifications.push({
                        icon: '⚠️',
                        color: 'bg-red-100 text-red-600 animate-pulse', // লাল এবং জ্বলবে-নিভবে
                        title: 'স্টক অ্যালার্ট!',
                        desc: `${item.name} প্রায় শেষ। মাত্র ${qty} ${item.unit} আছে।`
                    });
                }
            });
        }
        // স্টক আপডেট হলে আবার লিস্ট দেখাও
        renderAllNotifications();
    });
}

// ২.৫ PK Chat Bot থেকে সরাসরি নোটিফিকেশন যুক্ত করার মেথড
window.setPkBotNotifications = function(items) {
    botNotifications = Array.isArray(items)
        ? items.filter(it => it && (it.title || it.desc)).map(it => ({
            icon: it.icon || '🤖',
            color: it.color || 'bg-teal-100 text-teal-700',
            title: String(it.title || 'PK Chat Bot'),
            desc: String(it.desc || ''),
            tag: it.tag || 'PK Chat Bot',
            action: it.action || 'open_pk_chatbot'
        }))
        : [];
    renderAllNotifications();
};

function escapeNotifHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ৩. সব নোটিফিকেশন একসাথে দেখানো (PK Chat Bot + Stock + Time)
function renderAllNotifications() {
    const listContainer = document.getElementById('notif-list');
    const badge = document.getElementById('notif-badge');

    if (!listContainer) return;

    listContainer.innerHTML = '';

    // স্টক ও বটের জরুরি অ্যালার্ট + পূর্বের নিয়মিত সময়ের সব নোটিফিকেশন একসাথে থাকবে
    const allData = [...botNotifications, ...stockNotifications, ...timeNotifications];

    if (allData.length === 0) {
        listContainer.innerHTML = `<div class="p-8 text-center opacity-50"><p class="text-xs">কোনো নোটিফিকেশন নেই</p></div>`;
        if (badge) badge.classList.add('hidden');
        return;
    }

    allData.forEach(item => {
        const div = document.createElement('div');
        div.className = "p-4 border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition cursor-pointer";
        const tagBadge = item.tag
            ? `<span class="ml-1.5 inline-block text-[9px] font-bold px-1.5 py-0.5 rounded bg-teal-50 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 border border-teal-200/60 dark:border-teal-700">${escapeNotifHtml(item.tag)}</span>`
            : '';
        div.innerHTML = `
            <div class="flex items-start gap-3">
                <div class="w-8 h-8 rounded-full ${item.color} flex items-center justify-center flex-shrink-0">
                    ${item.icon}
                </div>
                <div class="min-w-0 flex-1">
                    <p class="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center flex-wrap gap-y-0.5">${escapeNotifHtml(item.title)}${tagBadge}</p>
                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">${escapeNotifHtml(item.desc)}</p>
                </div>
            </div>
        `;
        if (item.action === 'open_pk_chatbot') {
            div.addEventListener('click', () => {
                const dropdown = document.getElementById('notif-dropdown');
                if (dropdown) dropdown.classList.add('hidden');
                if (typeof openPkChatBot === 'function') {
                    openPkChatBot();
                }
            });
        }
        listContainer.appendChild(div);
    });

    // ব্যাজ আপডেট
    if (badge) {
        badge.innerText = allData.length;
        badge.classList.remove('hidden');
        badge.className = "absolute top-2 right-2 w-4 h-4 bg-red-600 border border-white dark:border-gray-700 rounded-full flex items-center justify-center text-[8px] text-white font-bold animate-pulse";
    }
}

// টগল ফাংশন
function toggleNotifications() {
    const dropdown = document.getElementById('notif-dropdown');
    if (dropdown) dropdown.classList.toggle('hidden');
}

// ক্লিয়ার ফাংশন
function clearNotifications() {
    const list = document.getElementById('notif-list');
    const badge = document.getElementById('notif-badge');
    if (list) list.innerHTML = `<div class="p-8 text-center opacity-50"><span class="material-symbols-outlined text-4xl mb-2">notifications_off</span><p class="text-xs">সব ক্লিয়ার!</p></div>`;
    if (badge) badge.classList.add('hidden');
}

// বাইরে ক্লিক হ্যান্ডলার
window.addEventListener('click', function(e) {
    const dropdown = document.getElementById('notif-dropdown');
    if (dropdown && !dropdown.classList.contains('hidden')) {
        const btn = e.target.closest('button');
        if (!btn || !btn.onclick || typeof btn.onclick !== 'function' || !btn.onclick.toString().includes('toggleNotifications')) {
            dropdown.classList.add('hidden');
        }
    }
});
