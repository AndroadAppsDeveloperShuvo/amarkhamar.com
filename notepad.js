/* 📝 IPHONE-STYLE FARM NOTEPAD MANAGER
   ছবি (ক্যামেরা/গ্যালারি), চেকলিস্ট, রঙ, পিন, সার্চ ও অফলাইন ক্যাশসহ
   প্রতিটি ইউজারের নিজস্ব Firebase অ্যাকাউন্টে (users/{uid}/notes) সংরক্ষিত।
*/

const notepadPageHTML = `
<div id="notepad-page" class="page tab-page bg-gray-50 dark:bg-gray-900 transition-all duration-300">
    <header class="sticky top-0 z-10 p-4 bg-white/95 dark:bg-gray-800/95 backdrop-blur-md border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
        <div class="flex items-center">
            <button onclick="goBack()" class="mr-3 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">
                <span class="material-symbols-outlined dark:text-white">arrow_back</span>
            </button>
            <div>
                <h1 class="text-xl font-bold dark:text-white leading-tight flex items-center gap-1.5">
                    <span>নোটপ্যাড</span>
                </h1>
                <p class="text-[11px] text-gray-500 dark:text-gray-400">ছবি, চেকলিস্ট ও নোট — অ্যাকাউন্টে সেভ থাকে</p>
            </div>
        </div>
        <span id="notepad-total-badge" class="font-bold text-amber-700 dark:text-amber-300 px-3 py-1 bg-amber-50 dark:bg-amber-900/30 rounded-full text-xs">০টি নোট</span>
    </header>

    <div class="p-4 pb-28 space-y-3.5">
        <!-- সার্চ বক্স (iOS Notes style) -->
        <div class="relative">
            <span class="material-symbols-outlined text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 text-lg">search</span>
            <input id="notepad-search-input" type="text" oninput="renderNotesList()" placeholder="শিরোনাম, লেখা বা চেকলিস্ট খুঁজুন..." class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40">
        </div>

        <!-- ক্যাটাগরি ফিল্টার -->
        <div id="notepad-filter-bar" class="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            <button type="button" data-filter="all" onclick="setNotepadFilter('all')" class="notepad-filter-btn px-3.5 py-1.5 rounded-full bg-amber-500 text-white text-xs font-bold whitespace-nowrap shadow-sm">সব</button>
            <button type="button" data-filter="pinned" onclick="setNotepadFilter('pinned')" class="notepad-filter-btn px-3.5 py-1.5 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 text-xs font-bold whitespace-nowrap">⭐ পিন করা</button>
            <button type="button" data-filter="photos" onclick="setNotepadFilter('photos')" class="notepad-filter-btn px-3.5 py-1.5 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 text-xs font-bold whitespace-nowrap">📷 ছবিসহ</button>
            <button type="button" data-filter="হিসাব" onclick="setNotepadFilter('হিসাব')" class="notepad-filter-btn px-3.5 py-1.5 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 text-xs font-bold whitespace-nowrap">হিসাব</button>
            <button type="button" data-filter="ঔষধ ও যত্ন" onclick="setNotepadFilter('ঔষধ ও যত্ন')" class="notepad-filter-btn px-3.5 py-1.5 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 text-xs font-bold whitespace-nowrap">ঔষধ ও যত্ন</button>
            <button type="button" data-filter="জরুরি" onclick="setNotepadFilter('জরুরি')" class="notepad-filter-btn px-3.5 py-1.5 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 text-xs font-bold whitespace-nowrap">জরুরি</button>
        </div>

        <!-- নোটের তালিকা -->
        <div id="notepad-list-container" class="space-y-4">
            <p class="text-center text-gray-400 text-sm py-10">লোড হচ্ছে...</p>
        </div>
    </div>

    <!-- নতুন নোট বাটন (iPhone Notes compose style) -->
    <div class="fixed bottom-10 right-6 z-20">
        <button onclick="openNotepadModal()" class="w-14 h-14 rounded-full bg-amber-500 hover:bg-amber-600 text-white shadow-xl flex items-center justify-center transform transition hover:scale-110 active:scale-95" title="নতুন নোট লিখুন">
            <span class="material-symbols-outlined text-3xl">edit_square</span>
        </button>
    </div>
</div>

<!-- iPhone Notes স্টাইল নোট এডিটর মোডাল -->
<div id="notepad-modal" class="hidden fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm">
    <div id="notepad-modal-card" class="bg-white dark:bg-gray-900 w-full sm:w-[32rem] h-[94vh] sm:h-auto sm:max-h-[90vh] rounded-t-3xl sm:rounded-3xl flex flex-col overflow-hidden shadow-2xl border border-gray-100 dark:border-gray-700 animate-[slideUp_0.25s_ease-out]">
        <!-- উপরের iOS-স্টাইল হেডার বার -->
        <div class="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between flex-shrink-0 bg-white/95 dark:bg-gray-900/95">
            <button type="button" onclick="closeNotepadModal()" class="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-bold text-sm px-2 py-1 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20 transition">
                <span class="material-symbols-outlined text-lg">arrow_back_ios_new</span>
                <span>নোটস</span>
            </button>

            <div class="flex items-center gap-1">
                <button type="button" id="note-pin-toggle-btn" onclick="toggleNoteModalPin()" class="p-2 rounded-full text-gray-500 dark:text-gray-300 hover:bg-amber-50 hover:text-amber-600 transition" title="উপরে পিন করুন">
                    <span class="material-symbols-outlined text-xl">push_pin</span>
                </button>
                <button type="button" id="note-share-btn" onclick="shareOrCopyCurrentNote()" class="p-2 rounded-full text-gray-500 dark:text-gray-300 hover:bg-teal-50 hover:text-teal-600 transition" title="শেয়ার বা কপি করুন">
                    <span class="material-symbols-outlined text-xl">ios_share</span>
                </button>
                <button type="button" id="note-top-save-btn" onclick="document.getElementById('notepad-form').requestSubmit()" class="ml-1 px-3.5 py-1.5 rounded-full bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-sm transition">
                    সেভ
                </button>
            </div>
        </div>

        <!-- স্ক্রলযোগ্য এডিটর বডি -->
        <form id="notepad-form" onsubmit="saveNoteItem(event)" class="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            <input type="hidden" id="note-edit-id">
            <input type="hidden" id="note-pinned-value" value="false">
            <input type="hidden" id="note-color-value" value="default">

            <!-- মেটা সারি: ক্যাটাগরি + নোটের রঙ -->
            <div class="flex items-center justify-between gap-2 flex-wrap">
                <select id="note-category-select" class="px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs font-bold text-gray-700 dark:text-gray-200 focus:outline-none">
                    <option value="সাধারণ">📁 সাধারণ</option>
                    <option value="হিসাব">💰 হিসাব</option>
                    <option value="ঔষধ ও যত্ন">💊 ঔষধ ও যত্ন</option>
                    <option value="জরুরি">🚨 জরুরি</option>
                </select>

                <div class="flex items-center gap-1.5" title="নোটের রঙ">
                    <button type="button" data-color="default" onclick="setNoteModalColor('default')" class="note-color-dot w-5 h-5 rounded-full border-2 border-gray-300 bg-white dark:bg-gray-700"></button>
                    <button type="button" data-color="amber" onclick="setNoteModalColor('amber')" class="note-color-dot w-5 h-5 rounded-full border border-amber-300 bg-amber-100"></button>
                    <button type="button" data-color="teal" onclick="setNoteModalColor('teal')" class="note-color-dot w-5 h-5 rounded-full border border-teal-300 bg-teal-100"></button>
                    <button type="button" data-color="blue" onclick="setNoteModalColor('blue')" class="note-color-dot w-5 h-5 rounded-full border border-blue-300 bg-blue-100"></button>
                    <button type="button" data-color="rose" onclick="setNoteModalColor('rose')" class="note-color-dot w-5 h-5 rounded-full border border-rose-300 bg-rose-100"></button>
                </div>
            </div>

            <!-- তারিখ ও মেটা টাইম -->
            <div id="note-editor-timestamp" class="text-[11px] text-center text-gray-400 dark:text-gray-500">আজকের নোট</div>

            <!-- বোল্ড শিরোনাম ইনপুট (iPhone Notes style borderless) -->
            <input id="note-title-input" maxlength="120" placeholder="শিরোনাম লিখুন..." class="w-full bg-transparent text-xl font-bold text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none">

            <!-- মূল লেখা -->
            <textarea id="note-content-input" rows="5" placeholder="এখানে আপনার নোট লিখুন... (চাইলে নিচের টুলবার থেকে ছবি বা চেকলিস্ট যোগ করতে পারবেন)" class="w-full bg-transparent text-sm sm:text-base text-gray-800 dark:text-gray-100 placeholder-gray-400 leading-relaxed focus:outline-none resize-y min-h-[110px]"></textarea>

            <!-- চেকলিস্ট সেকশন -->
            <div id="note-checklist-section" class="hidden space-y-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                <div class="flex items-center justify-between">
                    <span class="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                        <span class="material-symbols-outlined text-sm">check_box</span> চেকলিস্ট
                    </span>
                    <button type="button" onclick="addChecklistRow('', true)" class="text-xs font-bold text-teal-700 dark:text-teal-400 hover:underline flex items-center gap-0.5">
                        <span class="material-symbols-outlined text-sm">add</span> আইটেম যোগ করুন
                    </button>
                </div>
                <div id="note-checklist-rows" class="space-y-2"></div>
            </div>

            <!-- ছবি গ্যালারি গ্রিড (নোটের ভেতর সংযুক্ত ছবি) -->
            <div id="note-images-section" class="hidden space-y-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                <div class="flex items-center justify-between">
                    <span class="text-xs font-bold text-gray-500 dark:text-gray-400 flex items-center gap-1">
                        <span class="material-symbols-outlined text-sm text-amber-500">photo_library</span> সংযুক্ত ছবি (<span id="note-images-count">০</span>/৫)
                    </span>
                    <span id="note-images-processing" class="hidden text-[11px] text-amber-600 font-semibold animate-pulse">ছবি প্রস্তুত হচ্ছে...</span>
                </div>
                <div id="note-images-grid" class="grid grid-cols-3 gap-2.5"></div>
            </div>

            <!-- নিচের ডিলিট বাটন (পুরোনো নোট এডিটের সময়) -->
            <div class="pt-2">
                <button type="button" onclick="handleDeleteNoteClick()" id="btn-delete-note" class="hidden w-full p-3 text-red-500 font-bold hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition text-sm">ডিলিট করুন</button>
            </div>
        </form>

        <!-- iPhone Notes বটম টুলবার (চেকলিস্ট, ক্যামেরা, গ্যালারি) -->
        <div class="px-4 py-2.5 border-t border-gray-100 dark:border-gray-800 bg-gray-50/95 dark:bg-gray-800/95 flex items-center justify-between flex-shrink-0">
            <div class="flex items-center gap-1 sm:gap-2">
                <button type="button" onclick="addChecklistRow('', true)" class="flex items-center gap-1 px-2.5 py-2 rounded-xl text-gray-700 dark:text-gray-200 hover:bg-amber-50 dark:hover:bg-gray-700 text-xs font-bold transition" title="চেকলিস্ট যোগ করুন">
                    <span class="material-symbols-outlined text-lg text-amber-600 dark:text-amber-400">check_circle</span>
                    <span>লিস্ট</span>
                </button>
                <button type="button" onclick="triggerNotePhotoInput('camera')" class="flex items-center gap-1 px-2.5 py-2 rounded-xl text-gray-700 dark:text-gray-200 hover:bg-amber-50 dark:hover:bg-gray-700 text-xs font-bold transition" title="ক্যামেরা দিয়ে ছবি তুলুন">
                    <span class="material-symbols-outlined text-lg text-amber-600 dark:text-amber-400">photo_camera</span>
                    <span>ক্যামেরা</span>
                </button>
                <button type="button" onclick="triggerNotePhotoInput('gallery')" class="flex items-center gap-1 px-2.5 py-2 rounded-xl text-gray-700 dark:text-gray-200 hover:bg-amber-50 dark:hover:bg-gray-700 text-xs font-bold transition" title="গ্যালারি থেকে ছবি দিন">
                    <span class="material-symbols-outlined text-lg text-amber-600 dark:text-amber-400">add_photo_alternate</span>
                    <span>ছবি</span>
                </button>
            </div>
            <button type="submit" form="notepad-form" class="px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs shadow-sm transition">
                সেভ করুন
            </button>
        </div>

        <!-- Hidden file inputs -->
        <input type="file" id="note-gallery-input" accept="image/*" multiple class="hidden" onchange="handleNoteImageSelect(event)">
        <input type="file" id="note-camera-input" accept="image/*" capture="environment" class="hidden" onchange="handleNoteImageSelect(event)">
    </div>
</div>

<!-- ছবি বড় করে দেখার লাইটবক্স মোডাল -->
<div id="note-image-lightbox" class="hidden fixed inset-0 z-[80] bg-black/95 flex flex-col items-center justify-between p-4 backdrop-blur-md">
    <div class="w-full flex items-center justify-between text-white">
        <span class="text-xs font-semibold text-gray-300">সংযুক্ত ছবি</span>
        <div class="flex items-center gap-2">
            <a id="lightbox-download-link" href="#" download="note-photo.jpg" class="p-2 rounded-full bg-white/15 hover:bg-white/25 text-white transition" title="ডাউনলোড করুন">
                <span class="material-symbols-outlined text-xl">download</span>
            </a>
            <button type="button" onclick="closeNoteImageLightbox()" class="p-2 rounded-full bg-white/15 hover:bg-red-500/80 text-white transition" title="বন্ধ করুন">
                <span class="material-symbols-outlined text-xl">close</span>
            </button>
        </div>
    </div>
    <div class="flex-1 w-full flex items-center justify-center overflow-auto py-4">
        <img id="lightbox-preview-img" src="" alt="Note attachment" class="max-w-full max-h-[82vh] rounded-xl object-contain shadow-2xl">
    </div>
    <div class="text-[11px] text-gray-400">বন্ধ করতে ডান উপরের × বাটনে ট্যাপ করুন</div>
</div>
`;

const MAX_IMAGES_PER_NOTE = 5;
let allNotesData = [];
let activeNotepadFilter = 'all';
let activeNotesListenerRef = null;
let activeNotesListenerUid = null;
let pendingDeleteNoteConfirm = false;
let pendingDeleteConfirmTimer = null;

// এডিটর ড্রাফট স্টেট
let editorNoteImages = [];
let editorNoteChecklist = [];

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

function normalizeNoteArrayField(rawField) {
    if (!rawField) return [];
    if (Array.isArray(rawField)) return rawField.filter(Boolean);
    if (typeof rawField === 'object') return Object.values(rawField).filter(Boolean);
    return [];
}

function normalizeNoteRecord(id, item) {
    const images = normalizeNoteArrayField(item.images).filter(img => img && typeof img.dataUrl === 'string' && img.dataUrl.startsWith('data:image/'));
    const checklist = normalizeNoteArrayField(item.checklist).filter(row => row && typeof row.text === 'string');
    return {
        id,
        title: String(item.title || ''),
        content: String(item.content || ''),
        category: String(item.category || 'সাধারণ'),
        color: String(item.color || 'default'),
        pinned: !!item.pinned,
        images,
        checklist,
        createdAt: item.createdAt || '',
        updatedAt: item.updatedAt || item.createdAt || ''
    };
}

function buildNotesArrayFromMap(dataMap) {
    if (!dataMap || typeof dataMap !== 'object') return [];
    return Object.entries(dataMap)
        .filter(([, item]) => item && typeof item === 'object')
        .map(([key, item]) => normalizeNoteRecord(key, item))
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
            persistLocalNotesCache(uid, data);
            allNotesData = buildNotesArrayFromMap(data);
        } else {
            persistLocalNotesCache(uid, null);
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
            ? 'notepad-filter-btn px-3.5 py-1.5 rounded-full bg-amber-500 text-white text-xs font-bold whitespace-nowrap shadow-sm'
            : 'notepad-filter-btn px-3.5 py-1.5 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 text-xs font-bold whitespace-nowrap';
    });
    renderNotesList();
}

function getNoteCardSurfaceClasses(colorKey, isPinned) {
    const map = {
        amber: 'bg-amber-50/90 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/50',
        teal: 'bg-teal-50/80 dark:bg-teal-950/30 border-teal-200 dark:border-teal-800/50',
        blue: 'bg-blue-50/80 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800/50',
        rose: 'bg-rose-50/80 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/50'
    };
    if (map[colorKey]) return map[colorKey];
    return isPinned
        ? 'bg-white dark:bg-gray-800 border-amber-200 dark:border-amber-700/60'
        : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700';
}

function renderSingleNoteCardHtml(note) {
    const catStyles = {
        'সাধারণ': 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
        'হিসাব': 'bg-teal-50 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
        'ঔষধ ও যত্ন': 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
        'জরুরি': 'bg-red-50 text-red-600 dark:bg-red-900/40 dark:text-red-300'
    };

    const cat = note.category || 'সাধারণ';
    const badgeCls = catStyles[cat] || catStyles['সাধারণ'];
    const surfaceCls = getNoteCardSurfaceClasses(note.color, note.pinned);
    const titleSafe = escapeNoteHtml(note.title || 'শিরোনামহীন নোট');
    const contentSafe = escapeNoteHtml(note.content || '').replace(/\n/g, '<br>');
    const dateLabel = formatNoteDateBn(note.updatedAt || note.createdAt);
    const pinCls = note.pinned
        ? 'text-amber-500 bg-amber-100/70 dark:bg-amber-900/40'
        : 'text-gray-400 hover:text-amber-500 hover:bg-gray-100 dark:hover:bg-gray-700';

    const images = Array.isArray(note.images) ? note.images : [];
    const checklist = Array.isArray(note.checklist) ? note.checklist : [];
    const doneCount = checklist.filter(c => c.done).length;

    let thumbStripHtml = '';
    if (images.length > 0) {
        const thumbs = images.slice(0, 3).map(img => `
            <img src="${img.dataUrl}" alt="ছবি" loading="lazy" class="w-16 h-16 rounded-xl object-cover border border-black/10 dark:border-white/10 flex-shrink-0">
        `).join('');
        const extraBadge = images.length > 3
            ? `<div class="w-16 h-16 rounded-xl bg-black/10 dark:bg-white/10 flex items-center justify-center text-xs font-bold text-gray-700 dark:text-gray-200 flex-shrink-0">+${toNotepadBnDigits(images.length - 3)}</div>`
            : '';
        thumbStripHtml = `<div class="flex items-center gap-2 mt-2.5 overflow-hidden">${thumbs}${extraBadge}</div>`;
    }

    let checklistPreviewHtml = '';
    if (checklist.length > 0) {
        const previewRows = checklist.slice(0, 3).map(row => `
            <div class="flex items-center gap-1.5 text-xs ${row.done ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-200'}">
                <span class="material-symbols-outlined text-sm ${row.done ? 'text-teal-600 dark:text-teal-400' : 'text-amber-500'}">${row.done ? 'check_circle' : 'radio_button_unchecked'}</span>
                <span class="truncate">${escapeNoteHtml(row.text)}</span>
            </div>
        `).join('');
        checklistPreviewHtml = `<div class="mt-2 space-y-1">${previewRows}</div>`;
    }

    return `
    <div onclick="editNoteItem('${escapeNoteHtml(note.id)}')" class="${surfaceCls} p-4 rounded-2xl shadow-sm border cursor-pointer hover:shadow-md transition">
        <div class="flex items-start justify-between gap-2 mb-1.5">
            <div class="flex items-center gap-1.5 flex-wrap min-w-0">
                <span class="px-2 py-0.5 rounded-md text-[10px] font-bold ${badgeCls}">${escapeNoteHtml(cat)}</span>
                ${images.length > 0 ? `<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100/80 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">📷 ${toNotepadBnDigits(images.length)}টি ছবি</span>` : ''}
                ${checklist.length > 0 ? `<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100/80 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">☑️ ${toNotepadBnDigits(doneCount)}/${toNotepadBnDigits(checklist.length)}</span>` : ''}
            </div>
            <button type="button" onclick="toggleQuickNotePin(event, '${escapeNoteHtml(note.id)}')" class="p-1.5 rounded-full transition flex-shrink-0 ${pinCls}" title="পিন টগল">
                <span class="material-symbols-outlined text-base">push_pin</span>
            </button>
        </div>
        <h3 class="font-bold text-sm text-gray-900 dark:text-white truncate mb-1">${titleSafe}</h3>
        ${contentSafe ? `<p class="text-xs text-gray-600 dark:text-gray-300 leading-relaxed line-clamp-3 break-words">${contentSafe}</p>` : ''}
        ${checklistPreviewHtml}
        ${thumbStripHtml}
        <div class="mt-2.5 pt-2 border-t border-black/5 dark:border-white/5 flex items-center justify-between text-[10px] text-gray-400">
            <span>${dateLabel ? `আপডেট: ${escapeNoteHtml(dateLabel)}` : ''}</span>
            <span class="text-amber-600 dark:text-amber-400 font-semibold">খুলুন / এডিট</span>
        </div>
    </div>`;
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
        if (activeNotepadFilter === 'photos' && (!note.images || note.images.length === 0)) return false;
        if (activeNotepadFilter !== 'all' && activeNotepadFilter !== 'pinned' && activeNotepadFilter !== 'photos') {
            if ((note.category || 'সাধারণ') !== activeNotepadFilter) return false;
        }
        if (query) {
            const titleText = String(note.title || '').toLowerCase();
            const contentText = String(note.content || '').toLowerCase();
            const checklistText = (note.checklist || []).map(c => c.text).join(' ').toLowerCase();
            if (!titleText.includes(query) && !contentText.includes(query) && !checklistText.includes(query)) return false;
        }
        return true;
    });

    if (filtered.length === 0) {
        const emptyTitle = allNotesData.length === 0 ? 'এখনো কোনো নোট লেখা হয়নি' : 'এই ফিল্টারে কোনো নোট পাওয়া যায়নি';
        const emptySub = allNotesData.length === 0
            ? 'নিচের হলুদ বাটনে ট্যাপ করে লেখা, ছবি ও চেকলিস্টসহ নোট রাখুন।'
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

    const pinnedNotes = filtered.filter(n => n.pinned);
    const otherNotes = filtered.filter(n => !n.pinned);

    let html = '';
    if (pinnedNotes.length > 0 && otherNotes.length > 0) {
        html += `<div class="space-y-2.5">
            <h2 class="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider px-1">⭐ পিন করা নোট</h2>
            ${pinnedNotes.map(renderSingleNoteCardHtml).join('')}
        </div>
        <div class="space-y-2.5 pt-1">
            <h2 class="text-xs font-bold text-gray-400 uppercase tracking-wider px-1">নোটসমূহ</h2>
            ${otherNotes.map(renderSingleNoteCardHtml).join('')}
        </div>`;
    } else {
        html = `<div class="space-y-2.5">${filtered.map(renderSingleNoteCardHtml).join('')}</div>`;
    }

    listContainer.innerHTML = html;
}

function setNoteModalColor(colorKey) {
    const safeColor = colorKey || 'default';
    const hidden = document.getElementById('note-color-value');
    if (hidden) hidden.value = safeColor;

    document.querySelectorAll('.note-color-dot').forEach(dot => {
        const active = dot.getAttribute('data-color') === safeColor;
        dot.classList.toggle('ring-2', active);
        dot.classList.toggle('ring-amber-500', active);
        dot.classList.toggle('ring-offset-1', active);
    });

    const card = document.getElementById('notepad-modal-card');
    if (!card) return;
    card.classList.remove(
        'bg-white', 'dark:bg-gray-900',
        'bg-amber-50', 'dark:bg-amber-950',
        'bg-teal-50', 'dark:bg-teal-950',
        'bg-blue-50', 'dark:bg-blue-950',
        'bg-rose-50', 'dark:bg-rose-950'
    );
    const bgMap = {
        default: ['bg-white', 'dark:bg-gray-900'],
        amber: ['bg-amber-50', 'dark:bg-amber-950'],
        teal: ['bg-teal-50', 'dark:bg-teal-950'],
        blue: ['bg-blue-50', 'dark:bg-blue-950'],
        rose: ['bg-rose-50', 'dark:bg-rose-950']
    };
    const cls = bgMap[safeColor] || bgMap.default;
    card.classList.add(...cls);
}

function updateModalPinAppearance(isPinned) {
    const input = document.getElementById('note-pinned-value');
    const btn = document.getElementById('note-pin-toggle-btn');
    if (input) input.value = isPinned ? 'true' : 'false';
    if (btn) {
        btn.className = isPinned
            ? 'p-2 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 transition'
            : 'p-2 rounded-full text-gray-500 dark:text-gray-300 hover:bg-amber-50 hover:text-amber-600 transition';
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

// চেকলিস্ট ম্যানেজমেন্ট (iPhone Notes style)
function renderEditorChecklist() {
    const section = document.getElementById('note-checklist-section');
    const container = document.getElementById('note-checklist-rows');
    if (!section || !container) return;

    if (!editorNoteChecklist || editorNoteChecklist.length === 0) {
        section.classList.add('hidden');
        container.innerHTML = '';
        return;
    }

    section.classList.remove('hidden');
    container.innerHTML = editorNoteChecklist.map((item, idx) => `
        <div class="flex items-center gap-2 bg-black/[0.03] dark:bg-white/[0.04] px-3 py-2 rounded-xl">
            <button type="button" onclick="toggleEditorChecklistItem(${idx})" class="flex-shrink-0 text-amber-600 dark:text-amber-400">
                <span class="material-symbols-outlined text-xl ${item.done ? 'text-teal-600 dark:text-teal-400' : ''}">${item.done ? 'check_circle' : 'radio_button_unchecked'}</span>
            </button>
            <input type="text" data-cl-idx="${idx}" value="${escapeNoteHtml(item.text)}" oninput="updateEditorChecklistText(${idx}, this.value)" onkeydown="handleChecklistKeydown(event, ${idx})" placeholder="কাজের বা জিনিসের নাম লিখুন..." class="flex-1 bg-transparent text-sm focus:outline-none ${item.done ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-gray-100'}">
            <button type="button" onclick="removeEditorChecklistItem(${idx})" class="text-gray-400 hover:text-red-500 p-1 rounded-full transition">
                <span class="material-symbols-outlined text-base">close</span>
            </button>
        </div>
    `).join('');
}

function addChecklistRow(text = '', focusNew = false) {
    editorNoteChecklist.push({
        id: `cl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        text: String(text || ''),
        done: false
    });
    renderEditorChecklist();
    if (focusNew) {
        setTimeout(() => {
            const idx = editorNoteChecklist.length - 1;
            const el = document.querySelector(`#note-checklist-rows input[data-cl-idx="${idx}"]`);
            if (el) el.focus();
        }, 40);
    }
}

function handleChecklistKeydown(event, idx) {
    if (event.key === 'Enter') {
        event.preventDefault();
        addChecklistRow('', true);
    }
}

function toggleEditorChecklistItem(idx) {
    if (!editorNoteChecklist[idx]) return;
    editorNoteChecklist[idx].done = !editorNoteChecklist[idx].done;
    renderEditorChecklist();
}

function updateEditorChecklistText(idx, val) {
    if (!editorNoteChecklist[idx]) return;
    editorNoteChecklist[idx].text = val;
}

function removeEditorChecklistItem(idx) {
    editorNoteChecklist.splice(idx, 1);
    renderEditorChecklist();
}

// ছবি ম্যানেজমেন্ট ও অটো-কম্প্রেশন
function triggerNotePhotoInput(mode) {
    if (editorNoteImages.length >= MAX_IMAGES_PER_NOTE) {
        if (typeof showToast === 'function') showToast(`⚠️ একটি নোটে সর্বোচ্চ ${toNotepadBnDigits(MAX_IMAGES_PER_NOTE)}টি ছবি রাখা যাবে`);
        return;
    }
    const el = document.getElementById(mode === 'camera' ? 'note-camera-input' : 'note-gallery-input');
    if (el) el.click();
}

function compressNoteImageFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('ফাইল পড়া যায়নি'));
        reader.onload = ev => {
            const img = new Image();
            img.onerror = () => reject(new Error('সঠিক ছবি নয়'));
            img.onload = () => {
                const maxSide = 900;
                let w = img.width || 800;
                let h = img.height || 600;
                if (w > maxSide || h > maxSide) {
                    if (w >= h) {
                        h = Math.round((h * maxSide) / w);
                        w = maxSide;
                    } else {
                        w = Math.round((w * maxSide) / h);
                        h = maxSide;
                    }
                }
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
                resolve({
                    id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                    dataUrl
                });
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    });
}

async function handleNoteImageSelect(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length === 0) return;

    const processingEl = document.getElementById('note-images-processing');
    if (processingEl) processingEl.classList.remove('hidden');

    const remainingSlots = MAX_IMAGES_PER_NOTE - editorNoteImages.length;
    const filesToProcess = files.slice(0, remainingSlots);
    if (files.length > remainingSlots && typeof showToast === 'function') {
        showToast(`⚠️ প্রতি নোটে সর্বোচ্চ ${toNotepadBnDigits(MAX_IMAGES_PER_NOTE)}টি ছবি রাখা যায়`);
    }

    for (const file of filesToProcess) {
        if (!file.type || !file.type.startsWith('image/')) continue;
        try {
            const compressed = await compressNoteImageFile(file);
            editorNoteImages.push(compressed);
        } catch (err) {
            console.warn('Image compress warning:', err);
        }
    }

    if (processingEl) processingEl.classList.add('hidden');
    renderEditorImages();
}

function renderEditorImages() {
    const section = document.getElementById('note-images-section');
    const grid = document.getElementById('note-images-grid');
    const countEl = document.getElementById('note-images-count');
    if (!section || !grid) return;

    if (countEl) countEl.innerText = toNotepadBnDigits(editorNoteImages.length);

    if (!editorNoteImages || editorNoteImages.length === 0) {
        section.classList.add('hidden');
        grid.innerHTML = '';
        return;
    }

    section.classList.remove('hidden');
    grid.innerHTML = editorNoteImages.map((img, idx) => `
        <div class="relative aspect-square rounded-2xl overflow-hidden border border-black/10 dark:border-white/10 bg-gray-100 dark:bg-gray-800 group">
            <img src="${img.dataUrl}" alt="Note photo" onclick="openNoteImageLightbox(${idx})" class="w-full h-full object-cover cursor-pointer">
            <button type="button" onclick="removeEditorImage(${idx})" class="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-red-600 transition" title="ছবি সরান">
                <span class="material-symbols-outlined text-sm">close</span>
            </button>
        </div>
    `).join('');
}

function removeEditorImage(idx) {
    editorNoteImages.splice(idx, 1);
    renderEditorImages();
}

function openNoteImageLightbox(idx) {
    const img = editorNoteImages[idx];
    if (!img || !img.dataUrl) return;
    const modal = document.getElementById('note-image-lightbox');
    const preview = document.getElementById('lightbox-preview-img');
    const dl = document.getElementById('lightbox-download-link');
    if (preview) preview.src = img.dataUrl;
    if (dl) dl.href = img.dataUrl;
    if (modal) modal.classList.remove('hidden');
}

function closeNoteImageLightbox() {
    const modal = document.getElementById('note-image-lightbox');
    if (modal) modal.classList.add('hidden');
}

function openNotepadModal() {
    ensureNotepadDOMInjected();
    const form = document.getElementById('notepad-form');
    if (form) form.reset();

    document.getElementById('note-edit-id').value = '';
    document.getElementById('note-category-select').value = 'সাধারণ';
    setNoteModalColor('default');
    updateModalPinAppearance(false);

    editorNoteImages = [];
    editorNoteChecklist = [];
    renderEditorImages();
    renderEditorChecklist();

    const tsEl = document.getElementById('note-editor-timestamp');
    if (tsEl) tsEl.innerText = formatNoteDateBn(new Date().toISOString()) || 'নতুন নোট';

    const delBtn = document.getElementById('btn-delete-note');
    if (delBtn) {
        resetDeleteNoteButton();
        delBtn.classList.add('hidden');
    }

    document.getElementById('notepad-modal').classList.remove('hidden');
    setTimeout(() => {
        const titleEl = document.getElementById('note-title-input');
        if (titleEl) titleEl.focus();
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
    setNoteModalColor(note.color || 'default');
    updateModalPinAppearance(!!note.pinned);

    editorNoteImages = (note.images || []).map(img => ({ ...img }));
    editorNoteChecklist = (note.checklist || []).map(row => ({ ...row }));
    renderEditorImages();
    renderEditorChecklist();

    const tsEl = document.getElementById('note-editor-timestamp');
    if (tsEl) {
        const dateStr = formatNoteDateBn(note.updatedAt || note.createdAt);
        tsEl.innerText = dateStr ? `সর্বশেষ আপডেট: ${dateStr}` : 'সম্পাদনা';
    }

    const delBtn = document.getElementById('btn-delete-note');
    if (delBtn) {
        resetDeleteNoteButton();
        delBtn.classList.remove('hidden');
    }

    document.getElementById('notepad-modal').classList.remove('hidden');
}

function persistLocalNotesCache(uid, notesMap) {
    const key = 'offline_notes_' + uid;
    try {
        if (!notesMap || Object.keys(notesMap).length === 0) {
            localStorage.removeItem(key);
            return;
        }
        localStorage.setItem(key, JSON.stringify(notesMap));
    } catch (_) {
        // যদি ছবির কারণে localStorage ৫MB ভরে যায়, তবু টেক্সট ও চেকলিস্ট অফলাইন ক্যাশে রাখা
        try {
            const slimMap = {};
            for (const [k, v] of Object.entries(notesMap)) {
                if (!v || typeof v !== 'object') continue;
                const { images, ...rest } = v;
                slimMap[k] = rest;
            }
            localStorage.setItem(key, JSON.stringify(slimMap));
        } catch (__) {}
    }
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
    const color = document.getElementById('note-color-value').value || 'default';
    const pinned = document.getElementById('note-pinned-value').value === 'true';

    const cleanChecklist = editorNoteChecklist
        .map(row => ({ id: row.id || `cl_${Date.now()}`, text: String(row.text || '').trim(), done: !!row.done }))
        .filter(row => row.text.length > 0);
    const cleanImages = editorNoteImages
        .filter(img => img && typeof img.dataUrl === 'string' && img.dataUrl.startsWith('data:image/'))
        .slice(0, MAX_IMAGES_PER_NOTE);

    if (!rawTitle && !content && cleanChecklist.length === 0 && cleanImages.length === 0) {
        if (typeof showToast === 'function') showToast('⚠️ অনুগ্রহ করে লেখা, চেকলিস্ট বা ছবি যোগ করুন!');
        return;
    }

    const derivedTitle = rawTitle
        || (content ? content.split(/\r?\n/)[0].slice(0, 45) : '')
        || (cleanChecklist[0] ? cleanChecklist[0].text.slice(0, 45) : '')
        || (cleanImages.length > 0 ? `ছবির নোট (${toNotepadBnDigits(cleanImages.length)}টি)` : 'শিরোনামহীন নোট');

    const nowIso = new Date().toISOString();

    if (id) {
        const existing = allNotesData.find(n => n.id === id);
        const updateData = {
            title: derivedTitle,
            content,
            category,
            color,
            pinned,
            checklist: cleanChecklist,
            images: cleanImages,
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
            color,
            pinned,
            checklist: cleanChecklist,
            images: cleanImages,
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

function shareOrCopyCurrentNote() {
    const title = document.getElementById('note-title-input').value.trim();
    const content = document.getElementById('note-content-input').value.trim();
    const checklistLines = editorNoteChecklist
        .filter(c => c.text && c.text.trim())
        .map(c => `${c.done ? '☑️' : '⬜'} ${c.text.trim()}`);

    const parts = [];
    if (title) parts.push(title);
    if (content) parts.push(content);
    if (checklistLines.length > 0) parts.push(checklistLines.join('\n'));
    const fullText = parts.join('\n\n').trim();
    if (!fullText) {
        if (typeof showToast === 'function') showToast('⚠️ শেয়ার করার মতো লেখা নেই');
        return;
    }

    if (navigator.share) {
        navigator.share({ title: title || 'আমার খামার নোট', text: fullText }).catch(() => {});
        return;
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(fullText).then(() => {
            if (typeof showToast === 'function') showToast('নোট কপি করা হয়েছে 📋');
        }).catch(() => {});
    }
}
