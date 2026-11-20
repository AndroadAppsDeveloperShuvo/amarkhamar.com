/* 🤖 PK CHAT BOT — PERSONAL FARM & DAILY MEDICINE ASSISTANT
   প্রতিটি ইউজারের প্রতিদিনের ঔষধ প্রদান ও টিক-মার্ক ট্র্যাকিং, এবং
   খামারের লাইভ ডেটা ভিত্তিক পার্সোনাল অ্যাসিস্ট্যান্ট।
*/

(function () {
    const PK_CHATBOT_VERSION = 44;
    const PK_DEVELOPER_BIODATA_URL = 'https://shuvopkofficial.github.io/biodata.com/';
    const DEFAULT_DOCTOR_CONFIG = {
        enabled: true,
        title: 'পরামর্শক / ডাক্তারের সাথে যোগাযোগ',
        phone: '+8801719460996',
        note: 'মুরগির অসুস্থতা, রোগ নির্ণয় ও সঠিক ঔষধের পরামর্শের জন্য অভিজ্ঞ পরামর্শক বা ডাক্তারের সাথে কথা বলুন।',
        updatedAt: 0
    };

    const BREED_LABELS_BN = {
        Broiler: 'ব্রয়লার',
        ColorBird: 'কালার বার্ড',
        Sonali: 'সোনালি',
        Deshi: 'দেশি',
        All: 'সব জাত'
    };

    const BASE_QUICK_PROMPTS = [
        'আজ কোন ওষধ দেওয়া বাকি আছে?',
        'আমি কি আজ ওষধ টিক দিয়েছি?',
        'আগের কোনো ওষধ মিস হয়েছে কিনা?',
        'ডাক্তার বা পরামর্শকের সাথে যোগাযোগ',
        'এডমিন / ডেভেলপারের নম্বর দাও',
        'খামারের স্টক ও লাভ-ক্ষতির হিসাব'
    ];
    const DOCTOR_PROMPT_TEXT = 'ডাক্তার বা পরামর্শকের সাথে যোগাযোগ';

    let pkSchedules = [];
    let pkShipments = {};
    let pkCompletedMeds = {};
    let pkSkippedMeds = {};
    let pkStockItems = [];
    let pkDueList = {};
    let pkDailyCheckins = {};
    let pkChatHistory = [];
    let pkListenersUid = null;
    let pkSchedulesBound = false;
    let pkDoctorConfigBound = false;
    let pkIsSending = false;
    let pkShowDailyDrawer = false;
    let pkDoctorConfigCache = null;

    function getDoctorConfig() {
        if (typeof window.getPkDoctorConfig === 'function') {
            try {
                const ext = window.getPkDoctorConfig();
                if (ext && typeof ext === 'object') {
                    pkDoctorConfigCache = { ...DEFAULT_DOCTOR_CONFIG, ...ext };
                    return pkDoctorConfigCache;
                }
            } catch (e) {}
        }
        try {
            const cached = localStorage.getItem('cached_admin_doctor_config');
            if (cached) {
                const parsed = JSON.parse(cached);
                if (parsed && typeof parsed === 'object') {
                    pkDoctorConfigCache = { ...DEFAULT_DOCTOR_CONFIG, ...parsed };
                    return pkDoctorConfigCache;
                }
            }
        } catch (e) {}
        return pkDoctorConfigCache || { ...DEFAULT_DOCTOR_CONFIG };
    }

    function getDoctorWhatsAppUrl(phoneStr) {
        let digits = String(phoneStr || DEFAULT_DOCTOR_CONFIG.phone).replace(/[^0-9]/g, '');
        if (digits.startsWith('01') && digits.length === 11) {
            digits = '88' + digits;
        }
        return `https://wa.me/${digits || '8801719460996'}`;
    }

    function getActiveQuickPrompts() {
        const cfg = getDoctorConfig();
        if (cfg.enabled === false) {
            return BASE_QUICK_PROMPTS.filter(q => q !== DOCTOR_PROMPT_TEXT);
        }
        return BASE_QUICK_PROMPTS;
    }

    function getBnDigits(val) {
        return String(val).replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[d]);
    }

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function getLocalDateKey(input) {
        const d = input ? new Date(input) : new Date();
        if (Number.isNaN(d.getTime())) return '';
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    function getSelectedBreed() {
        const uid = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.uid : 'guest';
        const saved = localStorage.getItem(`pk_bot_breed_${uid}`);
        if (saved && BREED_LABELS_BN[saved]) return saved;
        if (typeof currentBreedFilter !== 'undefined' && BREED_LABELS_BN[currentBreedFilter]) {
            return currentBreedFilter;
        }
        return 'Broiler';
    }

    function setPkBotBreed(breed) {
        if (!BREED_LABELS_BN[breed]) return;
        const uid = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.uid : 'guest';
        localStorage.setItem(`pk_bot_breed_${uid}`, breed);
        const selectEl = document.getElementById('pk-bot-breed-select');
        if (selectEl) selectEl.value = breed;
        refreshPkBotUI();
        syncDailyCheckinToCloud();
        if (typeof window.syncPushSubscriptionBreed === 'function') {
            window.syncPushSubscriptionBreed(breed);
        }
    }

    function getScheduleItemKey(item) {
        if (!item) return '';
        if (item.id) return item.id;
        const namePart = String(item.name || '').replace(/\s+/g, '_');
        return `std_${item.day}_${namePart}_${item.time || ''}`;
    }

    function getDbRef() {
        if (typeof db !== 'undefined' && db) return db;
        if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0) {
            return firebase.database();
        }
        return null;
    }

    function readLocalFallbacks(uid) {
        try {
            if (typeof adminSchedules !== 'undefined' && Array.isArray(adminSchedules) && adminSchedules.length > 0) {
                pkSchedules = adminSchedules;
            } else {
                const cachedSched = localStorage.getItem('cached_medicine_schedule');
                if (cachedSched) {
                    const parsed = JSON.parse(cachedSched);
                    if (Array.isArray(parsed)) pkSchedules = parsed;
                }
            }
        } catch (e) {}

        if (!uid) return;
        try {
            const cachedShip = localStorage.getItem(`offline_shipments_${uid}`);
            if (cachedShip) pkShipments = JSON.parse(cachedShip) || {};
        } catch (e) {}
        try {
            const cachedMeds = localStorage.getItem(`completed_meds_${uid}`);
            if (cachedMeds) pkCompletedMeds = JSON.parse(cachedMeds) || {};
        } catch (e) {}
        try {
            const cachedSkipped = localStorage.getItem(`skipped_meds_${uid}`);
            if (cachedSkipped) pkSkippedMeds = JSON.parse(cachedSkipped) || {};
        } catch (e) {}
        try {
            const cachedDues = localStorage.getItem(`offline_dues_${uid}`);
            if (cachedDues) pkDueList = JSON.parse(cachedDues) || {};
        } catch (e) {}
        try {
            const cachedCheckins = localStorage.getItem(`pk_daily_checkins_${uid}`);
            if (cachedCheckins) pkDailyCheckins = JSON.parse(cachedCheckins) || {};
        } catch (e) {}
        try {
            const cachedChat = localStorage.getItem(`pk_chat_history_${uid}`);
            if (cachedChat) {
                const parsedChat = JSON.parse(cachedChat);
                if (Array.isArray(parsedChat)) pkChatHistory = parsedChat;
            }
        } catch (e) {}
    }

    function saveChatHistory(uid) {
        if (!uid) return;
        try {
            const trimmed = pkChatHistory.slice(-40);
            localStorage.setItem(`pk_chat_history_${uid}`, JSON.stringify(trimmed));
        } catch (e) {}
    }

    function parseLocalCalendarDate(dateStr) {
        if (!dateStr) return null;
        const parts = String(dateStr).split('-');
        if (parts.length === 3) {
            const y = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10) - 1;
            const d = parseInt(parts[2], 10);
            if (!Number.isNaN(y) && !Number.isNaN(m) && !Number.isNaN(d)) {
                return new Date(y, m, d);
            }
        }
        const parsed = new Date(dateStr);
        if (Number.isNaN(parsed.getTime())) return null;
        return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
    }

    function computeShipmentAgeDays(startDateStr, refEndTs) {
        const start = parseLocalCalendarDate(startDateStr);
        if (!start) return null;
        const refDate = refEndTs ? new Date(refEndTs) : new Date();
        const refMidnight = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate());
        const diffDays = Math.floor((refMidnight - start) / (1000 * 60 * 60 * 24)) + 1;
        return diffDays > 0 ? diffDays : 0;
    }

    function getSlotUnlockInfo(itemDay, itemTime, activeAgeDays) {
        if (typeof window.getMedicineTickEligibility === 'function') {
            return window.getMedicineTickEligibility(itemDay, itemTime, activeAgeDays);
        }
        const dayNum = parseInt(itemDay, 10) || 1;
        const timeLabel = String(itemTime || 'সকাল').trim();
        let startHour = 6;
        let unlockText = 'সকাল ৬:০০';
        if (timeLabel.includes('দুপুর')) {
            startHour = 12;
            unlockText = 'দুপুর ১২:০০';
        } else if (timeLabel.includes('রাত')) {
            startHour = 16;
            unlockText = 'বিকাল ৪:০০';
        }
        if (activeAgeDays !== null && activeAgeDays !== undefined) {
            if (dayNum > activeAgeDays) {
                return { allowed: false, lockType: 'future_day', startHour, unlockText, reason: `দিন ${getBnDigits(dayNum)} হলে টিক দেওয়া যাবে` };
            }
            if (dayNum < activeAgeDays) {
                return { allowed: true, lockType: 'past_day', startHour, unlockText, reason: '' };
            }
        }
        if (new Date().getHours() < startHour) {
            return { allowed: false, lockType: 'before_hour', startHour, unlockText, reason: `${timeLabel} বেলার ঔষধ ${unlockText} টার পর টিক দেওয়া যাবে` };
        }
        return { allowed: true, lockType: 'open', startHour, unlockText, reason: '' };
    }

    function computePkFarmSnapshot() {
        const uid = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.uid : null;
        const breed = getSelectedBreed();
        const todayKey = getLocalDateKey(new Date());

        // Merge with live globals if populated
        const liveSchedules = (typeof adminSchedules !== 'undefined' && Array.isArray(adminSchedules) && adminSchedules.length > 0)
            ? adminSchedules
            : pkSchedules;

        const liveCompleted = (typeof completedMedicinesMap !== 'undefined' && completedMedicinesMap && Object.keys(completedMedicinesMap).length > 0)
            ? completedMedicinesMap
            : pkCompletedMeds;

        const globalSkipped = (typeof window.getSkippedMedicinesMap === 'function') ? window.getSkippedMedicinesMap() : null;
        const liveSkipped = (globalSkipped && Object.keys(globalSkipped).length > 0)
            ? globalSkipped
            : pkSkippedMeds;

        const liveShipments = (typeof activeShipmentsForTimer !== 'undefined' && activeShipmentsForTimer && Object.keys(activeShipmentsForTimer).length > 0)
            ? activeShipmentsForTimer
            : pkShipments;

        const liveStock = (typeof allStockData !== 'undefined' && Array.isArray(allStockData) && allStockData.length > 0)
            ? allStockData
            : pkStockItems;

        // Sort shipments newest first by startDate (preferring active non-ended shipments)
        const shipmentEntries = Object.entries(liveShipments || {}).map(([id, val]) => {
            const expArr = Object.values(val.expenses || {});
            const incArr = Object.values(val.incomes || {});
            const totalExpense = expArr.reduce((acc, item) => acc + (parseFloat(item.amount) || 0), 0);
            const totalIncome = incArr.reduce((acc, item) => acc + (parseFloat(item.amount) || 0), 0);
            const reports = Object.values(val.daily_reports || {});
            const totalMortality = reports.reduce((acc, r) => acc + (parseFloat(r.dead) || 0), 0);
            const sortedReports = reports.slice().sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
            const latestWeight = sortedReports.find(r => parseFloat(r.weight) > 0)?.weight || null;
            const isEnded = !!(val.isEnded && val.endedAt);
            const ageDays = computeShipmentAgeDays(val.startDate, isEnded ? val.endedAt : undefined);
            return {
                id,
                name: val.name || 'চালান',
                startDate: val.startDate || '',
                chickenCount: parseInt(val.chickenCount, 10) || 0,
                isEnded,
                endedAt: val.endedAt || null,
                ageDays,
                totalExpense,
                totalIncome,
                netProfit: totalIncome - totalExpense,
                totalMortality,
                latestWeight
            };
        }).sort((a, b) => {
            if (a.isEnded !== b.isEnded) return a.isEnded ? 1 : -1;
            return new Date(b.startDate || 0) - new Date(a.startDate || 0);
        });

        const primaryShipment = shipmentEntries[0] || null;
        const activeAgeDays = primaryShipment ? primaryShipment.ageDays : null;

        // Breed-matching schedules
        const breedSchedules = (liveSchedules || [])
            .filter(item => !item.breed || item.breed === 'All' || item.breed === breed)
            .slice()
            .sort((a, b) => (parseInt(a.day, 10) || 0) - (parseInt(b.day, 10) || 0));

        const slotCounts = {};
        breedSchedules.forEach(item => {
            const sk = `${parseInt(item.day, 10) || 1}_${item.time || 'সকাল'}`;
            slotCounts[sk] = (slotCounts[sk] || 0) + 1;
        });

        const enrichedSchedules = breedSchedules.map(item => {
            const key = getScheduleItemKey(item);
            const record = liveCompleted ? liveCompleted[key] : null;
            const isCompleted = !!record;
            const isSkipped = !isCompleted && !!(liveSkipped && liveSkipped[key]);
            const markedDateKey = record
                ? getLocalDateKey(record.markedAt || record.timestamp)
                : '';
            const dayNum = parseInt(item.day, 10) || 1;
            const timeStr = item.time || 'সকাল';
            const tickEligibility = getSlotUnlockInfo(dayNum, timeStr, activeAgeDays);
            const isAlternative = (slotCounts[`${dayNum}_${timeStr}`] || 0) > 1 || /(ঠান্ডা|বিকল্প|অল্প|বেশি|প্রয়োজন|হলে|যদি)/.test(`${item.name || ''} ${item.desc || ''}`);
            return {
                key,
                day: dayNum,
                name: item.name || 'ঔষধ',
                category: item.category || 'Others',
                dose: item.dose || 'নির্ধারিত মাত্রা',
                breed: item.breed || 'All',
                time: timeStr,
                desc: item.desc || '',
                isCompleted,
                isSkipped,
                isAlternative,
                tickEligibility,
                markedAt: record ? (record.markedAt || record.timestamp || null) : null,
                markedDateKey
            };
        });

        const todayItems = activeAgeDays !== null
            ? enrichedSchedules.filter(m => m.day === activeAgeDays)
            : [];
        const todayRemaining = todayItems.filter(m => !m.isCompleted && !m.isSkipped);
        const todayDueNow = todayRemaining.filter(m => m.tickEligibility && m.tickEligibility.allowed);
        const todayUpcomingLater = todayRemaining.filter(m => !m.tickEligibility || !m.tickEligibility.allowed);
        const todayCompleted = todayItems.filter(m => m.isCompleted);
        const todaySkipped = todayItems.filter(m => m.isSkipped);

        const overdueRemaining = activeAgeDays !== null
            ? enrichedSchedules.filter(m => m.day < activeAgeDays && !m.isCompleted && !m.isSkipped)
            : [];

        const upcomingNext3Days = activeAgeDays !== null
            ? enrichedSchedules.filter(m => m.day > activeAgeDays && m.day <= activeAgeDays + 3 && !m.isCompleted && !m.isSkipped)
            : [];

        const allRemaining = enrichedSchedules.filter(m => !m.isCompleted && !m.isSkipped);
        const allCompleted = enrichedSchedules.filter(m => m.isCompleted);
        const allSkipped = enrichedSchedules.filter(m => m.isSkipped);

        // Today's tick activity across ALL completed medicines (even if user ticked an earlier/next day item today)
        const tickedTodayList = Object.entries(liveCompleted || {}).filter(([, rec]) => {
            if (!rec) return false;
            const k = getLocalDateKey(rec.markedAt || rec.timestamp);
            return k === todayKey;
        });

        // 7-day tick activity log
        const last7Days = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dKey = getLocalDateKey(d);
            const tickCount = Object.values(liveCompleted || {}).filter(rec => {
                if (!rec) return false;
                return getLocalDateKey(rec.markedAt || rec.timestamp) === dKey;
            }).length;
            const storedLog = pkDailyCheckins[dKey] || null;
            last7Days.push({
                date: dKey,
                label: d.toLocaleDateString('bn-BD', { day: 'numeric', month: 'short' }),
                tickCount,
                checkedIn: tickCount > 0 || (storedLog && storedLog.tickedTodayCount > 0)
            });
        }

        // Stock summary
        const lowStockItems = (liveStock || []).filter(s => (parseFloat(s.quantity) || 0) <= 2);
        const stockSummary = {
            totalItems: (liveStock || []).length,
            lowStockCount: lowStockItems.length,
            lowStockItems: lowStockItems.map(s => ({
                name: s.name,
                quantity: s.quantity,
                unit: s.unit || ''
            })),
            items: (liveStock || []).slice(0, 20).map(s => ({
                name: s.name,
                category: s.category,
                quantity: s.quantity,
                unit: s.unit || ''
            }))
        };

        // Due summary
        const dueEntries = Object.values(pkDueList || {});
        const totalDueAmount = dueEntries.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);

        return {
            uid,
            userName: (typeof currentUser !== 'undefined' && currentUser && currentUser.displayName) ? currentUser.displayName : 'খামারি',
            todayKey,
            breed,
            breedLabel: BREED_LABELS_BN[breed] || breed,
            scheduleLoadedCount: (liveSchedules || []).length,
            primaryShipment,
            allShipments: shipmentEntries,
            activeAgeDays,
            todayItems,
            todayRemaining,
            todayDueNow,
            todayUpcomingLater,
            todayCompleted,
            todaySkipped,
            overdueRemaining,
            upcomingNext3Days,
            allRemaining,
            allCompleted,
            allSkipped,
            tickedTodayCount: tickedTodayList.length,
            last7Days,
            stockSummary,
            dueCount: dueEntries.length,
            totalDueAmount
        };
    }

    let lastSyncedCheckinSignature = '';
    function syncDailyCheckinToCloud() {
        const snap = computePkFarmSnapshot();
        if (!snap.uid) return;
        const payload = {
            date: snap.todayKey,
            breed: snap.breed,
            shipmentName: snap.primaryShipment ? snap.primaryShipment.name : '',
            ageDays: snap.activeAgeDays,
            todayTotal: snap.todayItems.length,
            todayCompleted: snap.todayCompleted.length,
            todayRemaining: snap.todayRemaining.length,
            overdueCount: snap.overdueRemaining.length,
            tickedTodayCount: snap.tickedTodayCount,
            adherenceStatus: snap.todayItems.length > 0 && snap.todayRemaining.length === 0
                ? 'completed'
                : (snap.tickedTodayCount > 0 ? 'partial' : 'pending'),
            updatedAt: new Date().toISOString()
        };

        const sig = JSON.stringify({
            d: payload.date,
            b: payload.breed,
            a: payload.ageDays,
            tt: payload.todayTotal,
            tc: payload.todayCompleted,
            tr: payload.todayRemaining,
            oc: payload.overdueCount,
            tk: payload.tickedTodayCount
        });
        if (sig === lastSyncedCheckinSignature) return;
        lastSyncedCheckinSignature = sig;

        pkDailyCheckins[snap.todayKey] = payload;
        try {
            localStorage.setItem(`pk_daily_checkins_${snap.uid}`, JSON.stringify(pkDailyCheckins));
        } catch (e) {}

        const dbRef = getDbRef();
        if (dbRef && navigator.onLine) {
            dbRef.ref(`users/${snap.uid}/pk_daily_checkins/${snap.todayKey}`).set(payload).catch(() => {});
        }
    }

    function startPkBotListeners(uid) {
        if (!uid) return;
        readLocalFallbacks(uid);

        const dbRef = getDbRef();
        if (!dbRef) {
            refreshPkBotUI();
            return;
        }

        if (!pkSchedulesBound) {
            pkSchedulesBound = true;
            dbRef.ref('medicine_schedule').on('value', snap => {
                const data = snap.val();
                if (data) {
                    pkSchedules = Object.entries(data)
                        .map(([id, val]) => ({ id, ...val }))
                        .sort((a, b) => (parseInt(a.day, 10) || 0) - (parseInt(b.day, 10) || 0));
                } else {
                    pkSchedules = [];
                }
                refreshPkBotUI();
            });
        }

        if (pkListenersUid === uid) {
            refreshPkBotUI();
            return;
        }
        pkListenersUid = uid;

        dbRef.ref(`users/${uid}/shipments`).on('value', snap => {
            pkShipments = snap.val() || {};
            refreshPkBotUI();
            syncDailyCheckinToCloud();
        });

        dbRef.ref(`users/${uid}/completed_medicines`).on('value', snap => {
            pkCompletedMeds = snap.val() || {};
            refreshPkBotUI();
            syncDailyCheckinToCloud();
        });

        dbRef.ref(`users/${uid}/skipped_medicines`).on('value', snap => {
            pkSkippedMeds = snap.val() || {};
            try {
                localStorage.setItem(`skipped_meds_${uid}`, JSON.stringify(pkSkippedMeds));
            } catch (e) {}
            refreshPkBotUI();
            syncDailyCheckinToCloud();
        });

        dbRef.ref(`users/${uid}/stock`).on('value', snap => {
            const data = snap.val();
            pkStockItems = data ? Object.entries(data).map(([id, item]) => ({ id, ...item })) : [];
            refreshPkBotUI();
        });

        dbRef.ref(`users/${uid}/due_list`).on('value', snap => {
            pkDueList = snap.val() || {};
            refreshPkBotUI();
        });

        dbRef.ref(`users/${uid}/pk_daily_checkins`).limitToLast(14).on('value', snap => {
            pkDailyCheckins = snap.val() || {};
            try {
                localStorage.setItem(`pk_daily_checkins_${uid}`, JSON.stringify(pkDailyCheckins));
            } catch (e) {}
            refreshPkBotUI();
        });
    }

    function bindDoctorConfigListener() {
        if (pkDoctorConfigBound) return;
        const dbRef = getDbRef();
        if (!dbRef) return;
        pkDoctorConfigBound = true;
        dbRef.ref('breed_video_links/_doctor_config').on('value', snap => {
            const val = snap.val();
            if (val && typeof val === 'object') {
                pkDoctorConfigCache = { ...DEFAULT_DOCTOR_CONFIG, ...val };
                try {
                    localStorage.setItem('cached_admin_doctor_config', JSON.stringify(pkDoctorConfigCache));
                } catch (e) {}
                syncDoctorConfigUI();
            }
        }, () => {});
    }

    // Build HTML page structure for PK Chat Bot
    const pkChatbotPageHTML = `
    <div id="pk-chatbot-page" class="page bg-gray-50 dark:bg-gray-900 z-30">
        <div class="flex flex-col h-full w-full">
        <header class="sticky top-0 z-30 bg-white/95 dark:bg-gray-800/95 backdrop-blur-md border-b border-gray-200 dark:border-gray-700 px-3 py-1.5 flex items-center justify-between gap-2 flex-shrink-0">
            <div class="flex items-center gap-2 min-w-0">
                <button onclick="goBack()" aria-label="ফিরে যান" class="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-95 transition">
                    <span class="material-symbols-outlined">arrow_back</span>
                </button>
                <div class="w-9 h-9 rounded-xl bg-teal-700 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
                    <span class="material-symbols-outlined text-lg">smart_toy</span>
                </div>
                <div class="min-w-0">
                    <h1 class="text-sm font-bold text-gray-900 dark:text-white truncate leading-tight">PK Chat Bot</h1>
                    <p id="pk-bot-header-subtitle" class="text-[10px] text-gray-500 dark:text-gray-400 truncate">পার্সোনাল খামার ও ঔষধ অ্যাসিস্ট্যান্ট</p>
                </div>
            </div>
            <div class="flex items-center gap-1 flex-shrink-0">
                <select id="pk-bot-breed-select" onchange="setPkBotBreed(this.value)" aria-label="মুরগির জাত নির্বাচন" class="min-h-[36px] px-2 py-1 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-xs font-bold text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500">
                    <option value="Broiler">ব্রয়লার</option>
                    <option value="ColorBird">কালার বার্ড</option>
                    <option value="Sonali">সোনালি</option>
                    <option value="Deshi">দেশি</option>
                </select>
                <button onclick="resetPkChatConversation()" title="নতুন চ্যাট" aria-label="নতুন চ্যাট শুরু করুন" class="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-95 transition">
                    <span class="material-symbols-outlined text-xl">refresh</span>
                </button>
            </div>
        </header>

        <!-- Compact Daily Medicine Monitor Summary Strip -->
        <section class="px-3 pt-1.5 pb-1.5 bg-gray-50 dark:bg-gray-900 border-b border-gray-200/70 dark:border-gray-800 flex-shrink-0">
            <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2 shadow-sm">
                <div class="flex items-center justify-between gap-2">
                    <div class="min-w-0">
                        <p class="text-[10px] font-bold text-gray-500 dark:text-gray-400 truncate" id="pk-monitor-shipment-label">দৈনিক ঔষধ চেক-ইন</p>
                        <p class="text-xs font-bold text-gray-900 dark:text-white truncate mt-0.5" id="pk-monitor-main-status">হিসাব লোড হচ্ছে...</p>
                    </div>
                    <button onclick="togglePkDailyDrawer()" class="min-h-[36px] px-2.5 rounded-xl bg-teal-50 dark:bg-teal-900/30 text-teal-800 dark:text-teal-300 text-xs font-bold hover:bg-teal-100 dark:hover:bg-teal-900/50 transition flex items-center gap-1 flex-shrink-0">
                        <span class="material-symbols-outlined text-base">checklist</span>
                        <span id="pk-drawer-btn-text">তালিকা</span>
                    </button>
                </div>

                <div class="grid grid-cols-4 gap-1 mt-1.5 pt-1.5 border-t border-gray-100 dark:border-gray-700 text-center">
                    <div>
                        <p class="text-[9px] text-gray-500 dark:text-gray-400">এখন বাকি</p>
                        <p id="pk-stat-due-now" class="text-sm font-bold text-amber-700 dark:text-amber-400 tabular-nums">০</p>
                    </div>
                    <div class="border-l border-gray-100 dark:border-gray-700">
                        <p class="text-[9px] text-gray-500 dark:text-gray-400">পরবর্তী বেলা</p>
                        <p id="pk-stat-later-today" class="text-sm font-bold text-blue-700 dark:text-blue-400 tabular-nums">০</p>
                    </div>
                    <div class="border-x border-gray-100 dark:border-gray-700">
                        <p class="text-[9px] text-gray-500 dark:text-gray-400">আজ টিক</p>
                        <p id="pk-stat-today-ticked" class="text-sm font-bold text-teal-700 dark:text-teal-400 tabular-nums">০</p>
                    </div>
                    <div>
                        <p class="text-[9px] text-gray-500 dark:text-gray-400">আগের বাকি</p>
                        <p id="pk-stat-overdue" class="text-sm font-bold text-red-600 dark:text-red-400 tabular-nums">০</p>
                    </div>
                </div>

                <div id="pk-daily-drawer" class="hidden mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 space-y-2 max-h-52 overflow-y-auto"></div>
            </div>
        </section>

        <!-- Expanded Scrollable Chat Messages Area -->
        <div id="pk-chat-messages" class="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0"></div>

        <!-- Slim Bottom Quick Question Strip (Pushed neatly to the bottom edge for max chat space) -->
        <div class="relative z-30 flex-shrink-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-3 pt-1.5 pb-2 space-y-1">
            <p class="text-[10px] font-bold text-gray-500 dark:text-gray-400 px-0.5">নিচের যেকোনো প্রশ্নে ট্যাপ করুন:</p>
            <div id="pk-quick-prompts" class="flex flex-nowrap gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            </div>
        </div>
        </div>
    </div>`;

    const pkGlobalModalsHTML = `
    <!-- 👨‍💻 Developer / Admin Contact Popup Modal -->
    <div id="pk-dev-contact-modal" class="hidden fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]" onclick="if(event.target===this) closePkDevContactModal()">
        <div class="bg-white dark:bg-gray-800 w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-gray-100 dark:border-gray-700 relative text-center space-y-4">
            <button type="button" onclick="closePkDevContactModal()" aria-label="বন্ধ করুন" class="absolute top-3 right-3 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                <span class="material-symbols-outlined">close</span>
            </button>
            <div class="w-16 h-16 rounded-2xl bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 flex items-center justify-center mx-auto">
                <span class="material-symbols-outlined text-3xl">support_agent</span>
            </div>
            <div>
                <h3 class="text-lg font-bold text-gray-900 dark:text-white">ডেভেলপার ও এডমিন যোগাযোগ</h3>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">
                    অ্যাপের ডেভেলপার বা এডমিনের সাথে সরাসরি যোগাযোগ করতে নিচের বাটনে ট্যাপ করুন।
                </p>
            </div>
            <div class="pt-1 space-y-2.5">
                <a href="${PK_DEVELOPER_BIODATA_URL}" target="_blank" rel="noopener noreferrer" onclick="closePkDevContactModal()" class="w-full min-h-[48px] px-4 py-3 rounded-2xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md active:scale-[0.98] transition">
                    <span class="material-symbols-outlined text-lg">open_in_new</span>
                    <span>আমার সাথে যোগাযোগ করুন</span>
                </a>
                <button type="button" onclick="closePkDevContactModal()" class="w-full min-h-[44px] px-4 py-2.5 rounded-2xl bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-bold text-xs transition">
                    বন্ধ করুন
                </button>
            </div>
        </div>
    </div>

    <!-- 🩺 Consultant / Veterinary Doctor Contact Modal -->
    <div id="pk-doctor-contact-modal" class="hidden fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]" onclick="if(event.target===this) closePkDoctorContactModal()">
        <div class="bg-white dark:bg-gray-800 w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-gray-100 dark:border-gray-700 relative text-center space-y-4">
            <button type="button" onclick="closePkDoctorContactModal()" aria-label="বন্ধ করুন" class="absolute top-3 right-3 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                <span class="material-symbols-outlined">close</span>
            </button>
            <div class="w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 flex items-center justify-center mx-auto">
                <span class="material-symbols-outlined text-3xl">stethoscope</span>
            </div>
            <div>
                <h3 id="pk-doc-modal-title" class="text-lg font-bold text-gray-900 dark:text-white">${escapeHtml(DEFAULT_DOCTOR_CONFIG.title)}</h3>
                <p id="pk-doc-modal-note" class="text-xs text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">
                    ${escapeHtml(DEFAULT_DOCTOR_CONFIG.note)}
                </p>
                <p id="pk-doc-modal-phone" class="text-xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums mt-3">${escapeHtml(DEFAULT_DOCTOR_CONFIG.phone)}</p>
            </div>
            <div id="pk-doc-modal-disabled-box" class="hidden p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs font-bold text-amber-800 dark:text-amber-300">
                বর্তমানে পরামর্শক / ডাক্তারের সাথে যোগাযোগ সেবাটি এডমিন কর্তৃক সাময়িকভাবে বন্ধ রাখা হয়েছে।
            </div>
            <div id="pk-doc-modal-actions-box" class="pt-1 space-y-2.5">
                <a id="pk-doc-modal-call-link" href="tel:${escapeHtml(DEFAULT_DOCTOR_CONFIG.phone)}" class="w-full min-h-[48px] px-4 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md active:scale-[0.98] transition">
                    <span class="material-symbols-outlined text-lg">call</span>
                    <span id="pk-doc-modal-call-label">সরাসরি কল করুন (${escapeHtml(DEFAULT_DOCTOR_CONFIG.phone)})</span>
                </a>
                <div class="grid grid-cols-2 gap-2">
                    <a id="pk-doc-modal-wa-link" href="${escapeHtml(getDoctorWhatsAppUrl(DEFAULT_DOCTOR_CONFIG.phone))}" target="_blank" rel="noopener noreferrer" class="min-h-[44px] px-3 py-2.5 rounded-2xl bg-teal-50 dark:bg-teal-900/30 text-teal-800 dark:text-teal-300 font-bold text-xs flex items-center justify-center gap-1.5 border border-teal-200 dark:border-teal-800 active:scale-[0.98] transition">
                        <span class="material-symbols-outlined text-base">chat</span>
                        <span>WhatsApp</span>
                    </a>
                    <button type="button" onclick="copyPkDoctorPhone()" class="min-h-[44px] px-3 py-2.5 rounded-2xl bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 font-bold text-xs flex items-center justify-center gap-1.5 active:scale-[0.98] transition">
                        <span class="material-symbols-outlined text-base">content_copy</span>
                        <span>নম্বর কপি</span>
                    </button>
                </div>
            </div>
        </div>
    </div>`;

    function renderQuickPromptButtons() {
        const container = document.getElementById('pk-quick-prompts');
        if (!container) return;
        const prompts = getActiveQuickPrompts();
        container.innerHTML = prompts.map(q => `
            <button type="button" onclick="askPkQuickPrompt(this.dataset.prompt)" data-prompt="${escapeHtml(q)}" class="shrink-0 whitespace-nowrap min-h-[34px] px-3 py-1.5 rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-teal-50 dark:hover:bg-teal-900/30 text-gray-800 dark:text-gray-200 text-xs font-semibold border border-gray-200 dark:border-gray-600 active:scale-95 transition">
                ${escapeHtml(q)}
            </button>
        `).join('');
    }

    function syncDoctorConfigUI(overrideCfg) {
        const cfg = overrideCfg ? { ...DEFAULT_DOCTOR_CONFIG, ...overrideCfg } : getDoctorConfig();
        pkDoctorConfigCache = cfg;

        const isEnabled = cfg.enabled !== false;
        const phone = cfg.phone || DEFAULT_DOCTOR_CONFIG.phone;
        const waUrl = getDoctorWhatsAppUrl(phone);

        const titleEl = document.getElementById('pk-doc-modal-title');
        const noteEl = document.getElementById('pk-doc-modal-note');
        const phoneEl = document.getElementById('pk-doc-modal-phone');
        const disabledBox = document.getElementById('pk-doc-modal-disabled-box');
        const actionsBox = document.getElementById('pk-doc-modal-actions-box');
        const callLink = document.getElementById('pk-doc-modal-call-link');
        const callLabel = document.getElementById('pk-doc-modal-call-label');
        const waLink = document.getElementById('pk-doc-modal-wa-link');

        if (titleEl) titleEl.innerText = cfg.title || DEFAULT_DOCTOR_CONFIG.title;
        if (noteEl) noteEl.innerText = cfg.note || DEFAULT_DOCTOR_CONFIG.note;
        if (phoneEl) {
            phoneEl.innerText = phone;
            phoneEl.classList.toggle('hidden', !isEnabled);
        }
        if (disabledBox) disabledBox.classList.toggle('hidden', isEnabled);
        if (actionsBox) actionsBox.classList.toggle('hidden', !isEnabled);
        if (callLink) callLink.href = `tel:${phone}`;
        if (callLabel) callLabel.innerText = `সরাসরি কল করুন (${phone})`;
        if (waLink) waLink.href = waUrl;

        renderQuickPromptButtons();
        renderChatMessages();
    }

    function injectPkChatbotPage() {
        const mainApp = document.getElementById('main-app');
        if (mainApp && !document.getElementById('pk-chatbot-page')) {
            mainApp.insertAdjacentHTML('beforeend', pkChatbotPageHTML);
        }
        if (document.body && !document.getElementById('pk-dev-contact-modal')) {
            document.body.insertAdjacentHTML('beforeend', pkGlobalModalsHTML);
        }
        bindDoctorConfigListener();
        syncDoctorConfigUI();

        const uid = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.uid : null;
        if (uid) startPkBotListeners(uid);
        else {
            readLocalFallbacks(null);
            refreshPkBotUI();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectPkChatbotPage);
    } else {
        injectPkChatbotPage();
    }

    if (typeof auth !== 'undefined' && auth && typeof auth.onAuthStateChanged === 'function') {
        auth.onAuthStateChanged(user => {
            if (user) {
                startPkBotListeners(user.uid);
            } else {
                pkListenersUid = null;
                pkShipments = {};
                pkCompletedMeds = {};
                pkSkippedMeds = {};
                pkStockItems = [];
                pkDueList = {};
                pkDailyCheckins = {};
                pkChatHistory = [];
                lastBotNotifSignature = '';
                if (typeof window.setPkBotNotifications === 'function') {
                    window.setPkBotNotifications([]);
                }
                refreshPkBotUI();
            }
        });
    }

    function updateSettingsLauncherCard(snap) {
        const statusEl = document.getElementById('pk-bot-settings-status');
        if (!statusEl) return;

        if (!snap.uid) {
            statusEl.innerText = 'লগইন করলে আপনার প্রতিদিনের ঔষধ ও খামারের হিসাব দেখাবে';
            return;
        }

        if (!snap.primaryShipment) {
            statusEl.innerText = 'চালান যোগ করলে দৈনিক ঔষধ মনিটরিং চালু হবে · প্রশ্ন করতে ট্যাপ করুন';
            return;
        }

        const ageText = snap.activeAgeDays !== null ? `বয়স ${getBnDigits(snap.activeAgeDays)} দিন` : '';
        if (snap.todayItems.length === 0) {
            const tickText = snap.tickedTodayCount > 0
                ? `আজ ${getBnDigits(snap.tickedTodayCount)}টি ঔষধ টিক দেওয়া হয়েছে`
                : 'আজকের তারিখে নির্ধারিত নতুন ঔষধ নেই';
            const overdueNote = snap.overdueRemaining.length > 0
                ? ` · আগের ${getBnDigits(snap.overdueRemaining.length)}টি বাকি`
                : '';
            statusEl.innerText = `${snap.primaryShipment.name} (${ageText}) · ${tickText}${overdueNote}`;
            return;
        }

        if (snap.todayRemaining.length === 0) {
            statusEl.innerText = `${snap.primaryShipment.name} (${ageText}) · আজকের সব ${getBnDigits(snap.todayItems.length)}টি ঔষধ সম্পন্ন হয়েছে`;
        } else if (snap.todayDueNow.length > 0) {
            const laterTxt = snap.todayUpcomingLater.length > 0 ? ` · পরে আরো ${getBnDigits(snap.todayUpcomingLater.length)}টি` : '';
            statusEl.innerText = `${snap.primaryShipment.name} (${ageText}) · এখন ${getBnDigits(snap.todayDueNow.length)}টি ঔষধ বাকি${laterTxt}`;
        } else {
            statusEl.innerText = `${snap.primaryShipment.name} (${ageText}) · এখনকার বেলা সম্পন্ন · পরে ${getBnDigits(snap.todayUpcomingLater.length)}টি বাকি`;
        }
    }

    function renderDailyDrawer(snap) {
        const drawer = document.getElementById('pk-daily-drawer');
        if (!drawer) return;

        const actionableItems = [
            ...snap.todayDueNow.map(m => ({ ...m, tag: 'এখন দেওয়ার বাকি' })),
            ...snap.overdueRemaining.map(m => ({ ...m, tag: `দিন ${getBnDigits(m.day)} (আগের বাকি)` }))
        ];
        const laterItems = snap.todayUpcomingLater.map(m => ({ ...m, tag: 'পরবর্তী বেলা' }));

        if (actionableItems.length === 0 && laterItems.length === 0) {
            drawer.innerHTML = `
                <div class="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300 text-xs font-semibold flex items-center justify-between gap-2">
                    <span>আজকের বা আগের কোনো ঔষধ বাকি নেই। দারুণ!</span>
                    <button onclick="openMedicinePage()" class="min-h-[36px] px-3 rounded-lg bg-white dark:bg-gray-800 border border-emerald-200 dark:border-emerald-800 text-xs font-bold">ঔষধ পাতা</button>
                </div>`;
            return;
        }

        const actionableHtml = actionableItems.map(item => `
            <div class="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-700/60 border border-gray-200 dark:border-gray-600 space-y-2">
                <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                        <p class="text-xs font-bold text-gray-900 dark:text-white truncate">${escapeHtml(item.name)}</p>
                        <p class="text-[11px] text-gray-500 dark:text-gray-400 truncate">${escapeHtml(item.tag)} · ${escapeHtml(item.time)} · ${escapeHtml(item.dose)}</p>
                    </div>
                </div>
                <div class="flex items-center gap-1.5">
                    <button onclick="pkTickMedicine('${escapeHtml(item.key)}')" class="flex-1 min-h-[38px] px-3 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold flex items-center justify-center gap-1 active:scale-95 transition">
                        <span class="material-symbols-outlined text-sm">check</span>
                        <span>টিক দিন</span>
                    </button>
                    <button onclick="pkSkipMedicine('${escapeHtml(item.key)}')" class="min-h-[38px] px-2.5 rounded-xl bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 text-[11px] font-bold flex items-center gap-1 active:scale-95 transition">
                        <span>প্রয়োজন নেই</span>
                    </button>
                </div>
            </div>
        `).join('');

        const laterHtml = laterItems.map(item => `
            <div class="p-2.5 rounded-xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/70 dark:border-blue-800/40 flex items-center justify-between gap-2">
                <div class="min-w-0">
                    <p class="text-xs font-bold text-gray-900 dark:text-white truncate">${escapeHtml(item.name)}</p>
                    <p class="text-[11px] text-blue-700 dark:text-blue-300 truncate">${escapeHtml(item.time)} · ${escapeHtml(item.tickEligibility.unlockText)} টার পর টিক</p>
                </div>
                <button onclick="pkSkipMedicine('${escapeHtml(item.key)}')" class="min-h-[36px] px-2.5 rounded-xl bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 text-[11px] font-bold flex-shrink-0 active:scale-95 transition">
                    প্রয়োজন নেই
                </button>
            </div>
        `).join('');

        drawer.innerHTML = actionableHtml + (laterHtml ? `<p class="text-[10px] font-bold text-gray-400 uppercase pt-1">আজকের পরবর্তী বেলা (সময় হলে চালু হবে)</p>${laterHtml}` : '');
    }

    let lastBotNotifSignature = '';
    function pushBotNotificationsToApp(snap) {
        if (typeof window.setPkBotNotifications !== 'function') return;
        if (!snap || !snap.uid) {
            if (lastBotNotifSignature !== 'logged_out') {
                lastBotNotifSignature = 'logged_out';
                window.setPkBotNotifications([]);
            }
            return;
        }

        const alerts = [];
        if (!snap.primaryShipment) {
            alerts.push({
                icon: '🐣',
                color: 'bg-teal-100 text-teal-700',
                title: 'নতুন চালান যোগ করুন',
                desc: 'নতুন মুরগির চালান যোগ করলে প্রতিদিনের ঔষধ ও টিকার অটো রিমাইন্ডার পাবেন।',
                tag: 'PK Chat Bot',
                action: 'open_pk_chatbot'
            });
        } else {
            if (snap.todayDueNow.length > 0) {
                const topNames = snap.todayDueNow.slice(0, 2).map(m => m.name).join(', ');
                const extraCount = snap.todayDueNow.length > 2 ? ` ও আরও ${getBnDigits(snap.todayDueNow.length - 2)}টি` : '';
                alerts.push({
                    icon: '💊',
                    color: 'bg-amber-100 text-amber-700 animate-pulse',
                    title: `আজ ${getBnDigits(snap.todayDueNow.length)}টি ঔষধ দেওয়া বাকি`,
                    desc: `${topNames}${extraCount} (${snap.primaryShipment.name} · দিন ${getBnDigits(snap.activeAgeDays)})। টিক দিতে ট্যাপ করুন।`,
                    tag: 'PK Chat Bot',
                    action: 'open_pk_chatbot'
                });
            } else if (snap.todayUpcomingLater.length > 0) {
                const nextMed = snap.todayUpcomingLater[0];
                alerts.push({
                    icon: '🕒',
                    color: 'bg-blue-100 text-blue-700',
                    title: `পরবর্তী বেলায় ${getBnDigits(snap.todayUpcomingLater.length)}টি ঔষধ নির্ধারিত`,
                    desc: `${nextMed.name} (${nextMed.time} · ${nextMed.tickEligibility.unlockText}-এ টিক চালু হবে)।`,
                    tag: 'PK Chat Bot',
                    action: 'open_pk_chatbot'
                });
            } else if (snap.todayItems.length > 0 && snap.overdueRemaining.length === 0) {
                alerts.push({
                    icon: '✅',
                    color: 'bg-emerald-100 text-emerald-700',
                    title: 'আজকের সব ঔষধ সম্পন্ন হয়েছে',
                    desc: `${snap.primaryShipment.name} (দিন ${getBnDigits(snap.activeAgeDays)})-এর সব ঔষধ সময়মতো শেষ হয়েছে।`,
                    tag: 'PK Chat Bot',
                    action: 'open_pk_chatbot'
                });
            }

            if (snap.overdueRemaining.length > 0) {
                const firstMissed = snap.overdueRemaining[0];
                alerts.push({
                    icon: '⚠️',
                    color: 'bg-red-100 text-red-600 animate-pulse',
                    title: `আগের ${getBnDigits(snap.overdueRemaining.length)}টি ঔষধ টিক বাকি`,
                    desc: `দিন ${getBnDigits(firstMissed.day)}-এর ${firstMissed.name} সহ আগের ঔষধ টিক দেওয়া হয়নি।`,
                    tag: 'PK Chat Bot',
                    action: 'open_pk_chatbot'
                });
            }
        }

        const sig = JSON.stringify(alerts.map(a => `${a.title}|${a.desc}`));
        if (sig === lastBotNotifSignature) return;
        lastBotNotifSignature = sig;
        window.setPkBotNotifications(alerts);
    }

    function refreshPkBotUI() {
        const snap = computePkFarmSnapshot();
        updateSettingsLauncherCard(snap);
        pushBotNotificationsToApp(snap);

        const breedSelect = document.getElementById('pk-bot-breed-select');
        if (breedSelect) breedSelect.value = snap.breed;

        const headerSub = document.getElementById('pk-bot-header-subtitle');
        if (headerSub) {
            if (snap.primaryShipment) {
                headerSub.innerText = `${snap.primaryShipment.name} · বয়স ${getBnDigits(snap.activeAgeDays)} দিন · ${snap.breedLabel}`;
            } else {
                headerSub.innerText = `পার্সোনাল খামার অ্যাসিস্ট্যান্ট · ${snap.breedLabel}`;
            }
        }

        const shipLabel = document.getElementById('pk-monitor-shipment-label');
        const mainStatus = document.getElementById('pk-monitor-main-status');
        const statDueNow = document.getElementById('pk-stat-due-now');
        const statLater = document.getElementById('pk-stat-later-today');
        const statTicked = document.getElementById('pk-stat-today-ticked');
        const statOverdue = document.getElementById('pk-stat-overdue');

        if (statDueNow) statDueNow.innerText = getBnDigits(snap.todayDueNow.length);
        if (statLater) statLater.innerText = getBnDigits(snap.todayUpcomingLater.length);
        if (statTicked) statTicked.innerText = getBnDigits(snap.tickedTodayCount);
        if (statOverdue) statOverdue.innerText = getBnDigits(snap.overdueRemaining.length);

        if (shipLabel && mainStatus) {
            if (!snap.primaryShipment) {
                shipLabel.innerText = 'দৈনিক ঔষধ চেক-ইন';
                mainStatus.innerText = 'এখনো কোনো চালান যুক্ত করা হয়নি';
            } else {
                shipLabel.innerText = `${snap.primaryShipment.name} · মুরগির বয়স ${getBnDigits(snap.activeAgeDays)} দিন`;
                if (snap.todayItems.length === 0) {
                    mainStatus.innerText = snap.tickedTodayCount > 0
                        ? `আজ ${getBnDigits(snap.tickedTodayCount)}টি ঔষধ টিক দেওয়া হয়েছে`
                        : 'আজকের বয়সে নির্ধারিত ঔষধ নেই';
                } else if (snap.todayRemaining.length === 0) {
                    mainStatus.innerText = 'আজকের সব ঔষধ সম্পন্ন হয়েছে';
                } else if (snap.todayDueNow.length > 0) {
                    const laterTxt = snap.todayUpcomingLater.length > 0 ? ` (পরে আরো ${getBnDigits(snap.todayUpcomingLater.length)}টি)` : '';
                    mainStatus.innerText = `এখন ${getBnDigits(snap.todayDueNow.length)}টি ঔষধ বাকি আছে${laterTxt}`;
                } else {
                    mainStatus.innerText = `এখনকার বেলা সম্পন্ন · পরবর্তী বেলায় ${getBnDigits(snap.todayUpcomingLater.length)}টি বাকি`;
                }
            }
        }

        renderDailyDrawer(snap);
    }

    function togglePkDailyDrawer() {
        pkShowDailyDrawer = !pkShowDailyDrawer;
        const drawer = document.getElementById('pk-daily-drawer');
        const btnText = document.getElementById('pk-drawer-btn-text');
        if (drawer) drawer.classList.toggle('hidden', !pkShowDailyDrawer);
        if (btnText) btnText.innerText = pkShowDailyDrawer ? 'লুকান' : 'তালিকা';
    }

    async function pkTickMedicine(itemKey) {
        if (!itemKey) return;
        const snapBefore = computePkFarmSnapshot();
        const found = snapBefore.allRemaining.find(m => m.key === itemKey);
        if (found) {
            const elig = getSlotUnlockInfo(found.day, found.time, snapBefore.activeAgeDays);
            if (!elig.allowed) {
                if (typeof showToast === 'function') showToast(`⏳ সময়ের আগে টিক দেওয়া যাবে না! ${elig.reason}`);
                return;
            }
        }

        if (typeof toggleMedicineCompletion === 'function') {
            await toggleMedicineCompletion(itemKey, true);
        } else {
            const uid = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.uid : null;
            if (!uid) {
                if (typeof showToast === 'function') showToast('প্রথমে লগইন করুন');
                return;
            }
            const entry = { timestamp: Date.now(), markedAt: new Date().toISOString() };
            pkCompletedMeds[itemKey] = entry;
            delete pkSkippedMeds[itemKey];
            localStorage.setItem(`completed_meds_${uid}`, JSON.stringify(pkCompletedMeds));
            localStorage.setItem(`skipped_meds_${uid}`, JSON.stringify(pkSkippedMeds));
            const dbRef = getDbRef();
            if (dbRef) {
                await dbRef.ref(`users/${uid}/completed_medicines/${itemKey}`).set(entry);
                await dbRef.ref(`users/${uid}/skipped_medicines/${itemKey}`).remove();
            }
        }
        refreshPkBotUI();
        syncDailyCheckinToCloud();
        renderChatMessages();
    }

    async function pkSkipMedicine(itemKey) {
        if (!itemKey) return;
        if (typeof toggleMedicineSkipped === 'function') {
            await toggleMedicineSkipped(itemKey, true);
        } else {
            const uid = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.uid : null;
            if (!uid) {
                if (typeof showToast === 'function') showToast('প্রথমে লগইন করুন');
                return;
            }
            const entry = { status: 'skipped', timestamp: Date.now(), skippedAt: new Date().toISOString() };
            pkSkippedMeds[itemKey] = entry;
            localStorage.setItem(`skipped_meds_${uid}`, JSON.stringify(pkSkippedMeds));
            const dbRef = getDbRef();
            if (dbRef) {
                await dbRef.ref(`users/${uid}/skipped_medicines/${itemKey}`).set(entry);
            }
            if (typeof showToast === 'function') showToast("⏭️ ঔষধটি 'প্রয়োজন নেই' হিসেবে বাদ দেওয়া হয়েছে");
        }
        refreshPkBotUI();
        syncDailyCheckinToCloud();
        renderChatMessages();
    }

    function buildDailyBriefingGreeting(snap) {
        if (!snap.primaryShipment) {
            return {
                text: `আসসালামু আলাইকুম${snap.userName ? ', ' + snap.userName : ''}! আমি PK Chat Bot।\n\nএখনো আপনার একাউন্টে কোনো মুরগির চালান যোগ করা নেই। নতুন চালান যোগ করলে আমি প্রতিদিন আপনার মুরগির বয়স অনুযায়ী কোন ঔষধ বাকি আছে, আপনি টিক দিয়েছেন কিনা এবং স্টক ও লাভ-ক্ষতির হিসাব নিয়মিত জানাবো।`,
                actionItems: []
            };
        }

        const lines = [];
        lines.push(`আসসালামু আলাইকুম! আমি PK Chat Bot — আপনার খামারের পার্সোনাল অ্যাসিস্ট্যান্ট।`);
        lines.push(`সক্রিয় চালান: ${snap.primaryShipment.name} (বয়স ${getBnDigits(snap.activeAgeDays)} দিন, ${snap.breedLabel})`);

        if (snap.scheduleLoadedCount === 0) {
            lines.push(`\nবর্তমানে ঔষধের শিডিউল তালিকা খালি রয়েছে। ঔষধ পাতা থেকে শিডিউল লোড হলে দৈনিক রিমাইন্ডার দেখাবে।`);
        } else if (snap.todayItems.length === 0) {
            lines.push(`\nআজ দিন ${getBnDigits(snap.activeAgeDays)}-এর জন্য নতুন কোনো ঔষধ নির্ধারিত নেই।`);
        } else if (snap.todayRemaining.length === 0) {
            lines.push(`\nদারুণ! আজ দিন ${getBnDigits(snap.activeAgeDays)}-এর সব নির্ধারিত ঔষধ সম্পন্ন হয়েছে।`);
        } else {
            if (snap.todayDueNow.length > 0) {
                lines.push(`\nএখন দেওয়ার বাকি (${getBnDigits(snap.todayDueNow.length)}টি):`);
                snap.todayDueNow.forEach((m, i) => {
                    lines.push(`${getBnDigits(i + 1)}. ${m.name} (${m.time})${m.isAlternative ? ' [বিকল্প]' : ''} — মাত্রা: ${m.dose}`);
                });
            } else {
                lines.push(`\nএখনকার বেলার সব ঔষধ সম্পন্ন হয়েছে!`);
            }
            if (snap.todayUpcomingLater.length > 0) {
                lines.push(`\nআজকের পরবর্তী বেলার বাকি (${getBnDigits(snap.todayUpcomingLater.length)}টি — সময় হলে চালু হবে):`);
                snap.todayUpcomingLater.forEach((m, i) => {
                    lines.push(`${getBnDigits(i + 1)}. ${m.name} (${m.time} · ${m.tickEligibility.unlockText}-এ চালু)`);
                });
            }
        }

        lines.push(`\nআজকের টিক-মার্ক স্ট্যাটাস: ${snap.tickedTodayCount > 0 ? `আজ ${getBnDigits(snap.tickedTodayCount)}টি ঔষধ টিক দেওয়া হয়েছে।` : 'আজ এখনো কোনো ঔষধে টিক দেওয়া হয়নি।'}`);

        if (snap.overdueRemaining.length > 0) {
            lines.push(`সতর্কতা: আগের দিনের ${getBnDigits(snap.overdueRemaining.length)}টি ঔষধ এখনো বাকি রয়েছে।`);
        }
        if (snap.stockSummary.lowStockCount > 0) {
            lines.push(`স্টক সতর্কতা: ${getBnDigits(snap.stockSummary.lowStockCount)}টি সামগ্রী প্রায় শেষ হয়ে আসছে।`);
        }

        const actionItems = [...snap.todayDueNow, ...snap.overdueRemaining].slice(0, 5);
        return { text: lines.join('\n'), actionItems };
    }

    function openPkDevContactModal() {
        injectPkChatbotPage();
        const modal = document.getElementById('pk-dev-contact-modal');
        if (modal) modal.classList.remove('hidden');
    }

    function closePkDevContactModal() {
        const modal = document.getElementById('pk-dev-contact-modal');
        if (modal) modal.classList.add('hidden');
    }

    function openPkDoctorContactModal() {
        injectPkChatbotPage();
        syncDoctorConfigUI();
        const modal = document.getElementById('pk-doctor-contact-modal');
        if (modal) modal.classList.remove('hidden');
    }

    function closePkDoctorContactModal() {
        const modal = document.getElementById('pk-doctor-contact-modal');
        if (modal) modal.classList.add('hidden');
    }

    function copyPkDoctorPhone() {
        const cfg = getDoctorConfig();
        const phone = cfg.phone || DEFAULT_DOCTOR_CONFIG.phone;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(phone).then(() => {
                if (typeof showToast === 'function') showToast('ডাক্তারের নম্বর কপি হয়েছে ✅');
            }).catch(() => {});
        }
    }

    // Normalize regional Bengali dialects, informal phrasing & Romanized Banglish
    function normalizeDialectAndBanglish(rawText) {
        let s = ' ' + (rawText || '').toLowerCase().trim() + ' ';
        const asciiReplacements = [
            [/\b(ajke|ajka|ajk|aj|aaj)\b/g, ' আজ '],
            [/\b(kal|kail|kalke|porer|samne|samner|upcoming)\b/g, ' আগামী '],
            [/\b(oshudh|oshud|osudh|osud|oushod|oushud|medicine|med|dawai)\b/g, ' ঔষধ '],
            [/\b(vaksin|vaccine|bhaksin|tika)\b/g, ' টিকা '],
            [/\b(baki|bakiya)\b/g, ' বাকি '],
            [/\b(tik|tick|mark|marik)\b/g, ' টিক '],
            [/\b(disi|dichhi|diyechi|dewa|dise|khawaisi|khawaichi)\b/g, ' দিয়েছি '],
            [/\b(miss|mis|bad|ager|purano|overdue|missed)\b/g, ' মিস '],
            [/\b(murgi|morgi|morog|murga|baccha|bacha|poltri)\b/g, ' মুরগি '],
            [/\b(boyos|boyosh|age|koydin)\b/g, ' বয়স '],
            [/\b(khabar|khaon|dana|feed|fid|vushi)\b/g, ' খাবার '],
            [/\b(stock|stok|istok)\b/g, ' স্টক '],
            [/\b(lav|labh|loss|los|khoroch|khoroc|ay|aay|teka|taka|tk|hisab)\b/g, ' হিসাব '],
            [/\b(morche|mora|morlo|mara|dead|mortality)\b/g, ' মৃত্যু '],
            [/\b(ojon|wajan|weight)\b/g, ' ওজন '],
            [/\b(daktar|doctor|dr|vet|veterinary|chikitsha|rog|bimari|osukh|osustho|jhimay|consultant)\b/g, ' ডাক্তার '],
            [/\b(developer|dev|admin|malik|owner|shuvo)\b/g, ' ডেভেলপার '],
            [/\b(number|nombor|namber|phone|phn|fon|contact|jogajog)\b/g, ' যোগাযোগ ']
        ];
        for (const [pattern, rep] of asciiReplacements) {
            s = s.replace(pattern, rep);
        }

        const bnReplacements = [
            [/(আইজকা|আইজকে|আইজ|অখন|এখন|আজকে|আজ)/g, ' আজ '],
            [/(কাইলকা|কাইল|সামনের|আগামীকাল|আগামী)/g, ' আগামী '],
            [/(দোয়াই|দোয়াই|অষুদ|অষুধ|ওসুদ|ওষুদ|ঔষুদ|ওষধ|ঔষধ)/g, ' ঔষধ '],
            [/(টীকা|ভেক্সিন|ভ্যাকসিন|টিকা)/g, ' টিকা '],
            [/(বাকিয়া|বকেয়া|রইছে|আছে\s*কিতা|বাকি)/g, ' বাকি '],
            [/(টিকচিহ্ন|টিকমার্ক|মার্ক|টিক)/g, ' টিক '],
            [/(দিছি|দিছিনা|দিয়াছি|দিয়েছি|খাওয়াইছি|খাওয়ানো)/g, ' দিয়েছি '],
            [/(অতিক্রান্ত|আগের|মিস|বাদ\s*পড়ছে|বাদ\s*পড়েছে)/g, ' মিস '],
            [/(মরগ|মোরগ|বাচ্চা|পোল্ট্রি|মুরগি|মুরগীর)/g, ' মুরগি '],
            [/(বয়স|বয়স|কয়দিন)/g, ' বয়স '],
            [/(দানা|খাওন|খাদ্য|ভুসি|ফিড|খাবার)/g, ' খাবার '],
            [/(মজুদ|স্টক)/g, ' স্টক '],
            [/(লাব|লাভ|ক্ষতি|লস|টেকা|পয়সা|খরচ|আয়|হিসাব)/g, ' হিসাব '],
            [/(মরছে|মইরা|মারা|মৃত্যু)/g, ' মৃত্যু '],
            [/(ওজন)/g, ' ওজন '],
            [/(পশু\s*ডাক্তার|ডাক্তার|ডাক্তর|ভেট|পরামর্শক|পরামর্শ|চিকিৎসা|রোগ|অসুখ|অসুস্থ|বিমার|ঝিমায়|পাইখানা)/g, ' ডাক্তার '],
            [/(বানাইছে|ডেভলপার|ডেভোলপার|ডেভেলপার|এডমিন|অ্যাডমিন|মালিক|ওনার)/g, ' ডেভেলপার '],
            [/(নম্বর|নাম্বার|ফোন|যোগাযোগ|কন্টাক্ট|লিংক)/g, ' যোগাযোগ ']
        ];
        for (const [pattern, rep] of bnReplacements) {
            s = s.replace(pattern, rep);
        }
        return s;
    }

    function isDeveloperContactQuery(rawText) {
        const norm = normalizeDialectAndBanglish(rawText);
        const raw = (rawText || '').toLowerCase();
        const hasDevKeyword = norm.includes('ডেভেলপার') || /\b(dev|developer|admin|shuvo|biodata)\b/.test(raw) || raw.includes('এডমিন') || raw.includes('মালিক');
        const hasContactKeyword = norm.includes('যোগাযোগ') || /(নম্বর|নাম্বার|ফোন|লিংক|কথা|নং|number|contact|phone|mobile|id|কে\s*বানাইছে)/.test(raw);
        return hasDevKeyword && (hasContactKeyword || raw.includes('ডেভেলপার') || raw.includes('ডেভোলপার') || raw.includes('এডমিন'));
    }

    function isDoctorContactQuery(rawText) {
        const norm = normalizeDialectAndBanglish(rawText);
        return norm.includes('ডাক্তার');
    }

    // Local deterministic Farm & Medicine Query Engine (used offline, on static GitHub Pages, or local dialect fallback)
    function buildLocalAssistantReply(rawQuery, snap) {
        const q = normalizeDialectAndBanglish(rawQuery);
        const rawLower = (rawQuery || '').toLowerCase();

        // 0A. Developer / Admin contact popup trigger
        if (isDeveloperContactQuery(rawQuery)) {
            openPkDevContactModal();
            return {
                text: `অ্যাপের ডেভেলপার / এডমিনের সাথে যোগাযোগ করার জন্য স্ক্রিনে একটি পপ-আপ খোলা হয়েছে।\n\nপপ-আপ থেকে "আমার সাথে যোগাযোগ করুন" বাটনে ট্যাপ করে সরাসরি যোগাযোগ করতে পারবেন অথবা নিচের বাটন ব্যবহার করুন।`,
                actionItems: [],
                contactCard: 'developer'
            };
        }

        // 0B. Consultant / Veterinary Doctor contact (Admin-controlled)
        if (isDoctorContactQuery(rawQuery)) {
            const docCfg = getDoctorConfig();
            if (docCfg.enabled === false) {
                return {
                    text: `বর্তমানে পরামর্শক / ডাক্তারের সাথে যোগাযোগ সেবাটি এডমিন কর্তৃক সাময়িকভাবে বন্ধ রাখা হয়েছে।`,
                    actionItems: [],
                    contactCard: null
                };
            }
            return {
                text: `মুরগির যেকোনো অসুস্থতা, চিকিৎসা বা বিশেষ পরামর্শের জন্য অভিজ্ঞ পরামর্শক / ডাক্তারের সাথে সরাসরি কথা বলতে পারেন।\n\nপরামর্শক / ডাক্তারের নম্বর: ${docCfg.phone}\nনিচের বাটনে ট্যাপ করে সরাসরি কল বা WhatsApp করুন।`,
                actionItems: [],
                contactCard: 'doctor'
            };
        }

        // 1. Overdue / Missed medicines
        if (q.includes('মিস') || rawLower.includes('আগের') || rawLower.includes('অতিক্রান্ত')) {
            if (!snap.primaryShipment) {
                return { text: 'কোনো সক্রিয় চালান পাওয়া যায়নি, তাই আগের দিনের বয়স ও মিস হওয়া ঔষধ হিসাব করা যায়নি।', actionItems: [] };
            }
            if (snap.overdueRemaining.length === 0) {
                return { text: `খুব ভালো! দিন ১ থেকে দিন ${getBnDigits(Math.max(0, (snap.activeAgeDays || 1) - 1))} পর্যন্ত আগের কোনো ঔষধ টিক দিতে মিস হয়নি।`, actionItems: [] };
            }
            const lines = [`আগের দিনের ${getBnDigits(snap.overdueRemaining.length)}টি ঔষধ এখনো টিক দেওয়া বাকি আছে:`];
            snap.overdueRemaining.slice(0, 8).forEach((m, idx) => {
                lines.push(`${getBnDigits(idx + 1)}. দিন ${getBnDigits(m.day)}: ${m.name} (${m.time}) — ${m.dose}`);
            });
            lines.push(`\nযদি ইতিমধ্যে দিয়ে থাকেন, নিচের বোতামে ট্যাপ করে টিক দিয়ে রাখুন।`);
            return { text: lines.join('\n'), actionItems: snap.overdueRemaining.slice(0, 5) };
        }

        // 2. Daily tick check-in / Did I tick today?
        if (q.includes('টিক') || rawLower.includes('প্রতিদিন') || rawLower.includes('দিচ্ছি কিনা') || rawLower.includes('চেক')) {
            const activeDaysTicked = snap.last7Days.filter(d => d.checkedIn).length;
            const lines = [
                `দৈনিক ঔষধ টিক-মার্ক রিপোর্ট (${snap.todayKey}):`,
                `• আজ টিক দিয়েছেন: ${snap.tickedTodayCount > 0 ? `হ্যাঁ, ${getBnDigits(snap.tickedTodayCount)}টি ঔষধ` : 'না, আজ এখনো কোনো ঔষধ টিক দেননি'}`,
                `• এখন দেওয়ার বাকি: ${getBnDigits(snap.todayDueNow.length)}টি · পরবর্তী বেলায়: ${getBnDigits(snap.todayUpcomingLater.length)}টি (বাদ দেওয়া: ${getBnDigits(snap.todaySkipped.length)}টি)`,
                `• আগের বাকি/মিস: ${getBnDigits(snap.overdueRemaining.length)}টি`,
                `• গত ৭ দিনে সক্রিয় টিক-মার্ক দিন: ${getBnDigits(activeDaysTicked)} দিন`,
                '',
                'গত ৭ দিনের সংক্ষিপ্ত লগ:'
            ];
            snap.last7Days.forEach(d => {
                lines.push(`- ${d.label}: ${d.tickCount > 0 ? `টিক দিয়েছেন (${getBnDigits(d.tickCount)}টি)` : 'কোনো টিক নেই'}`);
            });
            return { text: lines.join('\n'), actionItems: snap.todayDueNow.slice(0, 4) };
        }

        // 3. Upcoming medicines
        if (q.includes('আগামী') || rawLower.includes('পরের') || rawLower.includes('শিডিউল')) {
            if (!snap.primaryShipment) {
                return { text: 'সক্রিয় চালান থাকলে মুরগির বয়স অনুযায়ী আগামী ৩ দিনের ঔষধ দেখানো যাবে।', actionItems: [] };
            }
            if (snap.upcomingNext3Days.length === 0) {
                return { text: `আগামী ৩ দিনে (দিন ${getBnDigits((snap.activeAgeDays || 0) + 1)} থেকে ${getBnDigits((snap.activeAgeDays || 0) + 3)}) ${snap.breedLabel} জাতের নতুন কোনো ঔষধ শিডিউলে নেই।`, actionItems: [] };
            }
            const lines = [`আগামী ৩ দিনের নির্ধারিত ঔষধ ও টিকা (${snap.breedLabel}):`];
            snap.upcomingNext3Days.forEach((m, i) => {
                lines.push(`${getBnDigits(i + 1)}. দিন ${getBnDigits(m.day)}: ${m.name} (${m.time})\n   মাত্রা: ${m.dose}`);
            });
            return { text: lines.join('\n'), actionItems: [] };
        }

        // 4. Stock, Profit/Loss, Dues, Mortality, Age
        if (q.includes('স্টক') || q.includes('খাবার') || q.includes('হিসাব') || q.includes('মৃত্যু') || q.includes('ওজন') || q.includes('বয়স') || q.includes('মুরগি') || rawLower.includes('চালান')) {
            const lines = ['আপনার খামারের বর্তমান সামারি:'];
            if (snap.primaryShipment) {
                const s = snap.primaryShipment;
                lines.push(`\nসক্রিয় চালান: ${s.name}`);
                lines.push(`• মুরগির সংখ্যা: ${getBnDigits(s.chickenCount)}টি · বয়স: ${getBnDigits(s.ageDays)} দিন`);
                lines.push(`• মোট আয়: ৳${getBnDigits(s.totalIncome.toLocaleString())} · মোট ব্যয়: ৳${getBnDigits(s.totalExpense.toLocaleString())}`);
                lines.push(`• নিট লাভ/ক্ষতি: ৳${getBnDigits(s.netProfit.toLocaleString())}`);
                if (s.totalMortality > 0 || s.latestWeight) {
                    lines.push(`• মোট মৃত্যু: ${getBnDigits(s.totalMortality)}টি${s.latestWeight ? ` · সর্বশেষ গড় ওজন: ${getBnDigits(s.latestWeight)} গ্রাম` : ''}`);
                }
            } else {
                lines.push('\n• এখনো কোনো চালান যুক্ত করা হয়নি।');
            }

            lines.push(`\nস্টক অবস্থা: মোট ${getBnDigits(snap.stockSummary.totalItems)}টি আইটেম`);
            if (snap.stockSummary.lowStockCount > 0) {
                snap.stockSummary.lowStockItems.forEach(item => {
                    lines.push(`⚠️ কম স্টক: ${item.name} — ${getBnDigits(item.quantity)} ${item.unit}`);
                });
            }
            lines.push(`বাকির খাতা: মোট ${getBnDigits(snap.dueCount)} জন · ৳${getBnDigits(snap.totalDueAmount.toLocaleString())}`);
            return { text: lines.join('\n'), actionItems: [] };
        }

        // 5. Today's remaining medicines (time-partitioned: এখন বাকি vs পরবর্তী বেলা)
        if (q.includes('আজ') || q.includes('ঔষধ') || q.includes('বাকি') || q.includes('টিকা')) {
            if (!snap.primaryShipment) {
                return { text: 'আজকের ঔষধ দেখার জন্য প্রথমে ড্যাশবোর্ড থেকে একটি চালান (Batch) যোগ করুন।', actionItems: [] };
            }
            if (snap.scheduleLoadedCount === 0) {
                return { text: 'ডাটাবেজে এখনো কোনো ঔষধের শিডিউল পাওয়া যায়নি। ঔষধ পেজে গিয়ে শিডিউল লোড করুন।', actionItems: [] };
            }
            if (snap.todayItems.length === 0) {
                const extra = snap.overdueRemaining.length > 0
                    ? `\nতবে আগের দিনের ${getBnDigits(snap.overdueRemaining.length)}টি ঔষধ এখনো বাকি আছে।`
                    : '';
                return {
                    text: `আজ (${snap.primaryShipment.name}, বয়স ${getBnDigits(snap.activeAgeDays)} দিন, ${snap.breedLabel}) নির্ধারিত কোনো নতুন ঔষধ নেই।${extra}`,
                    actionItems: snap.overdueRemaining.slice(0, 4)
                };
            }
            if (snap.todayRemaining.length === 0) {
                return {
                    text: `আজ দিন ${getBnDigits(snap.activeAgeDays)}-এর সব নির্ধারিত ঔষধ সম্পন্ন হয়েছে!\n\nসম্পন্ন: ${getBnDigits(snap.todayCompleted.length)}টি · প্রয়োজন নেই (বাদ দেওয়া): ${getBnDigits(snap.todaySkipped.length)}টি`,
                    actionItems: []
                };
            }

            const lines = [`আজ (${snap.primaryShipment.name} · দিন ${getBnDigits(snap.activeAgeDays)} · ${snap.breedLabel})`];

            if (snap.todayDueNow.length > 0) {
                lines.push(`\n🟢 এখন দেওয়ার বাকি (${getBnDigits(snap.todayDueNow.length)}টি):`);
                snap.todayDueNow.forEach((m, i) => {
                    lines.push(`${getBnDigits(i + 1)}. ${m.name} (${m.time})${m.isAlternative ? ' [বিকল্প]' : ''}`);
                    lines.push(`   মাত্রা: ${m.dose}`);
                    if (m.desc) lines.push(`   নির্দেশনা: ${m.desc}`);
                });
            } else {
                lines.push(`\n✅ এখনকার বেলার সব ঔষধ সম্পন্ন হয়েছে!`);
            }

            if (snap.todayUpcomingLater.length > 0) {
                lines.push(`\n🕒 আজকের পরবর্তী বেলার বাকি (${getBnDigits(snap.todayUpcomingLater.length)}টি — সময় হলে টিক চালু হবে):`);
                snap.todayUpcomingLater.forEach((m, i) => {
                    lines.push(`${getBnDigits(i + 1)}. ${m.name} (${m.time} · ${m.tickEligibility.unlockText}-এ চালু হবে)${m.isAlternative ? ' [বিকল্প]' : ''}`);
                    if (m.desc) lines.push(`   নির্দেশনা: ${m.desc}`);
                });
            }

            if (snap.todayCompleted.length > 0 || snap.todaySkipped.length > 0) {
                lines.push(`\n(আজ সম্পন্ন: ${getBnDigits(snap.todayCompleted.length)}টি · বাদ দেওয়া: ${getBnDigits(snap.todaySkipped.length)}টি)`);
            }
            return { text: lines.join('\n'), actionItems: snap.todayDueNow.slice(0, 5) };
        }

        // General helpful response in Bengali + prompt to call Doctor if enabled
        const docCfg = getDoctorConfig();
        const promptsListText = getActiveQuickPrompts().map(p => `• ${p}`).join('\n');
        return {
            text: `আমি PK Chat Bot। নিচের বাটনগুলোতে ট্যাপ করে যেকোনো তথ্য জানতে পারেন:\n${promptsListText}`,
            actionItems: snap.todayDueNow.slice(0, 3),
            contactCard: docCfg.enabled !== false ? 'doctor' : null
        };
    }

    function determineRelevantActionItems(userText, snap) {
        const q = normalizeDialectAndBanglish(userText);
        if (q.includes('মিস')) {
            return snap.overdueRemaining.slice(0, 5);
        }
        if (q.includes('আজ') || q.includes('বাকি') || q.includes('ঔষধ') || q.includes('টিক')) {
            if (snap.todayDueNow.length > 0) return snap.todayDueNow.slice(0, 5);
            if (snap.overdueRemaining.length > 0) return snap.overdueRemaining.slice(0, 4);
        }
        return [];
    }

    function formatTimeLabel(ts) {
        try {
            return new Date(ts).toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' });
        } catch (e) {
            return '';
        }
    }

    function renderChatMessages() {
        const container = document.getElementById('pk-chat-messages');
        if (!container) return;

        const snap = computePkFarmSnapshot();
        const completedSet = new Set(snap.allCompleted.map(m => m.key));
        const skippedSet = new Set(snap.allSkipped.map(m => m.key));

        container.innerHTML = pkChatHistory.map(msg => {
            if (msg.role === 'user') {
                return `
                <div class="flex justify-end">
                    <div class="max-w-[85%] bg-teal-700 text-white rounded-2xl rounded-br-sm px-4 py-3 text-sm leading-relaxed shadow-sm whitespace-pre-line">
                        ${escapeHtml(msg.text)}
                        <div class="text-[10px] text-teal-100/80 text-right mt-1">${escapeHtml(formatTimeLabel(msg.ts))}</div>
                    </div>
                </div>`;
            }

            const pendingActions = (msg.actionItems || []).filter(item => !completedSet.has(item.key) && !skippedSet.has(item.key));
            const actionsHtml = pendingActions.length > 0
                ? `<div class="mt-3 pt-2.5 border-t border-gray-100 dark:border-gray-700 space-y-2">
                    <p class="text-[11px] font-bold text-gray-500 dark:text-gray-400">সরাসরি এখান থেকেই টিক দিন বা বাদ দিন:</p>
                    ${pendingActions.map(item => {
                        const elig = getSlotUnlockInfo(item.day, item.time, snap.activeAgeDays);
                        return `
                        <div class="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-700/60 border border-gray-200 dark:border-gray-600 space-y-2">
                            <div class="min-w-0">
                                <p class="text-xs font-bold text-gray-900 dark:text-white truncate">${escapeHtml(item.name)}</p>
                                <p class="text-[11px] text-gray-500 dark:text-gray-400 truncate">দিন ${getBnDigits(item.day)} · ${escapeHtml(item.time)}${item.isAlternative ? ' · বিকল্প' : ''}</p>
                            </div>
                            <div class="flex items-center gap-1.5">
                                ${elig.allowed
                                    ? `<button onclick="pkTickMedicine('${escapeHtml(item.key)}')" class="flex-1 min-h-[38px] px-3 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold active:scale-95 transition">টিক দিন</button>`
                                    : `<span class="flex-1 min-h-[36px] px-2.5 py-1.5 rounded-xl bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 text-[11px] font-bold text-center">🔒 ${escapeHtml(elig.unlockText)}-এ চালু</span>`}
                                <button onclick="pkSkipMedicine('${escapeHtml(item.key)}')" class="min-h-[38px] px-2.5 rounded-xl bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 text-[11px] font-bold active:scale-95 transition">প্রয়োজন নেই</button>
                            </div>
                        </div>`;
                    }).join('')}
                </div>`
                : '';

            let contactHtml = '';
            if (msg.contactCard === 'developer') {
                contactHtml = `
                <div class="mt-3 pt-2.5 border-t border-gray-100 dark:border-gray-700 flex flex-wrap gap-2">
                    <a href="${PK_DEVELOPER_BIODATA_URL}" target="_blank" rel="noopener noreferrer" class="min-h-[44px] px-3.5 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold flex items-center gap-1.5 active:scale-95 transition">
                        <span class="material-symbols-outlined text-base">open_in_new</span>
                        <span>আমার সাথে যোগাযোগ করুন</span>
                    </a>
                    <button type="button" onclick="openPkDevContactModal()" class="min-h-[44px] px-3.5 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-xs font-bold active:scale-95 transition">
                        পপ-আপ খুলুন
                    </button>
                </div>`;
            } else if (msg.contactCard === 'doctor') {
                const docCfg = getDoctorConfig();
                if (docCfg.enabled !== false) {
                    const docPhone = docCfg.phone || DEFAULT_DOCTOR_CONFIG.phone;
                    const docWa = getDoctorWhatsAppUrl(docPhone);
                    contactHtml = `
                    <div class="mt-3 pt-2.5 border-t border-gray-100 dark:border-gray-700 space-y-2">
                        <p class="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">একজন পরামর্শক বা ডাক্তারের সাথে যোগাযোগ করুন:</p>
                        <div class="flex flex-wrap gap-2">
                            <a href="tel:${escapeHtml(docPhone)}" class="min-h-[44px] px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 tabular-nums active:scale-95 transition">
                                <span class="material-symbols-outlined text-base">call</span>
                                <span>${escapeHtml(docPhone)}</span>
                            </a>
                            <a href="${escapeHtml(docWa)}" target="_blank" rel="noopener noreferrer" class="min-h-[44px] px-3.5 py-2 rounded-xl bg-teal-50 dark:bg-teal-900/30 text-teal-800 dark:text-teal-300 text-xs font-bold border border-teal-200 dark:border-teal-800 flex items-center gap-1.5 active:scale-95 transition">
                                <span class="material-symbols-outlined text-base">chat</span>
                                <span>WhatsApp</span>
                            </a>
                        </div>
                    </div>`;
                }
            }

            const boxClass = msg.isError
                ? 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
                : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100';

            return `
            <div class="flex justify-start">
                <div class="max-w-[90%] ${boxClass} rounded-2xl rounded-bl-sm px-4 py-3 text-sm leading-relaxed shadow-sm">
                    <div class="flex items-center gap-1.5 mb-1">
                        <span class="text-[11px] font-bold text-teal-700 dark:text-teal-400">PK Chat Bot</span>
                        <span class="text-[10px] text-gray-400">· ${escapeHtml(formatTimeLabel(msg.ts))}</span>
                    </div>
                    <div class="whitespace-pre-line break-words">${escapeHtml(msg.text)}</div>
                    ${actionsHtml}
                    ${contactHtml}
                </div>
            </div>`;
        }).join('');

        if (pkIsSending) {
            container.innerHTML += `
            <div class="flex justify-start" id="pk-typing-indicator">
                <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl rounded-bl-sm px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 shadow-sm">
                    PK Chat Bot হিসাব দেখে উত্তর লিখছে...
                </div>
            </div>`;
        }

        container.scrollTop = container.scrollHeight;
    }

    function ensureInitialGreeting(forceReset) {
        const uid = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.uid : null;
        if (forceReset || pkChatHistory.length === 0) {
            const snap = computePkFarmSnapshot();
            const briefing = buildDailyBriefingGreeting(snap);
            pkChatHistory = [{
                role: 'model',
                text: briefing.text,
                actionItems: briefing.actionItems,
                ts: Date.now()
            }];
            if (uid) saveChatHistory(uid);
        }
        renderChatMessages();
    }

    function resetPkChatConversation() {
        ensureInitialGreeting(true);
        if (typeof showToast === 'function') {
            showToast('নতুন চ্যাট ও আজকের আপডেট লোড হয়েছে');
        }
    }

    async function sendPkChatMessage(rawText) {
        const text = (rawText || '').trim();
        if (!text || pkIsSending) return;

        const uid = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.uid : null;
        pkChatHistory.push({ role: 'user', text, ts: Date.now() });
        if (uid) saveChatHistory(uid);

        const snap = computePkFarmSnapshot();
        syncDailyCheckinToCloud();

        // Direct Developer/Admin popup trigger
        if (isDeveloperContactQuery(text)) {
            const devReply = buildLocalAssistantReply(text, snap);
            pkChatHistory.push({
                role: 'model',
                text: devReply.text,
                actionItems: [],
                contactCard: 'developer',
                ts: Date.now()
            });
            if (uid) saveChatHistory(uid);
            renderChatMessages();
            return;
        }

        // Direct Consultant / Doctor contact trigger
        if (isDoctorContactQuery(text)) {
            const docReply = buildLocalAssistantReply(text, snap);
            pkChatHistory.push({
                role: 'model',
                text: docReply.text,
                actionItems: [],
                contactCard: docReply.contactCard || null,
                ts: Date.now()
            });
            if (uid) saveChatHistory(uid);
            renderChatMessages();
            return;
        }

        pkIsSending = true;
        renderChatMessages();

        // Compact structured context for Gemini API
        const farmContext = {
            date: snap.todayKey,
            userName: snap.userName,
            selectedBreed: snap.breed,
            selectedBreedLabel: snap.breedLabel,
            primaryShipment: snap.primaryShipment,
            totalShipmentsCount: snap.allShipments.length,
            allShipments: snap.allShipments.slice(0, 6),
            todayAgeDays: snap.activeAgeDays,
            todayMedicines: {
                totalScheduledToday: snap.todayItems.length,
                remainingToday: snap.todayRemaining.map(m => ({ day: m.day, name: m.name, time: m.time, dose: m.dose, desc: m.desc })),
                completedToday: snap.todayCompleted.map(m => ({ day: m.day, name: m.name, time: m.time }))
            },
            dailyTickActivity: {
                tickedTodayCount: snap.tickedTodayCount,
                tickedTodayStatus: snap.tickedTodayCount > 0 ? 'YES_TICKED_TODAY' : 'NOT_TICKED_TODAY',
                last7Days: snap.last7Days
            },
            overdueUntickedMedicines: snap.overdueRemaining.map(m => ({ day: m.day, name: m.name, time: m.time, dose: m.dose })),
            upcomingNext3DaysMedicines: snap.upcomingNext3Days.map(m => ({ day: m.day, name: m.name, time: m.time, dose: m.dose })),
            stockSummary: snap.stockSummary,
            dueSummary: { totalDueCount: snap.dueCount, totalDueAmount: snap.totalDueAmount }
        };

        const historyForApi = pkChatHistory
            .slice(-11, -1)
            .filter(m => !m.isError)
            .map(m => ({ role: m.role, text: m.text }));

        let replyObj = null;

        if (navigator.onLine) {
            try {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), 18000);
                const resp = await fetch('/api/pk-chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    body: JSON.stringify({
                        message: text,
                        history: historyForApi,
                        farmContext
                    }),
                    signal: controller.signal
                });
                clearTimeout(timer);

                const contentType = resp.headers.get('content-type') || '';
                if (contentType.includes('application/json')) {
                    const data = await resp.json();
                    if (resp.ok && data && data.success && data.reply) {
                        const docCfg = getDoctorConfig();
                        const mentionsDevLink = data.reply.includes('shuvopkofficial.github.io/biodata.com');
                        const mentionsDocPhone = docCfg.enabled !== false && (data.reply.includes(docCfg.phone) || data.reply.includes('ডাক্তার'));
                        if (mentionsDevLink) openPkDevContactModal();
                        replyObj = {
                            role: 'model',
                            text: data.reply,
                            actionItems: determineRelevantActionItems(text, snap),
                            contactCard: mentionsDevLink ? 'developer' : (mentionsDocPhone ? 'doctor' : null),
                            ts: Date.now()
                        };
                    } else {
                        // Surface real backend/Gemini API error clearly
                        replyObj = {
                            role: 'model',
                            text: `⚠️ এআই সার্ভার ত্রুটি: ${(data && data.error) ? data.error : `HTTP ${resp.status}`}`,
                            isError: true,
                            actionItems: determineRelevantActionItems(text, snap),
                            ts: Date.now()
                        };
                    }
                } else {
                    // Static host (e.g. GitHub Pages 404 HTML) -> use deterministic local farm & dialect engine
                    const localRes = buildLocalAssistantReply(text, snap);
                    replyObj = {
                        role: 'model',
                        text: localRes.text,
                        actionItems: localRes.actionItems || [],
                        contactCard: localRes.contactCard || null,
                        ts: Date.now()
                    };
                }
            } catch (err) {
                // Offline / unreachable backend server -> use deterministic local farm & dialect engine
                const localRes = buildLocalAssistantReply(text, snap);
                replyObj = {
                    role: 'model',
                    text: localRes.text,
                    actionItems: localRes.actionItems || [],
                    contactCard: localRes.contactCard || null,
                    ts: Date.now()
                };
            }
        } else {
            const localRes = buildLocalAssistantReply(text, snap);
            replyObj = {
                role: 'model',
                text: localRes.text,
                actionItems: localRes.actionItems || [],
                contactCard: localRes.contactCard || null,
                ts: Date.now()
            };
        }

        pkIsSending = false;
        pkChatHistory.push(replyObj);
        if (uid) saveChatHistory(uid);
        renderChatMessages();
    }

    function autoResizePkInput(el) {
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 96) + 'px';
    }

    function handlePkChatKeydown(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            handlePkChatSubmit(event);
        }
    }

    function handlePkChatSubmit(event) {
        if (event && event.preventDefault) event.preventDefault();
        const input = document.getElementById('pk-chat-input');
        if (!input) return;
        const val = input.value;
        if (!val.trim()) return;
        input.value = '';
        input.style.height = 'auto';
        sendPkChatMessage(val);
    }

    function askPkQuickPrompt(promptText) {
        if (!promptText) return;
        sendPkChatMessage(promptText);
    }

    function openPkChatBot() {
        injectPkChatbotPage();
        const uid = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.uid : null;
        if (uid) startPkBotListeners(uid);
        if (typeof navigate === 'function') {
            navigate('pk-chatbot-page');
        }
        refreshPkBotUI();
        syncDailyCheckinToCloud();
        ensureInitialGreeting(false);
    }

    // Export public handlers
    window.openPkChatBot = openPkChatBot;
    window.setPkBotBreed = setPkBotBreed;
    window.togglePkDailyDrawer = togglePkDailyDrawer;
    window.pkTickMedicine = pkTickMedicine;
    window.pkSkipMedicine = pkSkipMedicine;
    window.handlePkChatSubmit = handlePkChatSubmit;
    window.handlePkChatKeydown = handlePkChatKeydown;
    window.autoResizePkInput = autoResizePkInput;
    window.askPkQuickPrompt = askPkQuickPrompt;
    window.resetPkChatConversation = resetPkChatConversation;
    window.refreshPkBotUI = refreshPkBotUI;
    window.openPkDevContactModal = openPkDevContactModal;
    window.closePkDevContactModal = closePkDevContactModal;
    window.openPkDoctorContactModal = openPkDoctorContactModal;
    window.closePkDoctorContactModal = closePkDoctorContactModal;
    window.copyPkDoctorPhone = copyPkDoctorPhone;
    window.syncDoctorConfigUI = syncDoctorConfigUI;
    window.PK_CHATBOT_VERSION = PK_CHATBOT_VERSION;

    // Auto-refresh time-window unlocks every 60s when chatbot page is open
    setInterval(() => {
        const botPage = document.getElementById('pk-chatbot-page');
        if (botPage && botPage.classList.contains('page-visible')) {
            refreshPkBotUI();
            renderChatMessages();
        }
    }, 60000);
})();
