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

    async function saveSubscriptionToFirebase(sub, uid) {
        if (!sub || !uid || typeof db === 'undefined' || !db) return false;
        const jsonSub = typeof sub.toJSON === 'function' ? sub.toJSON() : sub;
        if (!jsonSub || !jsonSub.endpoint || !jsonSub.keys) return false;

        const subId = hashStringId(jsonSub.endpoint);
        const payload = {
            endpoint: jsonSub.endpoint,
            keys: {
                p256dh: jsonSub.keys.p256dh || '',
                auth: jsonSub.keys.auth || ''
            },
            breed: getSelectedBotBreedSafe(),
            platform: isIOSDevice() ? 'ios' : (/android/i.test(navigator.userAgent) ? 'android' : 'web'),
            isStandalone: isStandaloneMode(),
            updatedAt: Date.now()
        };

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
    });

    // Silent sync + deep-link navigation after auth
    if (typeof auth !== 'undefined' && auth) {
        auth.onAuthStateChanged((user) => {
            if (user) {
                setTimeout(() => {
                    enablePkPhonePush(true).catch(() => {});
                    if (pendingNavAction) {
                        executeNotificationAction(pendingNavAction);
                    }
                }, 800);
            }
            updatePushSettingsUI();
        });
    }

    window.triggerPwaInstall = triggerPwaInstall;
    window.openIosInstallGuide = openIosInstallGuide;
    window.closeIosInstallGuide = closeIosInstallGuide;
    window.enablePkPhonePush = () => enablePkPhonePush(false);
    window.sendTestPhoneNotification = sendTestPhoneNotification;
    window.syncPushSubscriptionBreed = syncPushSubscriptionBreed;
    window.updatePushSettingsUI = updatePushSettingsUI;
})();
