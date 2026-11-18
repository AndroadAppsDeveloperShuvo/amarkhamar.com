/* 🔔 SMART NOTIFICATION SYSTEM
   ১. দিনের সময় অনুযায়ী পরামর্শ দেখাবে।
   ২. স্টক কমে গেলে (২ বা তার কম) অ্যালার্ট দিবে।
   ৩. PK Chat Bot থেকে দৈনিক ঔষধ বাকি বা রিমাইন্ডার মেসেজ যুক্ত করবে।
*/

// গ্লোবাল ভেরিয়েবল
let timeNotifications = [];
let stockNotifications = [];
let botNotifications = [];

document.addEventListener('DOMContentLoaded', () => {
    generateTimeBasedNotifications();
    renderAllNotifications();
    setInterval(() => {
        generateTimeBasedNotifications();
        renderAllNotifications();
    }, 60000);
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

// ১. সময়ের উপর ভিত্তি করে নোটিফিকেশন তৈরি
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

    // সকাল
    if (hour >= 5 && hour < 12) {
        timeNotifications.push({ icon: '☀️', color: 'bg-orange-100 text-orange-600', title: 'সুপ্রভাত!', desc: 'আজকের দিনটি শুভ হোক। পানির পাত্রগুলো পরিষ্কার করেছেন কি?' });
        timeNotifications.push({ icon: '📝', color: 'bg-blue-100 text-blue-600', title: 'সকালের খাবার', desc: 'মোরগগুলোকে সকালের খাবার ও ওষুধ ঠিকমতো দিন।' });
    }
    // দুপুর (গরম)
    else if (hour >= 12 && hour < 16) {
        timeNotifications.push({ icon: '🔥', color: 'bg-red-100 text-red-600', title: 'তাপমাত্রার সতর্কতা', desc: 'শেডের তাপমাত্রা চেক করুন। ফ্যান বা স্প্রে ব্যবহার করুন।' });
        timeNotifications.push({ icon: '💧', color: 'bg-cyan-100 text-cyan-600', title: 'স্যালাইন', desc: 'গরম বেশি থাকলে পানিতে ভিটামিন-সি বা স্যালাইন দিন।' });
    }
    // বিকাল
    else if (hour >= 16 && hour < 19) {
        timeNotifications.push({ icon: '⛅', color: 'bg-green-100 text-green-600', title: 'বিকালের যত্ন', desc: 'লিটার (বিছানা) শুকনো আছে কি না দেখে নিন।' });
    }
    // রাত
    else {
        timeNotifications.push({ icon: '🌙', color: 'bg-indigo-100 text-indigo-600', title: 'শুভ রাত্রি', desc: 'মশা বা পোকা মাকড় থেকে সাবধানে রাখুন। লাইট ঠিক আছে তো?' });
        timeNotifications.push({ icon: '🔒', color: 'bg-gray-100 text-gray-600', title: 'নিরাপত্তা', desc: 'ঘুমানোর আগে শেডের দরজা ও নিরাপত্তা নিশ্চিত করুন।' });
    }

    // রেন্ডম টিপস
    if (Math.random() > 0.7) {
        timeNotifications.push({ icon: '💡', color: 'bg-purple-100 text-purple-600', title: 'টিপস', desc: 'লাভ বাড়াতে খাবারের অপচয় রোধ করুন।' });
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
