/* 📱 PWA ADD TO HOME SCREEN & BACKGROUND WEB PUSH MANAGER
   GitHub Pages + GitHub Actions পরিবেশে iPhone (iOS 16.4+ PWA) ও Android-এ
   অ্যাপ বন্ধ থাকলেও ফোন নোটিফিকেশন রিসিভ ও সাবস্ক্রিপশন সিঙ্ক করে।
*/

(function () {
    let deferredInstallPrompt = null;
    let cachedVapidPublicKey = '';
    let pendingNavAction = null;

    function isIOSDevice() {
        const ua = navigator.userAgent || '';
        return /iPad|iPhone|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    }

    function isStandaloneMode() {
        return (
            (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
            window.navigator.standalone === true
        );
    }

    function getPushSupportInfo() {
        const hasSW = 'serviceWorker' in navigator;
        const hasPush = 'PushManager' in window;
        const hasNotif = 'Notification' in window;
        const ios = isIOSDevice();
        const standalone = isStandaloneMode();
        return {
            hasSW,
            hasPush,
            hasNotif,
            ios,
            standalone,
            supported: hasSW && hasPush && hasNotif
        };
    }

    function urlBase64ToUint8Array(base64String) {
        const clean = String(base64String || '').trim();
        const padding = '='.repeat((4 - (clean.length % 4)) % 4);
        const base64 = (clean + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }

    function arrayBufferToBase64Url(buf) {
        if (!buf) return '';
        const bytes = new Uint8Array(buf);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    function hashStringId(str) {
        let h1 = 0xdeadbeef ^ str.length;
        let h2 = 0x41c6ce57 ^ str.length;
        for (let i = 0; i < str.length; i++) {
            const ch = str.charCodeAt(i);
            h1 = Math.imul(h1 ^ ch, 2654435761);
            h2 = Math.imul(h2 ^ ch, 1597334677);
        }
        h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
        h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
        return 'sub_' + (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
    }

    function notifyToast(msg) {
        if (typeof showToast === 'function') {
            showToast(msg);
        }
    }

    function getSelectedBotBreedSafe() {
        const uid = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.uid : 'guest';
        const saved = localStorage.getItem(`pk_bot_breed_${uid}`);
        if (saved) return saved;
        if (typeof currentBreedFilter !== 'undefined' && currentBreedFilter) {
            return currentBreedFilter;
        }
        return 'Broiler';
    }

    async function fetchVapidPublicKey() {
        if (cachedVapidPublicKey) return cachedVapidPublicKey;

        // ১. GitHub Pages build-time config (./push-config.json)
        try {
            const res = await fetch(`./push-config.json?t=${Date.now()}`, { cache: 'no-store' });
            if (res.ok) {
                const json = await res.json();
                if (json && typeof json.vapidPublicKey === 'string' && json.vapidPublicKey.trim()) {
                    cachedVapidPublicKey = json.vapidPublicKey.trim();
                    localStorage.setItem('pk_vapid_public_key', cachedVapidPublicKey);
                    return cachedVapidPublicKey;
                }
            }
        } catch (_) {}

        // ২. Express dev server config (/api/push-config)
        try {
            const res = await fetch('/api/push-config', { cache: 'no-store' });
            if (res.ok) {
                const json = await res.json();
                if (json && typeof json.vapidPublicKey === 'string' && json.vapidPublicKey.trim()) {
                    cachedVapidPublicKey = json.vapidPublicKey.trim();
                    localStorage.setItem('pk_vapid_public_key', cachedVapidPublicKey);
                    return cachedVapidPublicKey;
                }
            }
        } catch (_) {}

        // ৩. Firebase RTDB synced public key (breed_video_links/_push_public_key)
        try {
            if (typeof db !== 'undefined' && db) {
                const snap = await db.ref('breed_video_links/_push_public_key').once('value');
                const val = snap.val();
                if (typeof val === 'string' && val.trim()) {
                    cachedVapidPublicKey = val.trim();
                    localStorage.setItem('pk_vapid_public_key', cachedVapidPublicKey);
                    return cachedVapidPublicKey;
                }
            }
        } catch (_) {}

        // ৪. LocalStorage fallback
        const localKey = localStorage.getItem('pk_vapid_public_key');
        if (localKey && localKey.trim()) {
            cachedVapidPublicKey = localKey.trim();
            return cachedVapidPublicKey;
        }

        return '';
    }

    function getOrCreateDeviceId() {
        let id = localStorage.getItem('pk_device_id');
        if (!id) {
            id = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
            localStorage.setItem('pk_device_id', id);
        }
        return id;
    }

    const BD_PRESET_PLACES = [
        { key: 'baraigram_natore', name: 'বড়াইগ্রাম, নাটোর', subtitle: 'বড়াইগ্রাম উপজেলা · রাজশাহী বিভাগ', lat: 24.3083, lon: 89.1667 },
        { key: 'bonpara_natore', name: 'বনপাড়া, নাটোর', subtitle: 'বড়াইগ্রাম উপজেলা · রাজশাহী বিভাগ', lat: 24.2833, lon: 89.0667 },
        { key: 'natore_sadar', name: 'নাটোর সদর', subtitle: 'নাটোর জেলা · রাজশাহী বিভাগ', lat: 24.4144, lon: 88.9868 },
        { key: 'singra_natore', name: 'সিংড়া, নাটোর', subtitle: 'সিংড়া উপজেলা · রাজশাহী বিভাগ', lat: 24.4997, lon: 89.1419 },
        { key: 'lalpur_natore', name: 'লালপুর, নাটোর', subtitle: 'লালপুর উপজেলা · রাজশাহী বিভাগ', lat: 24.1833, lon: 88.9750 },
        { key: 'gurudaspur_natore', name: 'গুরুদাসপুর, নাটোর', subtitle: 'গুরুদাসপুর উপজেলা · রাজশাহী বিভাগ', lat: 24.3667, lon: 89.2500 },
        { key: 'bagatipara_natore', name: 'বাগাতিপাড়া, নাটোর', subtitle: 'বাগাতিপাড়া উপজেলা · রাজশাহী বিভাগ', lat: 24.3333, lon: 88.9500 },
        { key: 'ishwardi_pabna', name: 'ঈশ্বরদী, পাবনা', subtitle: 'ঈশ্বরদী উপজেলা · রাজশাহী বিভাগ', lat: 24.1286, lon: 89.0657 },
        { key: 'chatmohar_pabna', name: 'চাটমোহর, পাবনা', subtitle: 'চাটমোহর উপজেলা · রাজশাহী বিভাগ', lat: 24.2286, lon: 89.2939 },
        { key: 'savar_dhaka', name: 'সাভার, ঢাকা', subtitle: 'সাভার উপজেলা · ঢাকা বিভাগ', lat: 23.8583, lon: 90.2667 },
        { key: 'sreemangal_moulvibazar', name: 'শ্রীমঙ্গল, মৌলভীবাজার', subtitle: 'শ্রীমঙ্গল উপজেলা · সিলেট বিভাগ', lat: 24.3065, lon: 91.7296 },
        { key: 'bagerhat', name: 'বাগেরহাট', subtitle: 'বাগেরহাট জেলা · খুলনা বিভাগ', lat: 22.6516, lon: 89.7859 },
        { key: 'bandarban', name: 'বান্দরবান', subtitle: 'বান্দরবান জেলা · চট্টগ্রাম বিভাগ', lat: 22.1953, lon: 92.2184 },
        { key: 'barguna', name: 'বরগুনা', subtitle: 'বরগুনা জেলা · বরিশাল বিভাগ', lat: 22.1592, lon: 90.1256 },
        { key: 'barishal', name: 'বরিশাল', subtitle: 'বরিশাল জেলা · বরিশাল বিভাগ', lat: 22.7010, lon: 90.3535 },
        { key: 'bhola', name: 'ভোলা', subtitle: 'ভোলা জেলা · বরিশাল বিভাগ', lat: 22.6859, lon: 90.6482 },
        { key: 'bogura', name: 'বগুড়া', subtitle: 'বগুড়া জেলা · রাজশাহী বিভাগ', lat: 24.8465, lon: 89.3773 },
        { key: 'brahmanbaria', name: 'ব্রাহ্মণবাড়িয়া', subtitle: 'ব্রাহ্মণবাড়িয়া জেলা · চট্টগ্রাম বিভাগ', lat: 23.9571, lon: 91.1119 },
        { key: 'chandpur', name: 'চাঁদপুর', subtitle: 'চাঁদপুর জেলা · চট্টগ্রাম বিভাগ', lat: 23.2333, lon: 90.6713 },
        { key: 'chapainawabganj', name: 'চাঁপাইনবাবগঞ্জ', subtitle: 'চাঁপাইনবাবগঞ্জ জেলা · রাজশাহী বিভাগ', lat: 24.5965, lon: 88.2775 },
        { key: 'chattogram', name: 'চট্টগ্রাম', subtitle: 'চট্টগ্রাম জেলা · চট্টগ্রাম বিভাগ', lat: 22.3569, lon: 91.7832 },
        { key: 'chuadanga', name: 'চুয়াডাঙ্গা', subtitle: 'চুয়াডাঙ্গা জেলা · খুলনা বিভাগ', lat: 23.6402, lon: 88.8418 },
        { key: 'coxsbazar', name: 'কক্সবাজার', subtitle: 'কক্সবাজার জেলা · চট্টগ্রাম বিভাগ', lat: 21.4272, lon: 92.0058 },
        { key: 'cumilla', name: 'কুমিল্লা', subtitle: 'কুমিল্লা জেলা · চট্টগ্রাম বিভাগ', lat: 23.4607, lon: 91.1809 },
        { key: 'dhaka', name: 'ঢাকা', subtitle: 'ঢাকা জেলা · ঢাকা বিভাগ', lat: 23.8103, lon: 90.4125 },
        { key: 'dinajpur', name: 'দিনাজপুর', subtitle: 'দিনাজপুর জেলা · রংপুর বিভাগ', lat: 25.6279, lon: 88.6332 },
        { key: 'faridpur', name: 'ফরিদপুর', subtitle: 'ফরিদপুর জেলা · ঢাকা বিভাগ', lat: 23.6071, lon: 89.8429 },
        { key: 'feni', name: 'ফেনী', subtitle: 'ফেনী জেলা · চট্টগ্রাম বিভাগ', lat: 23.0159, lon: 91.3976 },
        { key: 'gaibandha', name: 'গাইবান্ধা', subtitle: 'গাইবান্ধা জেলা · রংপুর বিভাগ', lat: 25.3297, lon: 89.5430 },
        { key: 'gazipur', name: 'গাজীপুর', subtitle: 'গাজীপুর জেলা · ঢাকা বিভাগ', lat: 23.9999, lon: 90.4203 },
        { key: 'gopalganj', name: 'গোপালগঞ্জ', subtitle: 'গোপালগঞ্জ জেলা · ঢাকা বিভাগ', lat: 23.0051, lon: 89.8266 },
        { key: 'habiganj', name: 'হবিগঞ্জ', subtitle: 'হবিগঞ্জ জেলা · সিলেট বিভাগ', lat: 24.3749, lon: 91.4155 },
        { key: 'jamalpur', name: 'জামালপুর', subtitle: 'জামালপুর জেলা · ময়মনসিংহ বিভাগ', lat: 24.9375, lon: 89.9378 },
        { key: 'jashore', name: 'যশোর', subtitle: 'যশোর জেলা · খুলনা বিভাগ', lat: 23.1634, lon: 89.2182 },
        { key: 'jhalokati', name: 'ঝালকাঠি', subtitle: 'ঝালকাঠি জেলা · বরিশাল বিভাগ', lat: 22.6406, lon: 90.1987 },
        { key: 'jhenaidah', name: 'ঝিনাইদহ', subtitle: 'ঝিনাইদহ জেলা · খুলনা বিভাগ', lat: 23.5448, lon: 89.1539 },
        { key: 'joypurhat', name: 'জয়পুরহাট', subtitle: 'জয়পুরহাট জেলা · রাজশাহী বিভাগ', lat: 25.0968, lon: 89.0227 },
        { key: 'khagrachhari', name: 'খাগড়াছড়ি', subtitle: 'খাগড়াছড়ি জেলা · চট্টগ্রাম বিভাগ', lat: 23.1193, lon: 91.9847 },
        { key: 'khulna', name: 'খুলনা', subtitle: 'খুলনা জেলা · খুলনা বিভাগ', lat: 22.8456, lon: 89.5403 },
        { key: 'kishoreganj', name: 'কিশোরগঞ্জ', subtitle: 'কিশোরগঞ্জ জেলা · ঢাকা বিভাগ', lat: 24.4449, lon: 90.7766 },
        { key: 'kurigram', name: 'কুড়িগ্রাম', subtitle: 'কুড়িগ্রাম জেলা · রংপুর বিভাগ', lat: 25.8054, lon: 89.6362 },
        { key: 'kushtia', name: 'কুষ্টিয়া', subtitle: 'কুষ্টিয়া জেলা · খুলনা বিভাগ', lat: 23.9013, lon: 89.1205 },
        { key: 'lakshmipur', name: 'লক্ষ্মীপুর', subtitle: 'লক্ষ্মীপুর জেলা · চট্টগ্রাম বিভাগ', lat: 22.9425, lon: 90.8412 },
        { key: 'lalmonirhat', name: 'লালমনিরহাট', subtitle: 'লালমনিরহাট জেলা · রংপুর বিভাগ', lat: 25.9923, lon: 89.2847 },
        { key: 'madaripur', name: 'মাদারীপুর', subtitle: 'মাদারীপুর জেলা · ঢাকা বিভাগ', lat: 23.1641, lon: 90.1897 },
        { key: 'magura', name: 'মাগুরা', subtitle: 'মাগুরা জেলা · খুলনা বিভাগ', lat: 23.4855, lon: 89.4198 },
        { key: 'manikganj', name: 'মানিকগঞ্জ', subtitle: 'মানিকগঞ্জ জেলা · ঢাকা বিভাগ', lat: 23.8644, lon: 90.0047 },
        { key: 'meherpur', name: 'মেহেরপুর', subtitle: 'মেহেরপুর জেলা · খুলনা বিভাগ', lat: 23.7622, lon: 88.6318 },
        { key: 'moulvibazar', name: 'মৌলভীবাজার', subtitle: 'মৌলভীবাজার জেলা · সিলেট বিভাগ', lat: 24.4829, lon: 91.7774 },
        { key: 'munshiganj', name: 'মুন্সিগঞ্জ', subtitle: 'মুন্সিগঞ্জ জেলা · ঢাকা বিভাগ', lat: 23.5422, lon: 90.5305 },
        { key: 'mymensingh', name: 'ময়মনসিংহ', subtitle: 'ময়মনসিংহ জেলা · ময়মনসিংহ বিভাগ', lat: 24.7471, lon: 90.4203 },
        { key: 'naogaon', name: 'নওগাঁ', subtitle: 'নওগাঁ জেলা · রাজশাহী বিভাগ', lat: 24.7936, lon: 88.9318 },
        { key: 'narail', name: 'নড়াইল', subtitle: 'নড়াইল জেলা · খুলনা বিভাগ', lat: 23.1725, lon: 89.5127 },
        { key: 'narayanganj', name: 'নারায়ণগঞ্জ', subtitle: 'নারায়ণগঞ্জ জেলা · ঢাকা বিভাগ', lat: 23.6238, lon: 90.5000 },
        { key: 'narsingdi', name: 'নরসিংদী', subtitle: 'নরসিংদী জেলা · ঢাকা বিভাগ', lat: 23.9322, lon: 90.7154 },
        { key: 'natore', name: 'নাটোর', subtitle: 'নাটোর জেলা · রাজশাহী বিভাগ', lat: 24.4206, lon: 89.0003 },
        { key: 'netrokona', name: 'নেত্রকোনা', subtitle: 'নেত্রকোনা জেলা · ময়মনসিংহ বিভাগ', lat: 24.8709, lon: 90.7279 },
        { key: 'nilphamari', name: 'নীলফামারী', subtitle: 'নীলফামারী জেলা · রংপুর বিভাগ', lat: 25.9318, lon: 88.8560 },
        { key: 'noakhali', name: 'নোয়াখালী', subtitle: 'নোয়াখালী জেলা · চট্টগ্রাম বিভাগ', lat: 22.8696, lon: 91.0994 },
        { key: 'pabna', name: 'পাবনা', subtitle: 'পাবনা জেলা · রাজশাহী বিভাগ', lat: 24.0064, lon: 89.2372 },
        { key: 'panchagarh', name: 'পঞ্চগড়', subtitle: 'পঞ্চগড় জেলা · রংপুর বিভাগ', lat: 26.3411, lon: 88.5542 },
        { key: 'patuakhali', name: 'পটুয়াখালী', subtitle: 'পটুয়াখালী জেলা · বরিশাল বিভাগ', lat: 22.3596, lon: 90.3299 },
        { key: 'pirojpur', name: 'পিরোজপুর', subtitle: 'পিরোজপুর জেলা · বরিশাল বিভাগ', lat: 22.5841, lon: 89.9720 },
        { key: 'rajbari', name: 'রাজবাড়ী', subtitle: 'রাজবাড়ী জেলা · ঢাকা বিভাগ', lat: 23.7574, lon: 89.6445 },
        { key: 'rajshahi', name: 'রাজশাহী', subtitle: 'রাজশাহী জেলা · রাজশাহী বিভাগ', lat: 24.3745, lon: 88.6042 },
        { key: 'rangamati', name: 'রাঙামাটি', subtitle: 'রাঙামাটি জেলা · চট্টগ্রাম বিভাগ', lat: 22.6533, lon: 92.1789 },
        { key: 'rangpur', name: 'রংপুর', subtitle: 'রংপুর জেলা · রংপুর বিভাগ', lat: 25.7439, lon: 89.2752 },
        { key: 'satkhira', name: 'সাতক্ষীরা', subtitle: 'সাতক্ষীরা জেলা · খুলনা বিভাগ', lat: 22.7185, lon: 89.0705 },
        { key: 'shariatpur', name: 'শরীয়তপুর', subtitle: 'শরীয়তপুর জেলা · ঢাকা বিভাগ', lat: 23.2423, lon: 90.4348 },
        { key: 'sherpur', name: 'শেরপুর', subtitle: 'শেরপুর জেলা · ময়মনসিংহ বিভাগ', lat: 25.0205, lon: 90.0153 },
        { key: 'sirajganj', name: 'সিরাজগঞ্জ', subtitle: 'সিরাজগঞ্জ জেলা · রাজশাহী বিভাগ', lat: 24.4534, lon: 89.7007 },
        { key: 'sunamganj', name: 'সুনামগঞ্জ', subtitle: 'সুনামগঞ্জ জেলা · সিলেট বিভাগ', lat: 25.0658, lon: 91.3950 },
        { key: 'sylhet', name: 'সিলেট', subtitle: 'সিলেট জেলা · সিলেট বিভাগ', lat: 24.8949, lon: 91.8687 },
        { key: 'tangail', name: 'টাঙ্গাইল', subtitle: 'টাঙ্গাইল জেলা · ঢাকা বিভাগ', lat: 24.2513, lon: 89.9167 },
        { key: 'thakurgaon', name: 'ঠাকুরগাঁও', subtitle: 'ঠাকুরগাঁও জেলা · রংপুর বিভাগ', lat: 26.0337, lon: 88.4617 }
    ];

    let weatherSearchDebounceTimer = null;
    let weatherSearchSeq = 0;

    function findNearestPresetName(lat, lon) {
        let nearest = null;
        let minDist = Infinity;
        for (const d of BD_PRESET_PLACES) {
            const dLat = d.lat - lat;
            const dLon = d.lon - lon;
            const distSq = dLat * dLat + dLon * dLon;
            if (distSq < minDist) {
                minDist = distSq;
                nearest = d;
            }
        }
        return nearest ? nearest.name : 'বর্তমান অবস্থান (GPS)';
    }

    async function reverseLookupPlaceName(lat, lon) {
        try {
            const res = await fetch(`https://photon.komoot.io/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`);
            if (res.ok) {
                const json = await res.json();
                const feat = json && Array.isArray(json.features) ? json.features[0] : null;
                const p = feat && feat.properties;
                if (p) {
                    const primary = p.name || p.locality || p.city || p.county;
                    const secondary = p.county && p.county !== primary ? p.county : (p.state || '');
                    if (primary) {
                        return secondary ? `${primary}, ${secondary}` : primary;
                    }
                }
            }
        } catch (_) {}
        return findNearestPresetName(lat, lon);
    }

    function readSavedWeatherLocation() {
        try {
            const raw = localStorage.getItem('pk_weather_location');
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (parsed && Number.isFinite(Number(parsed.lat)) && Number.isFinite(Number(parsed.lon))) {
                return parsed;
            }
        } catch (_) {}
        return null;
    }

    function updateWeatherLocationUI(loc) {
        const statusEl = document.getElementById('weather-area-status');
        const current = loc || readSavedWeatherLocation();

        if (statusEl) {
            if (!current) {
                statusEl.innerText = 'অটো লোকেশন';
            } else if (current.source === 'gps') {
                statusEl.innerText = `GPS: ${current.city || 'নিখুঁত অবস্থান'}`;
            } else if (current.source === 'manual') {
                statusEl.innerText = current.city || 'নির্বাচিত এলাকা';
            } else {
                statusEl.innerText = current.city && current.city !== 'Bangladesh'
                    ? `অটো (${current.city})`
                    : 'অটো লোকেশন';
            }
        }
    }

    async function persistWeatherLocation(loc, uid) {
        if (!loc) return;
        try {
            localStorage.setItem('pk_weather_location', JSON.stringify(loc));
        } catch (_) {}
        updateWeatherLocationUI(loc);

        const activeUid = uid || ((typeof currentUser !== 'undefined' && currentUser) ? currentUser.uid : null);
        if (activeUid && typeof db !== 'undefined' && db) {
            db.ref(`users/${activeUid}/weather_location`).set(loc).catch(() => {});
            try {
                if ('serviceWorker' in navigator) {
                    const reg = await navigator.serviceWorker.getRegistration();
                    const sub = reg && reg.pushManager ? await reg.pushManager.getSubscription() : null;
                    if (sub && sub.endpoint) {
                        const subId = hashStringId(sub.endpoint);
                        db.ref(`users/${activeUid}/push_subscriptions/${subId}/location`).set(loc).catch(() => {});
                    }
                }
            } catch (_) {}
        }
    }

    async function detectAndSyncWeatherLocation(uid) {
        let loc = readSavedWeatherLocation();

        if ((!loc || (loc.source !== 'manual' && loc.source !== 'gps')) && uid && typeof db !== 'undefined' && db) {
            try {
                const snap = await db.ref(`users/${uid}/weather_location`).once('value');
                const remote = snap.val();
                if (remote && Number.isFinite(Number(remote.lat)) && Number.isFinite(Number(remote.lon)) && (remote.source === 'manual' || remote.source === 'gps')) {
                    loc = remote;
                    localStorage.setItem('pk_weather_location', JSON.stringify(loc));
                    updateWeatherLocationUI(loc);
                    return loc;
                }
            } catch (_) {}
        }

        if (loc && (loc.source === 'manual' || loc.source === 'gps')) {
            await persistWeatherLocation(loc, uid);
            return loc;
        }

        const isStale = !loc || !loc.updatedAt || (Date.now() - loc.updatedAt > 12 * 60 * 60 * 1000);
        if (isStale && navigator.onLine) {
            try {
                const res = await fetch('https://get.geojs.io/v1/ip/geo.json');
                if (res.ok) {
                    const geo = await res.json();
                    if (geo && Number.isFinite(Number(geo.latitude)) && Number.isFinite(Number(geo.longitude))) {
                        loc = {
                            lat: Number(geo.latitude),
                            lon: Number(geo.longitude),
                            city: geo.city || geo.region || 'Bangladesh',
                            source: 'ip',
                            updatedAt: Date.now()
                        };
                        localStorage.setItem('pk_weather_location', JSON.stringify(loc));
                    }
                }
            } catch (_) {}
        }

        if (loc) {
            await persistWeatherLocation(loc, uid);
        } else {
            updateWeatherLocationUI(null);
        }
        return loc;
    }

    function renderWeatherPlaceResults(places, searchingRemote) {
        const container = document.getElementById('weather-location-results');
        if (!container) return;
        container.innerHTML = '';

        const current = readSavedWeatherLocation();

        if (places.length === 0 && !searchingRemote) {
            const empty = document.createElement('p');
            empty.className = 'text-center text-xs text-gray-400 py-6';
            empty.textContent = 'কোনো স্থান পাওয়া যায়নি। গ্রাম/উপজেলার নাম ইংরেজিতে বা বাংলায় লিখে চেষ্টা করুন।';
            container.appendChild(empty);
            return;
        }

        places.forEach((p) => {
            const isSelected = current && current.city === p.name && Math.abs(Number(current.lat) - Number(p.lat)) < 0.02;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `w-full flex items-center justify-between gap-2 p-2.5 rounded-xl text-left transition ${
                isSelected
                    ? 'bg-teal-700 text-white font-bold shadow-sm'
                    : 'bg-gray-50 dark:bg-gray-700/50 hover:bg-teal-50 dark:hover:bg-teal-900/30 text-gray-800 dark:text-gray-100'
            }`;

            const left = document.createElement('div');
            left.className = 'min-w-0 flex-1';

            const title = document.createElement('p');
            title.className = 'text-xs font-bold truncate';
            title.textContent = p.name;

            const sub = document.createElement('p');
            sub.className = `text-[10px] truncate mt-0.5 ${isSelected ? 'text-teal-100' : 'text-gray-500 dark:text-gray-400'}`;
            sub.textContent = p.subtitle || 'বাংলাদেশ';

            left.appendChild(title);
            left.appendChild(sub);
            btn.appendChild(left);

            const icon = document.createElement('span');
            icon.className = `material-symbols-outlined text-base flex-shrink-0 ${isSelected ? 'text-white' : 'text-gray-400'}`;
            icon.textContent = isSelected ? 'check_circle' : 'chevron_right';
            btn.appendChild(icon);

            btn.addEventListener('click', () => selectCustomWeatherPlace(p));
            container.appendChild(btn);
        });

        if (searchingRemote) {
            const loadingRow = document.createElement('p');
            loadingRow.className = 'text-center text-[11px] text-teal-600 dark:text-teal-400 py-2 font-medium';
            loadingRow.textContent = 'বাংলাদেশের গ্রাম ও উপজেলা খোঁজা হচ্ছে...';
            container.appendChild(loadingRow);
        }
    }

    async function searchBangladeshPlacesRemote(query) {
        const clean = String(query || '').trim();
        if (clean.length < 2 || !navigator.onLine) return [];

        const results = [];
        const seen = new Set();

        const addUnique = (name, subtitle, lat, lon) => {
            if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
            const dedupeKey = `${name.toLowerCase()}_${lat.toFixed(2)}_${lon.toFixed(2)}`;
            if (seen.has(dedupeKey)) return;
            seen.add(dedupeKey);
            results.push({ name, subtitle, lat, lon });
        };

        try {
            const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(clean)}&lat=23.685&lon=90.3563&limit=15`;
            const res = await fetch(photonUrl);
            if (res.ok) {
                const json = await res.json();
                const feats = Array.isArray(json.features) ? json.features : [];
                for (const f of feats) {
                    const pr = f && f.properties;
                    const coords = f && f.geometry && f.geometry.coordinates;
                    if (!pr || !Array.isArray(coords) || coords.length < 2) continue;
                    if (pr.countrycode && String(pr.countrycode).toUpperCase() !== 'BD') continue;

                    const lon = Number(coords[0]);
                    const lat = Number(coords[1]);
                    const rawName = pr.name || pr.city || pr.county;
                    if (!rawName) continue;

                    const parts = [];
                    if (pr.city && pr.city !== rawName) parts.push(pr.city);
                    if (pr.county && pr.county !== rawName) parts.push(pr.county);
                    if (pr.state) parts.push(pr.state);
                    const subtitle = parts.join(', ') || 'বাংলাদেশ';

                    const shortLabel = (pr.county && !rawName.includes(pr.county) && pr.county.length < 28)
                        ? `${rawName}, ${pr.county.replace(/\s*উপজেলা$/, '')}`
                        : rawName;
                    addUnique(shortLabel, subtitle, lat, lon);
                }
            }
        } catch (_) {}

        if (results.length < 5) {
            try {
                const omUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(clean)}&count=10&language=en&countryCode=BD`;
                const res = await fetch(omUrl);
                if (res.ok) {
                    const json = await res.json();
                    const list = Array.isArray(json.results) ? json.results : [];
                    for (const r of list) {
                        const subParts = [r.admin3, r.admin2, r.admin1].filter(Boolean);
                        addUnique(r.name, subParts.join(', ') || 'Bangladesh', Number(r.latitude), Number(r.longitude));
                    }
                }
            } catch (_) {}
        }

        return results;
    }

    function filterLocalPresetPlaces(query) {
        const q = String(query || '').trim().toLowerCase();
        if (!q) return BD_PRESET_PLACES;
        return BD_PRESET_PLACES.filter(p =>
            p.name.toLowerCase().includes(q) ||
            (p.subtitle && p.subtitle.toLowerCase().includes(q)) ||
            p.key.toLowerCase().includes(q)
        );
    }

    function onWeatherLocationSearchInput(query) {
        const localMatches = filterLocalPresetPlaces(query);
        const clean = String(query || '').trim();
        const shouldSearchRemote = clean.length >= 2 && navigator.onLine;
        renderWeatherPlaceResults(localMatches, shouldSearchRemote);

        if (weatherSearchDebounceTimer) clearTimeout(weatherSearchDebounceTimer);
        if (!shouldSearchRemote) return;

        const seq = ++weatherSearchSeq;
        weatherSearchDebounceTimer = setTimeout(async () => {
            const remoteMatches = await searchBangladeshPlacesRemote(clean);
            if (seq !== weatherSearchSeq) return;

            const merged = [...localMatches];
            for (const rm of remoteMatches) {
                const dup = merged.some(m => m.name === rm.name && Math.abs(m.lat - rm.lat) < 0.02 && Math.abs(m.lon - rm.lon) < 0.02);
                if (!dup) merged.push(rm);
            }
            renderWeatherPlaceResults(merged, false);
        }, 320);
    }

    function openWeatherLocationModal() {
        const modal = document.getElementById('weather-location-modal');
        const input = document.getElementById('weather-location-search');
        if (input) input.value = '';
        renderWeatherPlaceResults(BD_PRESET_PLACES, false);
        if (modal) modal.classList.remove('hidden');
        if (input) setTimeout(() => input.focus(), 120);
    }

    function closeWeatherLocationModal() {
        const modal = document.getElementById('weather-location-modal');
        if (modal) modal.classList.add('hidden');
    }

    async function selectCustomWeatherPlace(place) {
        if (!place || !Number.isFinite(Number(place.lat)) || !Number.isFinite(Number(place.lon))) return;
        const loc = {
            lat: Number(Number(place.lat).toFixed(4)),
            lon: Number(Number(place.lon).toFixed(4)),
            city: place.name,
            source: 'manual',
            updatedAt: Date.now()
        };
        localStorage.removeItem('pk_live_weather_cache');
        await persistWeatherLocation(loc);
        closeWeatherLocationModal();
        if (typeof window.refreshLiveWeatherForBell === 'function') {
            window.refreshLiveWeatherForBell(true);
        }
        notifyToast(`📍 আবহাওয়ার এলাকা সেট হয়েছে: ${place.name}`);
    }

    async function selectAutoWeatherLocation() {
        localStorage.removeItem('pk_weather_location');
        localStorage.removeItem('pk_live_weather_cache');
        const uid = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.uid : null;
        if (uid && typeof db !== 'undefined' && db) {
            db.ref(`users/${uid}/weather_location`).remove().catch(() => {});
        }
        closeWeatherLocationModal();
        await detectAndSyncWeatherLocation(uid);
        if (typeof window.refreshLiveWeatherForBell === 'function') {
            window.refreshLiveWeatherForBell(true);
        }
        notifyToast('📍 অটো আবহাওয়া লোকেশন চালু হয়েছে');
    }

    function detectGpsWeatherLocation(fromModal = false) {
        if (!('geolocation' in navigator)) {
            notifyToast('⚠️ আপনার ডিভাইসে GPS সাপোর্ট নেই — তালিকা থেকে এলাকা খুঁজুন');
            return;
        }
        const btn = document.getElementById(fromModal ? 'weather-modal-gps-btn' : 'weather-gps-btn');
        if (btn) btn.classList.add('animate-pulse');

        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const lat = Number(pos.coords.latitude.toFixed(4));
                const lon = Number(pos.coords.longitude.toFixed(4));
                const nearName = await reverseLookupPlaceName(lat, lon);
                if (btn) btn.classList.remove('animate-pulse');

                const loc = {
                    lat,
                    lon,
                    city: nearName,
                    source: 'gps',
                    updatedAt: Date.now()
                };
                localStorage.removeItem('pk_live_weather_cache');
                await persistWeatherLocation(loc);
                if (fromModal) closeWeatherLocationModal();
                if (typeof window.refreshLiveWeatherForBell === 'function') {
                    window.refreshLiveWeatherForBell(true);
                }
                notifyToast(`📍 নিখুঁত GPS লোকেশন সেট হয়েছে (${nearName})`);
            },
            () => {
                if (btn) btn.classList.remove('animate-pulse');
                notifyToast('⚠️ GPS পারমিশন পাওয়া যায়নি — তালিকা থেকে গ্রাম/উপজেলা খুঁজুন');
            },
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
        );
    }

    async function saveSubscriptionToFirebase(sub, uid) {
        if (!sub || !uid || typeof db === 'undefined' || !db) return false;
        const jsonSub = typeof sub.toJSON === 'function' ? sub.toJSON() : sub;
        if (!jsonSub || !jsonSub.endpoint || !jsonSub.keys) return false;

        const subId = hashStringId(jsonSub.endpoint);
        const deviceId = getOrCreateDeviceId();
        const platform = isIOSDevice() ? 'ios' : (/android/i.test(navigator.userAgent) ? 'android' : 'web');
        const location = await detectAndSyncWeatherLocation(uid);
        let appScope = '';
        try {
            const reg = await navigator.serviceWorker.getRegistration();
            if (reg && reg.scope) appScope = reg.scope;
        } catch (_) {}

        const payload = {
            endpoint: jsonSub.endpoint,
            keys: {
                p256dh: jsonSub.keys.p256dh || '',
                auth: jsonSub.keys.auth || ''
            },
            deviceId,
            appScope,
            breed: getSelectedBotBreedSafe(),
            platform,
            isStandalone: isStandaloneMode(),
            updatedAt: Date.now()
        };
        if (location) {
            payload.location = location;
        }

        // একই ডিভাইসে আগের কোনো অন্য একাউন্টে লগইন থাকলে সেই পুরনো সাবস্ক্রিপশন সরানো (ডাবল মেসেজ বন্ধ)
        try {
            const prevUid = localStorage.getItem('pk_last_push_uid');
            if (prevUid && prevUid !== uid) {
                db.ref(`users/${prevUid}/push_subscriptions/${subId}`).remove().catch(() => {});
                const prevSubId = localStorage.getItem(`pk_push_sub_id_${prevUid}`);
                if (prevSubId && prevSubId !== subId) {
                    db.ref(`users/${prevUid}/push_subscriptions/${prevSubId}`).remove().catch(() => {});
                }
            }
            localStorage.setItem('pk_last_push_uid', uid);
        } catch (_) {}

        // একই ডিভাইসের পুরনো ডুপ্লিকেট বা পুরনো অ্যাপ-লিংকের সাবস্ক্রিপশন অটো পরিষ্কার করা
        try {
            const existingSnap = await db.ref(`users/${uid}/push_subscriptions`).once('value');
            const existing = existingSnap.val() || {};
            const removals = [];
            for (const [oldId, oldVal] of Object.entries(existing)) {
                if (oldId === subId || !oldVal) continue;
                const sameDevice = oldVal.deviceId && oldVal.deviceId === deviceId;
                const legacySamePlatform = !oldVal.deviceId && oldVal.platform === platform;
                const oldScopeSamePlatform = oldVal.appScope && appScope && oldVal.appScope !== appScope && oldVal.platform === platform;
                if (sameDevice || legacySamePlatform || oldScopeSamePlatform) {
                    removals.push(db.ref(`users/${uid}/push_subscriptions/${oldId}`).remove().catch(() => {}));
                }
            }
            if (removals.length > 0) await Promise.all(removals);
        } catch (_) {}

        await db.ref(`users/${uid}/push_subscriptions/${subId}`).set(payload);
        localStorage.setItem(`pk_push_sub_id_${uid}`, subId);
        return true;
    }

    async function updatePushSettingsUI() {
        const cardEl = document.getElementById('pwa-push-settings-card');
        const installRow = document.getElementById('pwa-install-row');
        const pushRow = document.getElementById('pwa-push-row');
        const statusEl = document.getElementById('pwa-push-status');
        const pushBtn = document.getElementById('pwa-push-btn');
        const pushBtnText = document.getElementById('pwa-push-btn-text');
        const testBtn = document.getElementById('pwa-push-test-btn');
        const installDesc = document.getElementById('pwa-install-desc');
        const iosHint = document.getElementById('pwa-ios-hint');

        const info = getPushSupportInfo();
        const showInstallRow = !info.standalone;
        const perm = info.hasNotif ? Notification.permission : 'default';

        // হোম স্ক্রিনে যোগ করা থাকলে ইন্সটল অপশন হাইড থাকবে
        if (installRow) {
            if (!showInstallRow) {
                installRow.classList.add('hidden');
            } else {
                installRow.classList.remove('hidden');
                if (installDesc) {
                    installDesc.innerText = info.ios
                        ? 'iPhone-এ Safari Share → Add to Home Screen দিয়ে যুক্ত করুন'
                        : 'হোম স্ক্রিনে অ্যাপ হিসেবে যুক্ত করুন (১ ক্লিকেই চলবে)';
                }
            }
        }

        if (iosHint) {
            if (info.ios && !info.standalone) {
                iosHint.classList.remove('hidden');
            } else {
                iosHint.classList.add('hidden');
            }
        }

        // নোটিফিকেশনের পারমিশন দেওয়া থাকলে ফোন নোটিফিকেশন অংশ হাইড থাকবে;
        // শুধু যখন পারমিশন বাকি থাকবে বা iOS ব্রাউজারে থাকবে তখনই দেখাবে
        const isIosBrowserOnly = info.ios && !info.standalone;
        const isPermissionGranted = !isIosBrowserOnly && info.supported && perm === 'granted';
        const showPushRow = isIosBrowserOnly || (info.supported && !isPermissionGranted);

        if (pushRow) {
            if (showPushRow) {
                pushRow.classList.remove('hidden');
            } else {
                pushRow.classList.add('hidden');
            }
        }

        // হোম স্ক্রিন + নোটিফিকেশন দুটোই চালু থাকলে পুরো কার্ডই সম্পূর্ণ হাইড হবে
        if (cardEl) {
            if (!showInstallRow && !showPushRow) {
                cardEl.classList.add('hidden');
            } else {
                cardEl.classList.remove('hidden');
            }
        }

        if (!showPushRow || !statusEl || !pushBtn) return;

        if (isIosBrowserOnly) {
            statusEl.innerText = 'iPhone-এ প্রথমে Home Screen-এ যুক্ত করে সেখান থেকে অ্যাপ খুলুন';
            statusEl.className = 'text-xs text-gray-500 dark:text-gray-400 mt-0.5';
            if (pushBtnText) pushBtnText.innerText = 'নিয়ম দেখুন';
            if (testBtn) testBtn.classList.add('hidden');
            return;
        }

        if (perm === 'denied') {
            statusEl.innerText = 'ফোন/ব্রাউজার সেটিংস থেকে Notification অনুমতি Allow করুন';
            statusEl.className = 'text-xs text-red-500 mt-0.5';
            if (pushBtnText) pushBtnText.innerText = 'চালু করুন';
            if (testBtn) testBtn.classList.add('hidden');
            return;
        }

        statusEl.innerText = 'অ্যাপ বন্ধ থাকলেও ফোনে ঔষধ, খাবার ও পানির রিমাইন্ডার পান';
        statusEl.className = 'text-xs text-gray-500 dark:text-gray-400 mt-0.5';
        if (pushBtnText) pushBtnText.innerText = 'চালু করুন';
        if (testBtn) testBtn.classList.add('hidden');
    }

    function openIosInstallGuide() {
        const modal = document.getElementById('ios-install-guide-modal');
        if (modal) modal.classList.remove('hidden');
    }

    function closeIosInstallGuide() {
        const modal = document.getElementById('ios-install-guide-modal');
        if (modal) modal.classList.add('hidden');
    }

    async function triggerPwaInstall() {
        const info = getPushSupportInfo();
        if (info.standalone) {
            notifyToast('✅ অ্যাপটি ইতিমধ্যেই হোম স্ক্রিনে যুক্ত করা আছে');
            return;
        }

        if (deferredInstallPrompt) {
            try {
                deferredInstallPrompt.prompt();
                const choice = await deferredInstallPrompt.userChoice;
                if (choice && choice.outcome === 'accepted') {
                    notifyToast('🎉 হোম স্ক্রিনে অ্যাপ যুক্ত করা হয়েছে!');
                    deferredInstallPrompt = null;
                }
            } catch (_) {}
            updatePushSettingsUI();
            return;
        }

        if (info.ios) {
            openIosInstallGuide();
            return;
        }

        notifyToast('ℹ️ ব্রাউজার মেনু (⋮) থেকে "Add to Home Screen / Install app" চাপুন');
    }

    async function enablePkPhonePush(silentMode = false) {
        const info = getPushSupportInfo();

        if (info.ios && !info.standalone) {
            if (!silentMode) {
                openIosInstallGuide();
                notifyToast('📱 iPhone-এ নোটিফিকেশনের জন্য আগে Home Screen থেকে অ্যাপটি খুলুন');
            }
            updatePushSettingsUI();
            return false;
        }

        if (!info.supported) {
            if (!silentMode) {
                notifyToast('⚠️ এই ব্রাউজারে পুশ নোটিফিকেশন সমর্থিত নয়');
            }
            updatePushSettingsUI();
            return false;
        }

        let permission = Notification.permission;
        if (permission !== 'granted') {
            if (silentMode) {
                updatePushSettingsUI();
                return false;
            }
            permission = await Notification.requestPermission();
        }

        if (permission !== 'granted') {
            if (!silentMode) {
                notifyToast('⚠️ নোটিফিকেশন অনুমতি দেওয়া হয়নি — ফোনের সেটিংস থেকে Allow করুন');
            }
            updatePushSettingsUI();
            return false;
        }

        const reg = await navigator.serviceWorker.ready;
        if (!reg || !reg.pushManager) {
            if (!silentMode) notifyToast('⚠️ সার্ভিস ওয়ার্কার প্রস্তুত নয়');
            return false;
        }

        const vapidKey = await fetchVapidPublicKey();
        if (!vapidKey) {
            if (!silentMode) {
                notifyToast('⚙️ সার্ভারে VAPID Key সেট করা নেই (অ্যাপ-ভিতরের বেল নোটিফিকেশন চালু আছে)');
            }
            updatePushSettingsUI();
            return false;
        }

        const appServerKey = urlBase64ToUint8Array(vapidKey);
        let sub = await reg.pushManager.getSubscription();

        // Check if existing subscription belongs to the same VAPID key
        if (sub && sub.options && sub.options.applicationServerKey) {
            const existingKeyB64 = arrayBufferToBase64Url(sub.options.applicationServerKey);
            if (existingKeyB64 && existingKeyB64 !== vapidKey) {
                try { await sub.unsubscribe(); } catch (_) {}
                sub = null;
            }
        }

        if (!sub) {
            sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: appServerKey
            });
        }

        const uid = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.uid : null;
        if (uid) {
            await saveSubscriptionToFirebase(sub, uid);
            if (!silentMode) {
                notifyToast('🔔 ফোন নোটিফিকেশন সফলভাবে চালু ও সিঙ্ক হয়েছে ✅');
            }
        } else if (!silentMode) {
            notifyToast('ℹ️ সিঙ্ক সম্পন্ন করতে আপনার একাউন্টে লগইন করুন');
        }

        updatePushSettingsUI();
        return true;
    }

    async function sendTestPhoneNotification() {
        const info = getPushSupportInfo();
        if (info.ios && !info.standalone) {
            openIosInstallGuide();
            return;
        }

        if (!('Notification' in window)) {
            notifyToast('⚠️ এই ব্রাউজার নোটিফিকেশন সাপোর্ট করে না');
            return;
        }

        if (Notification.permission !== 'granted') {
            const perm = await Notification.requestPermission();
            if (perm !== 'granted') {
                notifyToast('⚠️ নোটিফিকেশন পারমিশন দেওয়া হয়নি');
                return;
            }
        }

        try {
            if ('serviceWorker' in navigator) {
                const reg = await navigator.serviceWorker.ready;
                if (reg && typeof reg.showNotification === 'function') {
                    await reg.showNotification('আমার খামার - টেস্ট নোটিফিকেশন 🐔', {
                        body: 'সফলভাবে কাজ করছে! দুপুর ১টা, বিকাল ৩:৩০, রাত ৯টা ও প্রতিদিনের ঔষধের রিমাইন্ডার পাবেন।',
                        icon: './icon.png',
                        badge: './icon.png',
                        tag: 'amar-hisab-test',
                        vibrate: [200, 100, 200],
                        data: { action: 'pk_chatbot' }
                    });
                    notifyToast('✅ টেস্ট নোটিফিকেশন পাঠানো হয়েছে');
                    return;
                }
            }
            new Notification('আমার খামার - টেস্ট নোটিফিকেশন 🐔', {
                body: 'ফোন নোটিফিকেশন চালু আছে!'
            });
            notifyToast('✅ টেস্ট নোটিফিকেশন পাঠানো হয়েছে');
        } catch (err) {
            console.warn('Test notification error:', err);
            notifyToast('⚠️ টেস্ট নোটিফিকেশন দেখানো যায়নি');
        }
    }

    async function syncPushSubscriptionBreed(breed) {
        try {
            const uid = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.uid : null;
            if (!uid || typeof db === 'undefined' || !db) return;
            if (!('serviceWorker' in navigator)) return;
            const reg = await navigator.serviceWorker.getRegistration();
            if (!reg || !reg.pushManager) return;
            const sub = await reg.pushManager.getSubscription();
            if (!sub || !sub.endpoint) return;
            const subId = hashStringId(sub.endpoint);
            await db.ref(`users/${uid}/push_subscriptions/${subId}/breed`).set(breed || 'Broiler');
        } catch (_) {}
    }

    function executeNotificationAction(action) {
        if (!action) return;
        if (typeof currentUser === 'undefined' || !currentUser) {
            pendingNavAction = action;
            return;
        }
        pendingNavAction = null;

        setTimeout(() => {
            if (action === 'pk_chatbot' && typeof openPkChatBot === 'function') {
                openPkChatBot();
            } else if (action === 'medicine' && typeof openMedicinePage === 'function') {
                openMedicinePage();
            } else if (action === 'stock' && typeof openStockPage === 'function') {
                openStockPage();
            }
        }, 250);
    }

    // Install prompt lifecycle
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredInstallPrompt = e;
        updatePushSettingsUI();
    });

    window.addEventListener('appinstalled', () => {
        deferredInstallPrompt = null;
        notifyToast('🎉 অ্যাপটি হোম স্ক্রিনে যুক্ত হয়েছে!');
        updatePushSettingsUI();
    });

    // Listen to Service Worker click messages
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'PK_NAVIGATE' && event.data.action) {
                executeNotificationAction(event.data.action);
            }
        });
    }

    // Read URL query (?open=...) immediately on cold start before auth fires
    try {
        const params = new URLSearchParams(window.location.search);
        const openTarget = params.get('open');
        if (openTarget) {
            pendingNavAction = openTarget;
            if (window.history && window.history.replaceState) {
                const cleanUrl = window.location.pathname + window.location.hash;
                window.history.replaceState({}, document.title, cleanUrl);
            }
        }
    } catch (_) {}

    document.addEventListener('DOMContentLoaded', () => {
        updatePushSettingsUI();
        updateWeatherLocationUI();
    });

    // Silent sync + deep-link navigation after auth
    if (typeof auth !== 'undefined' && auth) {
        auth.onAuthStateChanged((user) => {
            if (user) {
                setTimeout(() => {
                    detectAndSyncWeatherLocation(user.uid).catch(() => {});
                    enablePkPhonePush(true).catch(() => {});
                    if (pendingNavAction) {
                        executeNotificationAction(pendingNavAction);
                    }
                }, 800);
            }
            updatePushSettingsUI();
            updateWeatherLocationUI();
        });
    }

    window.triggerPwaInstall = triggerPwaInstall;
    window.openIosInstallGuide = openIosInstallGuide;
    window.closeIosInstallGuide = closeIosInstallGuide;
    window.enablePkPhonePush = () => enablePkPhonePush(false);
    window.sendTestPhoneNotification = sendTestPhoneNotification;
    window.syncPushSubscriptionBreed = syncPushSubscriptionBreed;
    window.updatePushSettingsUI = updatePushSettingsUI;
    window.openWeatherLocationModal = openWeatherLocationModal;
    window.closeWeatherLocationModal = closeWeatherLocationModal;
    window.onWeatherLocationSearchInput = onWeatherLocationSearchInput;
    window.selectAutoWeatherLocation = selectAutoWeatherLocation;
    window.detectGpsWeatherLocation = detectGpsWeatherLocation;
})();
