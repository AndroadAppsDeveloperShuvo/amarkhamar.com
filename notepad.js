/* 📝 FARM NOTEPAD MANAGER
   প্রতিটি ইউজারের ব্যক্তিগত নোটপ্যাড — অ্যাকাউন্ট ভিত্তিক Firebase RTDB-তে সেভ হয়
   এবং অফলাইনেও লোকাল ক্যাশ থেকে দেখা যায়।
*/

const notepadPageHTML = `
<div id="notepad-page" class="page tab-page bg-gray-50 dark:bg-gray-900 transition-all duration-300">
    <header class="sticky top-0 z-10 p-4 bg-white/90 dark:bg-gray-800/90 backdrop-blur-md border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
        <div class="flex items-center">
            <button onclick="goBack()" class="mr-3 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">
                <span class="material-symbols-outlined dark:text-white">arrow_back</span>
            </button>
            <div>
                <h1 class="text-xl font-bold dark:text-white leading-tight">নোটপ্যাড</h1>
                <p class="text-[11px] text-gray-500 dark:text-gray-400">আপনার অ্যাকাউন্টে নিরাপদে সংরক্ষিত</p>
            </div>
        </div>
        <span id="notepad-total-badge" class="font-bold text-teal-700 dark:text-teal-400 px-3 py-1 bg-teal-50 dark:bg-teal-900/30 rounded-full text-xs">০টি নোট</span>
    </header>

    <div class="p-4 pb-28 space-y-3.5">
        <!-- সার্চ বক্স -->
        <div class="relative">
            <span class="material-symbols-outlined text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 text-lg">search</span>
            <input id="notepad-search-input" type="text" oninput="renderNotesList()" placeholder="শিরোনাম বা লেখা দিয়ে খুঁজুন..." class="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/40">
        </div>

        <!-- ক্যাটাগরি ফিল্টার -->
        <div id="notepad-filter-bar" class="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            <button type="button" data-filter="all" onclick="setNotepadFilter('all')" class="notepad-filter-btn px-3.5 py-1.5 rounded-full bg-teal-700 text-white text-xs font-bold whitespace-nowrap shadow-sm">সব</button>
            <button type="button" data-filter="pinned" onclick="setNotepadFilter('pinned')" class="notepad-filter-btn px-3.5 py-1.5 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 text-xs font-bold whitespace-nowrap">⭐ পিন করা</button>
            <button type="button" data-filter="সাধারণ" onclick="setNotepadFilter('সাধারণ')" class="notepad-filter-btn px-3.5 py-1.5 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 text-xs font-bold whitespace-nowrap">সাধারণ</button>
            <button type="button" data-filter="হিসাব" onclick="setNotepadFilter('হিসাব')" class="notepad-filter-btn px-3.5 py-1.5 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 text-xs font-bold whitespace-nowrap">হিসাব</button>
            <button type="button" data-filter="ঔষধ ও যত্ন" onclick="setNotepadFilter('ঔষধ ও যত্ন')" class="notepad-filter-btn px-3.5 py-1.5 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 text-xs font-bold whitespace-nowrap">ঔষধ ও যত্ন</button>
            <button type="button" data-filter="জরুরি" onclick="setNotepadFilter('জরুরি')" class="notepad-filter-btn px-3.5 py-1.5 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 text-xs font-bold whitespace-nowrap">জরুরি</button>
        </div>

        <!-- নোটের তালিকা -->
        <div id="notepad-list-container" class="space-y-3">
            <p class="text-center text-gray-400 text-sm py-10">লোড হচ্ছে...</p>
        </div>
    </div>

    <!-- নতুন নোট বাটন -->
    <div class="fixed bottom-10 right-6 z-20">
        <button onclick="openNotepadModal()" class="w-14 h-14 rounded-full bg-teal-700 text-white shadow-xl flex items-center justify-center transform transition hover:scale-110 active:scale-95" title="নতুন নোট লিখুন">
            <span class="material-symbols-outlined text-3xl">add</span>
        </button>
    </div>
</div>

<!-- নোট লেখা / এডিট করার মোডাল -->
<div id="notepad-modal" class="hidden fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm">
    <div class="bg-white dark:bg-gray-800 w-full sm:w-[28rem] rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 relative max-h-[92vh] overflow-y-auto animate-[slideUp_0.25s_ease-out]">
        <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2" id="notepad-modal-title">
                <span class="material-symbols-outlined text-amber-500">edit_note</span>
                <span>নতুন নোট</span>
            </h2>
            <div class="flex items-center gap-1.5">
                <button type="button" id="note-pin-toggle-btn" onclick="toggleNoteModalPin()" class="p-2 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 hover:bg-amber-50 hover:text-amber-600 transition" title="উপরে পিন করুন">
                    <span class="material-symbols-outlined text-xl">push_pin</span>
                </button>
                <button type="button" id="note-copy-btn" onclick="copyCurrentNoteText()" class="hidden p-2 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 hover:bg-teal-50 hover:text-teal-600 transition" title="নোট কপি করুন">
                    <span class="material-symbols-outlined text-xl">content_copy</span>
                </button>
                <button type="button" onclick="closeNotepadModal()" class="p-2 bg-gray-100 dark:bg-gray-700 rounded-full hover:bg-red-100 hover:text-red-500 transition">
                    <span class="material-symbols-outlined text-xl dark:text-gray-300">close</span>
                </button>
            </div>
        </div>

        <form id="notepad-form" onsubmit="saveNoteItem(event)" class="space-y-3.5">
            <input type="hidden" id="note-edit-id">
            <input type="hidden" id="note-pinned-value" value="false">

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div class="sm:col-span-2">
                    <label class="text-xs font-bold text-gray-500 dark:text-gray-400 ml-1">শিরোনাম</label>
                    <input id="note-title-input" maxlength="100" placeholder="যেমন: ফিডের দাম, ডিলারের নম্বর" class="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm font-semibold text-gray-800 dark:text-white mt-1 focus:outline-none focus:ring-2 focus:ring-teal-500/40">
                </div>
                <div>
                    <label class="text-xs font-bold text-gray-500 dark:text-gray-400 ml-1">ধরন</label>
                    <select id="note-category-select" class="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm text-gray-800 dark:text-white mt-1 focus:outline-none focus:ring-2 focus:ring-teal-500/40">
                        <option value="সাধারণ">সাধারণ</option>
                        <option value="হিসাব">হিসাব</option>
                        <option value="ঔষধ ও যত্ন">ঔষধ ও যত্ন</option>
                        <option value="জরুরি">জরুরি</option>
                    </select>
                </div>
            </div>

            <div>
                <label class="text-xs font-bold text-gray-500 dark:text-gray-400 ml-1">বিস্তারিত লেখা</label>
                <textarea id="note-content-input" rows="7" required placeholder="এখানে আপনার প্রয়োজনীয় নোট, বাজার দর, ঔষধের নিয়ম বা কাজের তালিকা লিখে রাখুন..." class="w-full p-3.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm text-gray-800 dark:text-white mt-1 leading-relaxed focus:outline-none focus:ring-2 focus:ring-teal-500/40"></textarea>
            </div>

            <div class="flex flex-col gap-2 pt-1">
                <button type="submit" id="note-save-btn" class="w-full p-3.5 bg-teal-700 hover:bg-teal-800 text-white font-bold rounded-xl shadow-lg transition">সেভ করুন</button>
                <button type="button" onclick="handleDeleteNoteClick()" id="btn-delete-note" class="hidden w-full p-3 text-red-500 font-bold hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition text-sm">ডিলিট করুন</button>
            </div>
        </form>
    </div>
</div>
`;

let allNotesData = [];
let activeNotepadFilter = 'all';
let activeNotesListenerRef = null;
let activeNotesListenerUid = null;
let pendingDeleteNoteConfirm = false;
let pendingDeleteConfirmTimer = null;

function ensureNotepadDOMInjected() {
    if (document.getElementById('notepad-page')) return;
    const mainApp = document.getElementById('main-app');
    if (mainApp) {
        mainApp.insertAdjacentHTML('beforeend', notepadPageHTML);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    ensureNotepadDOMInjected();
    if (typeof auth !== 'undefined' && auth && typeof auth.onAuthStateChanged === 'function') {
        auth.onAuthStateChanged(user => {
            if (user && user.uid) {
                startNotepadListener(user.uid);
            } else {
                stopNotepadListener();
            }
        });
    }
});

function escapeNoteHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function toNotepadBnDigits(val) {
    return String(val).replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[d]);
}

function formatNoteDateBn(isoStr) {
    if (!isoStr) return '';
    try {
        const dt = new Date(isoStr);
        if (Number.isNaN(dt.getTime())) return '';
        return dt.toLocaleDateString('bn-BD', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (_) {
        return '';
    }
}

function buildNotesArrayFromMap(dataMap) {
    if (!dataMap || typeof dataMap !== 'object') return [];
    return Object.entries(dataMap)
        .filter(([, item]) => item && typeof item === 'object')
        .map(([key, item]) => ({ id: key, ...item }))
        .sort((a, b) => {
            if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
            const tA = new Date(a.updatedAt || a.createdAt || 0).getTime() || 0;
            const tB = new Date(b.updatedAt || b.createdAt || 0).getTime() || 0;
            return tB - tA;
        });
}

function stopNotepadListener() {
    if (activeNotesListenerRef) {
        try {
            activeNotesListenerRef.off('value');
        } catch (_) {}
        activeNotesListenerRef = null;
    }
    activeNotesListenerUid = null;
    allNotesData = [];
    const listContainer = document.getElementById('notepad-list-container');
    if (listContainer) listContainer.innerHTML = '';
    const badge = document.getElementById('notepad-total-badge');
    if (badge) badge.innerText = '০টি নোট';
}

function startNotepadListener(uid) {
    if (!uid || typeof db === 'undefined') return;
    ensureNotepadDOMInjected();

    // প্রথমে অফলাইন লোকালস্টোরেজ থেকে লোড করে দেখানো
    try {
        const cached = localStorage.getItem('offline_notes_' + uid);
        if (cached) {
            allNotesData = buildNotesArrayFromMap(JSON.parse(cached));
            renderNotesList();
        }
    } catch (_) {}

    if (activeNotesListenerUid === uid && activeNotesListenerRef) {
        renderNotesList();
        return;
    }

    if (activeNotesListenerRef) {
        try { activeNotesListenerRef.off('value'); } catch (_) {}
    }

    activeNotesListenerUid = uid;
    activeNotesListenerRef = db.ref(`users/${uid}/notes`);
    activeNotesListenerRef.on('value', snapshot => {
        const data = snapshot.val();
        if (data && typeof data === 'object') {
            try {
                localStorage.setItem('offline_notes_' + uid, JSON.stringify(data));
            } catch (_) {}
            allNotesData = buildNotesArrayFromMap(data);
        } else {
            try {
                localStorage.removeItem('offline_notes_' + uid);
            } catch (_) {}
            allNotesData = [];
        }
        renderNotesList();
    });
}

function loadNotepadData() {
    if (typeof currentUser === 'undefined' || !currentUser || !currentUser.uid) return;
    startNotepadListener(currentUser.uid);
}

function openNotepadPage() {
    ensureNotepadDOMInjected();
    if (typeof navigate === 'function') {
        navigate('notepad-page');
    }
    loadNotepadData();
    renderNotesList();
}

function setNotepadFilter(filterVal) {
    activeNotepadFilter = filterVal || 'all';
    document.querySelectorAll('.notepad-filter-btn').forEach(btn => {
        const isActive = btn.getAttribute('data-filter') === activeNotepadFilter;
        btn.className = isActive
            ? 'notepad-filter-btn px-3.5 py-1.5 rounded-full bg-teal-700 text-white text-xs font-bold whitespace-nowrap shadow-sm'
            : 'notepad-filter-btn px-3.5 py-1.5 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 text-xs font-bold whitespace-nowrap';
    });
    renderNotesList();
}

function renderNotesList() {
    const listContainer = document.getElementById('notepad-list-container');
    const badge = document.getElementById('notepad-total-badge');
    if (!listContainer) return;

    if (badge) {
        badge.innerText = `${toNotepadBnDigits(allNotesData.length)}টি নোট`;
    }

    const searchInput = document.getElementById('notepad-search-input');
    const query = searchInput ? searchInput.value.trim().toLowerCase() : '';

    const filtered = allNotesData.filter(note => {
        if (activeNotepadFilter === 'pinned' && !note.pinned) return false;
        if (activeNotepadFilter !== 'all' && activeNotepadFilter !== 'pinned') {
            if ((note.category || 'সাধারণ') !== activeNotepadFilter) return false;
        }
        if (query) {
            const titleText = String(note.title || '').toLowerCase();
            const contentText = String(note.content || '').toLowerCase();
            if (!titleText.includes(query) && !contentText.includes(query)) return false;
        }
        return true;
    });

    if (filtered.length === 0) {
        const emptyTitle = allNotesData.length === 0 ? 'এখনো কোনো নোট লেখা হয়নি' : 'এই ফিল্টারে কোনো নোট পাওয়া যায়নি';
        const emptySub = allNotesData.length === 0
            ? 'নিচের + বাটনে ট্যাপ করে খামারের দরকারি তথ্য লিখে রাখুন।'
            : 'অন্য কী-ওয়ার্ড বা "সব" ফিল্টার দিয়ে খুঁজে দেখুন।';
        listContainer.innerHTML = `
            <div class="text-center py-14 px-4">
                <div class="w-16 h-16 mx-auto rounded-2xl bg-amber-50 dark:bg-amber-900/20 text-amber-500 flex items-center justify-center mb-3">
                    <span class="material-symbols-outlined text-4xl">edit_note</span>
                </div>
                <p class="font-bold text-gray-700 dark:text-gray-200 text-sm">${emptyTitle}</p>
                <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">${emptySub}</p>
            </div>
        `;
        return;
    }

    const catStyles = {
        'সাধারণ': 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
        'হিসাব': 'bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
        'ঔষধ ও যত্ন': 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
        'জরুরি': 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300'
    };

    listContainer.innerHTML = filtered.map(note => {
        const cat = note.category || 'সাধারণ';
        const badgeCls = catStyles[cat] || catStyles['সাধারণ'];
        const titleSafe = escapeNoteHtml(note.title || 'শিরোনামহীন নোট');
        const contentSafe = escapeNoteHtml(note.content || '').replace(/\n/g, '<br>');
        const dateLabel = formatNoteDateBn(note.updatedAt || note.createdAt);
        const pinCls = note.pinned
            ? 'text-amber-500 bg-amber-50 dark:bg-amber-900/30'
            : 'text-gray-400 hover:text-amber-500 hover:bg-gray-100 dark:hover:bg-gray-700';

        return `
        <div onclick="editNoteItem('${escapeNoteHtml(note.id)}')" class="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border ${note.pinned ? 'border-amber-200 dark:border-amber-700/60' : 'border-gray-100 dark:border-gray-700'} cursor-pointer hover:shadow-md transition">
            <div class="flex items-start justify-between gap-2 mb-1.5">
                <div class="flex items-center gap-2 flex-wrap min-w-0">
                    <span class="px-2 py-0.5 rounded-md text-[10px] font-bold ${badgeCls}">${escapeNoteHtml(cat)}</span>
                    ${note.pinned ? '<span class="text-[10px] font-bold text-amber-600 dark:text-amber-400">⭐ পিন করা</span>' : ''}
                </div>
                <button type="button" onclick="toggleQuickNotePin(event, '${escapeNoteHtml(note.id)}')" class="p-1.5 rounded-full transition flex-shrink-0 ${pinCls}" title="পিন টগল">
                    <span class="material-symbols-outlined text-base">push_pin</span>
                </button>
            </div>
            <h3 class="font-bold text-sm text-gray-900 dark:text-white truncate mb-1">${titleSafe}</h3>
            <p class="text-xs text-gray-600 dark:text-gray-300 leading-relaxed line-clamp-3 break-words">${contentSafe}</p>
            ${dateLabel ? `<div class="mt-2.5 pt-2 border-t border-gray-50 dark:border-gray-700/70 flex items-center justify-between text-[10px] text-gray-400">
                <span>আপডেট: ${escapeNoteHtml(dateLabel)}</span>
                <span class="text-teal-600 dark:text-teal-400 font-semibold">পড়ুন / এডিট</span>
            </div>` : ''}
        </div>`;
    }).join('');
}

function updateModalPinAppearance(isPinned) {
    const input = document.getElementById('note-pinned-value');
    const btn = document.getElementById('note-pin-toggle-btn');
    if (input) input.value = isPinned ? 'true' : 'false';
    if (btn) {
        btn.className = isPinned
            ? 'p-2 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 transition'
            : 'p-2 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 hover:bg-amber-50 hover:text-amber-600 transition';
    }
}

function toggleNoteModalPin() {
    const input = document.getElementById('note-pinned-value');
    const current = input && input.value === 'true';
    updateModalPinAppearance(!current);
}

function resetDeleteNoteButton() {
    pendingDeleteNoteConfirm = false;
    if (pendingDeleteConfirmTimer) {
        clearTimeout(pendingDeleteConfirmTimer);
        pendingDeleteConfirmTimer = null;
    }
    const delBtn = document.getElementById('btn-delete-note');
    if (delBtn) {
        delBtn.innerText = 'ডিলিট করুন';
        delBtn.className = 'w-full p-3 text-red-500 font-bold hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition text-sm';
    }
}

function openNotepadModal() {
    ensureNotepadDOMInjected();
    const form = document.getElementById('notepad-form');
    if (form) form.reset();

    document.getElementById('note-edit-id').value = '';
    document.getElementById('note-category-select').value = 'সাধারণ';
    updateModalPinAppearance(false);

    const modalTitle = document.getElementById('notepad-modal-title');
    if (modalTitle) {
        modalTitle.innerHTML = `<span class="material-symbols-outlined text-amber-500">edit_note</span><span>নতুন নোট</span>`;
    }

    const delBtn = document.getElementById('btn-delete-note');
    if (delBtn) {
        resetDeleteNoteButton();
        delBtn.classList.add('hidden');
    }
    const copyBtn = document.getElementById('note-copy-btn');
    if (copyBtn) copyBtn.classList.add('hidden');

    document.getElementById('notepad-modal').classList.remove('hidden');
    setTimeout(() => {
        const contentEl = document.getElementById('note-content-input');
        const titleEl = document.getElementById('note-title-input');
        if (titleEl) titleEl.focus();
        else if (contentEl) contentEl.focus();
    }, 80);
}

function closeNotepadModal() {
    resetDeleteNoteButton();
    const modal = document.getElementById('notepad-modal');
    if (modal) modal.classList.add('hidden');
}

function editNoteItem(id) {
    ensureNotepadDOMInjected();
    const note = allNotesData.find(n => n.id === id);
    if (!note) return;

    document.getElementById('note-edit-id').value = id;
    document.getElementById('note-title-input').value = note.title || '';
    document.getElementById('note-category-select').value = note.category || 'সাধারণ';
    document.getElementById('note-content-input').value = note.content || '';
    updateModalPinAppearance(!!note.pinned);

    const modalTitle = document.getElementById('notepad-modal-title');
    if (modalTitle) {
        modalTitle.innerHTML = `<span class="material-symbols-outlined text-teal-600">edit_note</span><span>নোট সম্পাদনা</span>`;
    }

    const delBtn = document.getElementById('btn-delete-note');
    if (delBtn) {
        resetDeleteNoteButton();
        delBtn.classList.remove('hidden');
    }
    const copyBtn = document.getElementById('note-copy-btn');
    if (copyBtn) copyBtn.classList.remove('hidden');

    document.getElementById('notepad-modal').classList.remove('hidden');
}

function persistLocalNotesCache(uid, notesMap) {
    try {
        if (notesMap && Object.keys(notesMap).length > 0) {
            localStorage.setItem('offline_notes_' + uid, JSON.stringify(notesMap));
        } else {
            localStorage.removeItem('offline_notes_' + uid);
        }
    } catch (_) {}
}

function getNotesMapSnapshot() {
    const map = {};
    allNotesData.forEach(n => {
        if (n && n.id) {
            const { id, ...rest } = n;
            map[id] = rest;
        }
    });
    return map;
}

function saveNoteItem(e) {
    e.preventDefault();
    if (typeof currentUser === 'undefined' || !currentUser || !currentUser.uid) {
        if (typeof showToast === 'function') showToast('⚠️ নোট সেভ করতে প্রথমে লগইন করুন!');
        return;
    }

    const uid = currentUser.uid;
    const id = document.getElementById('note-edit-id').value.trim();
    const rawTitle = document.getElementById('note-title-input').value.trim();
    const content = document.getElementById('note-content-input').value.trim();
    const category = document.getElementById('note-category-select').value || 'সাধারণ';
    const pinned = document.getElementById('note-pinned-value').value === 'true';

    if (!content) {
        if (typeof showToast === 'function') showToast('⚠️ অনুগ্রহ করে কিছু লিখুন!');
        return;
    }

    const derivedTitle = rawTitle || content.split(/\r?\n/)[0].slice(0, 45) || 'শিরোনামহীন নোট';
    const nowIso = new Date().toISOString();

    if (id) {
        const existing = allNotesData.find(n => n.id === id);
        const updateData = {
            title: derivedTitle,
            content,
            category,
            pinned,
            createdAt: (existing && existing.createdAt) || nowIso,
            updatedAt: nowIso
        };
        db.ref(`users/${uid}/notes/${id}`).update(updateData).catch(err => {
            console.warn('Note cloud update queued/error:', err);
        });
        const map = getNotesMapSnapshot();
        map[id] = updateData;
        persistLocalNotesCache(uid, map);
        allNotesData = buildNotesArrayFromMap(map);
        renderNotesList();
        if (typeof showToast === 'function') {
            showToast(navigator.onLine ? 'নোট আপডেট হয়েছে ✅' : 'অফলাইনে সেভ হয়েছে, নেট এলে সিঙ্ক হবে ⚠️');
        }
    } else {
        const newData = {
            title: derivedTitle,
            content,
            category,
            pinned,
            createdAt: nowIso,
            updatedAt: nowIso
        };
        const newRef = db.ref(`users/${uid}/notes`).push();
        const newId = newRef.key;
        newRef.set(newData).catch(err => {
            console.warn('Note cloud save queued/error:', err);
        });
        const map = getNotesMapSnapshot();
        map[newId] = newData;
        persistLocalNotesCache(uid, map);
        allNotesData = buildNotesArrayFromMap(map);
        renderNotesList();
        if (typeof showToast === 'function') {
            showToast(navigator.onLine ? 'নতুন নোট সেভ হয়েছে 🎉' : 'অফলাইনে সেভ হয়েছে, নেট এলে সিঙ্ক হবে ⚠️');
        }
    }

    closeNotepadModal();
}

function toggleQuickNotePin(event, id) {
    if (event && event.stopPropagation) event.stopPropagation();
    if (typeof currentUser === 'undefined' || !currentUser || !currentUser.uid) return;
    const note = allNotesData.find(n => n.id === id);
    if (!note) return;

    const uid = currentUser.uid;
    const nextPinned = !note.pinned;
    db.ref(`users/${uid}/notes/${id}`).update({ pinned: nextPinned }).catch(() => {});

    const map = getNotesMapSnapshot();
    if (map[id]) map[id].pinned = nextPinned;
    persistLocalNotesCache(uid, map);
    allNotesData = buildNotesArrayFromMap(map);
    renderNotesList();

    if (typeof showToast === 'function') {
        showToast(nextPinned ? 'নোট উপরে পিন করা হয়েছে ⭐' : 'পিন সরানো হয়েছে');
    }
}

function handleDeleteNoteClick() {
    const id = document.getElementById('note-edit-id').value.trim();
    if (!id || typeof currentUser === 'undefined' || !currentUser || !currentUser.uid) return;

    if (!pendingDeleteNoteConfirm) {
        pendingDeleteNoteConfirm = true;
        const delBtn = document.getElementById('btn-delete-note');
        if (delBtn) {
            delBtn.innerText = 'নিশ্চিত ডিলিট করতে আবার ট্যাপ করুন ⚠️';
            delBtn.className = 'w-full p-3 bg-red-600 text-white font-bold rounded-xl transition text-sm shadow-sm';
        }
        pendingDeleteConfirmTimer = setTimeout(() => {
            resetDeleteNoteButton();
        }, 4000);
        return;
    }

    const uid = currentUser.uid;
    db.ref(`users/${uid}/notes/${id}`).remove().catch(err => {
        console.warn('Note delete sync error:', err);
    });

    const map = getNotesMapSnapshot();
    delete map[id];
    persistLocalNotesCache(uid, map);
    allNotesData = buildNotesArrayFromMap(map);
    renderNotesList();

    if (typeof showToast === 'function') showToast('নোট ডিলিট হয়েছে 🗑️');
    closeNotepadModal();
}

function copyCurrentNoteText() {
    const title = document.getElementById('note-title-input').value.trim();
    const content = document.getElementById('note-content-input').value.trim();
    const fullText = title ? `${title}\n\n${content}` : content;
    if (!fullText) return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(fullText).then(() => {
            if (typeof showToast === 'function') showToast('নোট কপি করা হয়েছে 📋');
        }).catch(() => {});
    }
}
