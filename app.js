// --- State ---
const STATE = {
  user: null,
  tab: 'today',
  entries: [],
  dateFilter: new Date().toISOString().slice(0, 10),
};

let profilePhoto = localStorage.getItem('diary_photo') || null;
let SETTINGS_TAB = false;
let nyamFavorites = JSON.parse(localStorage.getItem('nyam_favorites') || '[]');
let NYAM_FAV_TAB = false;
let supabase = null;
if (window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
  supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
}

// --- Local Storage ---
function saveState() {
  localStorage.setItem('diary_user', JSON.stringify(STATE.user));
  localStorage.setItem('diary_entries', JSON.stringify(STATE.entries));
}
function loadState() {
  STATE.user = JSON.parse(localStorage.getItem('diary_user')) || null;
  STATE.entries = JSON.parse(localStorage.getItem('diary_entries')) || [];
}

// --- UI Rendering ---
function render() {
  const app = document.getElementById('app');
  app.innerHTML = '';
  if (!supabase) {
    app.innerHTML = '<div class="text-center text-red-500">Supabase не подключён</div>';
    return;
  }
  getCurrentUser().then(async user => {
    if (!user) {
      renderAuthSupabase(app);
    } else {
      await syncUserData();
      if (SETTINGS_TAB) {
        renderSettings(app);
      } else if (NYAM_FAV_TAB) {
        renderNyamFavoritesPage(app);
      } else {
        renderTabs(app);
        if (STATE.tab === 'today') renderToday(app);
        if (STATE.tab === 'all') renderAll(app);
        if (STATE.tab === 'profile') renderProfile(app);
        if (STATE.tab === 'nyam') renderNyam(app);
      }
    }
  });
}

async function getCurrentUser() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user;
}

async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
  localStorage.clear();
  location.reload();
}

function renderAuthSupabase(root) {
  let mode = 'login';
  const wrap = document.createElement('div');
  wrap.className = 'flex flex-col items-center justify-center min-h-screen p-4';
  function renderForm() {
    wrap.innerHTML = `
      <div class="bg-white rounded-2xl shadow-lg p-8 w-full max-w-xs">
        <h1 class="text-2xl font-semibold mb-6 text-center text-blue-600">Дневник диабетика</h1>
        <div class="flex gap-2 mb-4">
          <button id="tab-login" class="flex-1 py-2 rounded-xl font-semibold ${mode === 'login' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}">Вход</button>
          <button id="tab-register" class="flex-1 py-2 rounded-xl font-semibold ${mode === 'register' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}">Регистрация</button>
        </div>
        <form id="auth-form" class="flex flex-col gap-4">
          <input type="email" name="email" placeholder="Email" required class="rounded-xl border px-4 py-2" />
          <input type="password" name="password" placeholder="Пароль" required class="rounded-xl border px-4 py-2" />
          ${mode === 'register' ? '<input type="password" name="password2" placeholder="Повторите пароль" required class="rounded-xl border px-4 py-2" />' : ''}
          <button type="submit" class="bg-blue-500 text-white rounded-xl py-2 font-semibold hover:bg-blue-600 transition">${mode === 'login' ? 'Войти' : 'Зарегистрироваться'}</button>
        </form>
        <div id="auth-error" class="text-red-500 text-sm mt-2 text-center"></div>
        <div id="auth-loader" class="text-blue-400 text-center mt-2 hidden">Загрузка...</div>
      </div>
    `;
    root.innerHTML = '';
    root.appendChild(wrap);
    document.getElementById('tab-login').onclick = () => { mode = 'login'; renderForm(); };
    document.getElementById('tab-register').onclick = () => { mode = 'register'; renderForm(); };
    document.getElementById('auth-form').onsubmit = async (e) => {
      e.preventDefault();
      const email = e.target.email.value.trim();
      const password = e.target.password.value;
      const errorDiv = document.getElementById('auth-error');
      const loaderDiv = document.getElementById('auth-loader');
      errorDiv.textContent = '';
      loaderDiv.classList.remove('hidden');
      if (mode === 'login') {
        let { error } = await supabase.auth.signInWithPassword({ email, password });
        loaderDiv.classList.add('hidden');
        if (error) {
          errorDiv.textContent = error.message;
        } else {
          render();
        }
      } else {
        const password2 = e.target.password2.value;
        if (password !== password2) {
          errorDiv.textContent = 'Пароли не совпадают';
          loaderDiv.classList.add('hidden');
          return;
        }
        let { error } = await supabase.auth.signUp({ email, password });
        loaderDiv.classList.add('hidden');
        if (error) {
          errorDiv.textContent = error.message;
        } else {
          errorDiv.textContent = 'Проверьте почту для подтверждения регистрации.';
        }
      }
    };
  }
  renderForm();
}

function renderTabs(root) {
  const tabs = [
    { id: 'today', label: 'Сегодня', icon: '📅' },
    { id: 'nyam', label: 'Ням', icon: '🍏' },
    { id: 'all', label: 'Все записи', icon: '📖' },
    { id: 'profile', label: 'Профиль', icon: '' },
  ];
  const nav = document.createElement('nav');
  nav.className = 'flex justify-around bg-white rounded-b-2xl shadow-md fixed bottom-0 left-0 right-0 z-10 md:static md:rounded-none md:shadow-none';
  nav.innerHTML = tabs.map(tab => `
    <button class="flex-1 py-3 text-center text-lg font-medium transition ${STATE.tab === tab.id ? 'bg-blue-100 text-blue-600' : 'text-gray-500'}" data-tab="${tab.id}">
      <span class="block text-2xl">${tab.id === 'profile' ? `<span class='inline-block w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 text-white flex items-center justify-center font-bold text-base mx-auto'>${STATE.user ? (STATE.user.name ? STATE.user.name[0].toUpperCase() : (STATE.user.email ? STATE.user.email[0].toUpperCase() : '?')) : '?'}</span>` : tab.icon}</span>
      <span class="block text-xs">${tab.label}</span>
    </button>
  `).join('');
  nav.querySelectorAll('button').forEach(btn => {
    btn.onclick = () => {
      const tab = btn.dataset.tab;
      SETTINGS_TAB = false;
      STATE.tab = tab;
      render();
    };
  });
  root.appendChild(nav);
}

function renderToday(root) {
  const section = document.createElement('section');
  section.className = 'p-4 pt-8 pb-24 max-w-md mx-auto w-full';
  section.innerHTML = `
    <h2 class="text-xl font-semibold mb-4">Добавить запись</h2>
    <form id="entry-form" class="bg-white rounded-2xl shadow p-4 flex flex-col gap-4 mb-6">
      <div class="relative">
        <input type="time" name="time" class="rounded-xl border px-4 py-2 w-full pr-10" value="${new Date().toTimeString().slice(0,5)}" required />
        <span class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
        </span>
      </div>
      <input type="number" name="sugar" step="0.1" min="0" placeholder="Сахар (ммоль/л)" class="rounded-xl border px-4 py-2" />
      <select name="insulinType" class="rounded-xl border px-4 py-2" required>
        <option value="apidra">Апидра (быстрый)</option>
        <option value="long">Продленный</option>
      </select>
      <input type="number" name="insulin" step="0.1" min="0" placeholder="Инсулин (ед.)" class="rounded-xl border px-4 py-2" required />
      <input type="text" name="food" placeholder="Что съели?" class="rounded-xl border px-4 py-2" />
      <button type="submit" class="bg-blue-500 text-white rounded-xl py-2 font-semibold hover:bg-blue-600 transition">Сохранить</button>
    </form>
    <h3 class="text-lg font-semibold mb-2">Сегодняшние записи</h3>
    <div id="today-entries" class="flex flex-col gap-2"></div>
  `;
  root.appendChild(section);
  // Автооткрытие меню времени при клике на input
  const timeInput = section.querySelector('input[type="time"]');
  timeInput.addEventListener('focus', () => { if (timeInput.showPicker) timeInput.showPicker(); });
  timeInput.addEventListener('click', () => { if (timeInput.showPicker) timeInput.showPicker(); });
  // Логика скрытия поля еды для продленного инсулина
  const insulinTypeSelect = section.querySelector('select[name="insulinType"]');
  const foodInput = section.querySelector('input[name="food"]');
  const sugarInput = section.querySelector('input[name="sugar"]');
  function updateFormFields() {
    if (insulinTypeSelect.value === 'long') {
      foodInput.style.display = 'none';
      foodInput.value = '';
      sugarInput.placeholder = 'Сахар (ммоль/л, опционально)';
      sugarInput.required = false;
    } else {
      foodInput.style.display = '';
      sugarInput.placeholder = 'Сахар (ммоль/л)';
      sugarInput.required = true;
    }
  }
  insulinTypeSelect.onchange = updateFormFields;
  updateFormFields();
  document.getElementById('entry-form').onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const date = new Date().toISOString().slice(0, 10);
    const type = form.insulinType.value;
    const entry = {
      date,
      time: form.time.value,
      sugar: form.sugar.value ? parseFloat(form.sugar.value) : null,
      insulin: parseFloat(form.insulin.value),
      food: type === 'apidra' ? form.food.value.trim() : '',
      type,
    };
    await addEntryToSupabase(entry);
    STATE.entries = await loadEntriesFromSupabase();
    saveState();
    render();
  };
  renderEntries(
    document.getElementById('today-entries'),
    STATE.entries.filter(e => e.date === new Date().toISOString().slice(0, 10)),
    { editable: true, date: new Date().toISOString().slice(0, 10) }
  );
}

function renderEntries(container, entries, { editable = false, date = null } = {}) {
  if (!entries.length) {
    container.innerHTML = '<div class="text-gray-400 text-center">Нет записей</div>';
    return;
  }
  container.innerHTML = entries.map((e, idx) => {
    // Цвет сахара
    const sugarColor = (e.sugar !== null && e.sugar >= 4.5 && e.sugar <= 8) ? 'text-green-600' : 'text-red-500';
    const insulinTypeLabel = e.type === 'long' ? '<span class="ml-2 px-2 py-0.5 rounded bg-blue-100 text-blue-600 text-xs">Продленный</span>' : '<span class="ml-2 px-2 py-0.5 rounded bg-yellow-100 text-yellow-700 text-xs">Апидра</span>';
    return `
      <div class="bg-white rounded-2xl p-4 flex flex-col gap-3 shadow transition hover:shadow-lg border border-blue-100 relative">
        <div class="flex items-center gap-2 text-blue-500 text-sm">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"/><path stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M12 6v6l4 2"/></svg>
          <span>${e.time}</span>
        </div>
        ${e.sugar !== null ? `<div class="flex items-center gap-2 ${sugarColor} text-base font-semibold">
          <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2C7.243 2 5 4.243 5 7c0 4.418 5 11 5 11s5-6.582 5-11c0-2.757-2.243-5-5-5zm0 7a2 2 0 110-4 2 2 0 010 4z"/></svg>
          <span>${e.sugar} ммоль/л</span>
        </div>` : ''}
        <div class="flex items-center gap-2 text-cyan-600 text-base">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"/><path d="M12 16v-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          <svg class="w-5 h-5 text-pink-400" fill="currentColor" viewBox="0 0 20 20"><path d="M16.707 9.293a1 1 0 00-1.414 0L10 14.586l-5.293-5.293a1 1 0 00-1.414 1.414l6 6a1 1 0 001.414 0l6-6a1 1 0 000-1.414z"/></svg>
          <span>Инсулин: <span class="font-bold">${e.insulin}</span> ед. ${insulinTypeLabel}</span>
        </div>
        ${e.type === 'apidra' && e.food ? `<div class="flex items-center gap-2 text-gray-500 text-sm break-words max-h-24 overflow-auto">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg>
          <span class="whitespace-pre-line break-words">${e.food.length > 200 ? e.food.slice(0, 200) + '…' : e.food}</span>
        </div>` : ''}
        ${editable ? `
        <div class="absolute top-2 right-2 flex gap-2">
          <button class="edit-btn p-1 rounded hover:bg-blue-50" title="Редактировать" data-idx="${idx}">
            <svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M15.232 5.232l3.536 3.536M9 13l6-6 3 3-6 6H9v-3z"/></svg>
          </button>
          <button class="delete-btn p-1 rounded hover:bg-red-50" title="Удалить" data-idx="${idx}">
            <svg class="w-5 h-5 text-red-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 19a2 2 0 002 2h8a2 2 0 002-2V7H6v12zM19 7V5a2 2 0 00-2-2H7a2 2 0 00-2 2v2"/></svg>
          </button>
        </div>
        <div class="delete-menu hidden absolute top-10 right-2 bg-white border border-red-200 rounded-xl shadow-lg p-4 z-50 flex flex-col gap-2 items-center">
          <div class="text-red-600 font-semibold mb-2">Удалить запись?</div>
          <button class="confirm-delete bg-red-500 text-white rounded-xl px-4 py-1 font-semibold hover:bg-red-600 transition" data-idx="${idx}">Удалить</button>
          <button class="cancel-delete text-gray-500 hover:text-gray-700">Отмена</button>
        </div>
        ` : ''}
      </div>
    `;
  }).join('');
  if (editable) {
    container.querySelectorAll('.delete-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        // Скрыть все другие меню
        container.querySelectorAll('.delete-menu').forEach(m => m.classList.add('hidden'));
        btn.closest('.relative').querySelector('.delete-menu').classList.remove('hidden');
      };
    });
    container.querySelectorAll('.cancel-delete').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        btn.closest('.delete-menu').classList.add('hidden');
      };
    });
    container.querySelectorAll('.confirm-delete').forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const idx = +btn.dataset.idx;
        const entry = entries[idx];
        if (entry.id) {
          await deleteEntryFromSupabase(entry.id);
          STATE.entries = await loadEntriesFromSupabase();
          saveState();
          render();
        }
      };
    });
    container.querySelectorAll('.edit-btn').forEach(btn => {
      btn.onclick = () => openEditModal(entries, +btn.dataset.idx);
    });
  }
}

function openEditModal(arr, idx) {
  const entry = arr[idx];
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30';
  modal.innerHTML = `
    <div class="bg-white rounded-2xl shadow-xl p-6 w-full max-w-xs flex flex-col gap-4 relative">
      <button class="absolute top-2 right-2 text-gray-400 hover:text-gray-700 text-xl close-modal">×</button>
      <h3 class="text-lg font-semibold mb-2">Редактировать запись</h3>
      <form class="flex flex-col gap-3" id="edit-form">
        <input type="time" name="time" class="rounded-xl border px-4 py-2" value="${entry.time}" required />
        <input type="number" name="sugar" step="0.1" min="0" placeholder="Сахар (ммоль/л)" class="rounded-xl border px-4 py-2" value="${entry.sugar}" required />
        <input type="number" name="insulin" step="0.1" min="0" placeholder="Инсулин (ед.)" class="rounded-xl border px-4 py-2" value="${entry.insulin}" required />
        <textarea name="food" placeholder="Что съели?" class="rounded-xl border px-4 py-2" required>${entry.food}</textarea>
        <button type="submit" class="bg-blue-500 text-white rounded-xl py-2 font-semibold hover:bg-blue-600 transition">Сохранить</button>
      </form>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector('.close-modal').onclick = () => modal.remove();
  modal.querySelector('#edit-form').onsubmit = async (e) => {
    e.preventDefault();
    const updated = {
      time: e.target.time.value,
      sugar: parseFloat(e.target.sugar.value),
      insulin: parseFloat(e.target.insulin.value),
      food: e.target.food.value,
    };
    if (entry.id) {
      await updateEntryInSupabase(updated, entry.id);
      STATE.entries = await loadEntriesFromSupabase();
      saveState();
      modal.remove();
      render();
    }
  };
}

function renderAll(root) {
  const section = document.createElement('section');
  section.className = 'p-4 pt-8 pb-24 max-w-md mx-auto w-full';
  section.innerHTML = `
    <h2 class="text-xl font-semibold mb-4">Все записи</h2>
    <div class="flex gap-2 mb-4 items-center">
      <div class="relative flex-1">
        <input type="date" id="date-filter" class="rounded-xl border px-4 py-2 w-full pr-10" value="${STATE.dateFilter}" />
        <span class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
        </span>
      </div>
      <button id="export-btn" class="bg-green-100 text-green-700 rounded-xl px-3 py-2 font-semibold hover:bg-green-200 transition" title="Экспорт записей за день">Экспорт</button>
      <label class="bg-blue-100 text-blue-700 rounded-xl px-3 py-2 font-semibold hover:bg-blue-200 transition cursor-pointer" title="Импорт записей за день">
        Импорт
        <input type="file" id="import-input" accept="application/json" class="hidden" />
      </label>
    </div>
    <div id="all-entries" class="flex flex-col gap-2"></div>
  `;
  root.appendChild(section);
  // Автооткрытие меню даты при клике на input
  const dateInput = section.querySelector('input[type="date"]');
  dateInput.addEventListener('focus', () => { if (dateInput.showPicker) dateInput.showPicker(); });
  dateInput.addEventListener('click', () => { if (dateInput.showPicker) dateInput.showPicker(); });
  document.getElementById('date-filter').onchange = (e) => {
    STATE.dateFilter = e.target.value;
    render();
  };
  // Экспорт
  document.getElementById('export-btn').onclick = () => {
    const data = STATE.entries.filter(e => e.date === STATE.dateFilter);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diary-${STATE.dateFilter}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  // Импорт
  document.getElementById('import-input').onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target.result);
        if (Array.isArray(imported)) {
          // Удаляем старые записи за этот день
          STATE.entries = STATE.entries.filter(e => e.date !== STATE.dateFilter);
          // Добавляем новые
          imported.forEach(entry => {
            entry.date = STATE.dateFilter;
            STATE.entries.push(entry);
          });
          saveState();
          render();
        } else {
          alert('Файл не содержит корректный список записей!');
        }
      } catch {
        alert('Ошибка чтения файла!');
      }
    };
    reader.readAsText(file);
  };
  renderEntries(document.getElementById('all-entries'), STATE.entries.filter(e => e.date === STATE.dateFilter), { editable: true, date: STATE.dateFilter });
}

function renderProfile(root) {
  const section = document.createElement('section');
  section.className = 'p-4 pt-8 pb-24 max-w-md mx-auto w-full relative';
  // Статистика
  const total = STATE.entries.length;
  const avg = total ? (STATE.entries.reduce((sum, e) => sum + (e.sugar || 0), 0) / total).toFixed(1) : '-';
  // Получаем имя или email
  const userName = (STATE.user && STATE.user.name) ? STATE.user.name : (STATE.user && STATE.user.email ? STATE.user.email : 'Пользователь');
  const userInitial = (STATE.user && STATE.user.name) ? STATE.user.name[0].toUpperCase() : (STATE.user && STATE.user.email ? STATE.user.email[0].toUpperCase() : '?');
  section.innerHTML = `
    <button id="settings-btn" class="absolute top-4 right-4 text-blue-500 hover:text-blue-700 text-2xl" title="Настройки">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="w-7 h-7"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 0V4m0 16v-4m8-4h-4m-8 0H4"/></svg>
    </button>
    <h2 class="text-xl font-semibold mb-4">Профиль</h2>
    <div class="bg-white rounded-2xl shadow p-4 flex flex-col gap-2 mb-4 items-center">
      <div class="w-16 h-16 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 text-white flex items-center justify-center font-bold text-3xl mb-2 overflow-hidden relative">
        ${profilePhoto ? `<img src="${profilePhoto}" alt="Фото" class="w-full h-full object-cover" />` : userInitial}
      </div>
      <div class="text-lg font-semibold">${userName}</div>
      <div class="flex gap-4 mt-2 text-sm text-gray-500">
        <div><span class="font-bold text-blue-600">${total}</span> записей</div>
        <div>Средний сахар: <span class="font-bold text-blue-600">${avg}</span></div>
      </div>
      <button id="logout-btn" class="bg-gray-100 text-gray-600 rounded-xl py-2 px-4 font-semibold hover:bg-gray-200 transition mt-4">Выйти</button>
    </div>
    <div class="text-xs text-gray-400 text-center">Данные хранятся только на этом устройстве.<br>Экспортируйте записи для переноса на другое устройство.</div>
  `;
  root.appendChild(section);
  document.getElementById('logout-btn').onclick = () => {
    STATE.user = null;
    saveState();
    render();
  };
  document.getElementById('settings-btn').onclick = () => { SETTINGS_TAB = true; render(); };
}

function renderNyam(root) {
  const section = document.createElement('section');
  section.className = 'p-4 pt-8 pb-24 max-w-md mx-auto w-full';
  section.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-xl font-semibold">Ням — Поиск продуктов</h2>
      <button id="nyam-fav-btn" class="text-yellow-400 hover:text-yellow-500 text-2xl" title="Сохранённые продукты">⭐</button>
    </div>
    <form id="nyam-form" class="flex flex-col gap-4 mb-6">
      <input type="text" name="query" placeholder="Введите продукт (например, яблоко)" class="rounded-xl border px-4 py-2" required />
      <input type="text" name="info" placeholder="Инфо (например, фрукт, хлеб, сок...)" class="rounded-xl border px-4 py-2" />
      <input type="number" name="grams" min="1" placeholder="Количество грамм" class="rounded-xl border px-4 py-2" required />
      <button type="submit" class="bg-blue-500 text-white rounded-xl py-2 font-semibold hover:bg-blue-600 transition">Поиск</button>
    </form>
    <div id="nyam-result"></div>
  `;
  root.appendChild(section);
  document.getElementById('nyam-fav-btn').onclick = () => { NYAM_FAV_TAB = true; render(); };
  document.getElementById('nyam-form').onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const query = form.query.value.trim();
    const info = form.info.value.trim();
    const grams = parseFloat(form.grams.value);
    const searchText = info ? `${query} ${info}` : query;
    const resultDiv = document.getElementById('nyam-result');
    resultDiv.innerHTML = '<div class="text-gray-400 text-center">Идет поиск...</div>';
    try {
      const resp = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(searchText)}&search_simple=1&action=process&json=1&page_size=1`);
      const data = await resp.json();
      if (!data.products || !data.products.length) {
        resultDiv.innerHTML = '<div class="text-red-400 text-center">Ничего не найдено :(</div>';
        return;
      }
      const prod = data.products[0];
      const carbs = prod.nutriments && prod.nutriments.carbohydrates_100g ? prod.nutriments.carbohydrates_100g : null;
      const xe = carbs !== null ? ((carbs * grams) / 12 / 100).toFixed(2) : null;
      resultDiv.innerHTML = `
        <div class="bg-white rounded-2xl shadow p-4 flex flex-col sm:flex-row gap-4 items-center justify-center">
          <div class="w-32 h-32 bg-gray-100 rounded-xl flex items-center justify-center overflow-hidden mb-2 sm:mb-0">
            ${prod.image_front_url ? `<img src="${prod.image_front_url}" alt="Фото" class="object-cover w-full h-full" />` : '<span class="text-gray-400">Нет фото</span>'}
          </div>
          <div class="flex-1 flex flex-col items-center sm:items-start">
            <div class="text-lg font-semibold text-center sm:text-left">${prod.product_name || query}</div>
            <div class="text-gray-400 text-xs mb-1">${info ? `Уточнение: ${info}` : ''}</div>
            <div class="text-gray-500 text-sm">Углеводы: <span class="font-bold">${carbs !== null ? carbs + ' г/100г' : 'нет данных'}</span></div>
            <div class="text-blue-600 text-lg font-bold">В ${grams} г ≈ <span>${xe !== null ? xe : '?'}</span> ХЕ</div>
            <button id="nyam-save-btn" class="mt-4 bg-green-500 text-white rounded-xl px-4 py-2 font-semibold hover:bg-green-600 transition">Сохранить</button>
          </div>
        </div>
      `;
      document.getElementById('nyam-save-btn').onclick = () => {
        // Сохраняем продукт в избранное
        const fav = {
          code: prod.code,
          name: prod.product_name || query,
          image: prod.image_front_url || '',
          carbs,
          info,
        };
        if (!nyamFavorites.some(f => f.code === fav.code && f.info === fav.info)) {
          nyamFavorites.unshift(fav);
          localStorage.setItem('nyam_favorites', JSON.stringify(nyamFavorites));
          renderNyamFavorites();
        }
      };
    } catch {
      resultDiv.innerHTML = '<div class="text-red-400 text-center">Ошибка поиска :(</div>';
    }
  };
}

function renderNyamFavorites() {
  const favDiv = document.getElementById('nyam-favorites');
  if (!favDiv) return;
  if (!nyamFavorites.length) {
    favDiv.innerHTML = '';
    return;
  }
  favDiv.innerHTML = '<div class="text-lg font-semibold mb-2">Сохранённые продукты</div>' +
    nyamFavorites.map(fav => {
      return `
        <div class="bg-white rounded-2xl shadow p-4 flex flex-col sm:flex-row gap-4 items-center justify-center mb-3">
          <div class="w-20 h-20 bg-gray-100 rounded-xl flex items-center justify-center overflow-hidden mb-2 sm:mb-0">
            ${fav.image ? `<img src="${fav.image}" alt="Фото" class="object-cover w-full h-full" />` : '<span class="text-gray-400">Нет фото</span>'}
          </div>
          <div class="flex-1 flex flex-col items-center sm:items-start">
            <div class="text-base font-semibold text-center sm:text-left">${fav.name}</div>
            <div class="text-gray-500 text-sm">Углеводы: <span class="font-bold">${fav.carbs !== null ? fav.carbs + ' г/100г' : 'нет данных'}</span></div>
            <div class="flex gap-2 mt-2">
              <button class="nyam-reuse-btn bg-blue-100 text-blue-700 rounded-xl px-3 py-1 font-semibold hover:bg-blue-200 transition" data-id="${fav.id}">Посчитать</button>
              <button class="nyam-remove-btn bg-red-100 text-red-600 rounded-xl px-3 py-1 font-semibold hover:bg-red-200 transition" data-id="${fav.id}">Удалить</button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  favDiv.querySelectorAll('.nyam-reuse-btn').forEach(btn => {
    btn.onclick = () => {
      const fav = nyamFavorites.find(f => f.id === btn.dataset.id);
      if (!fav) return;
      const form = document.getElementById('nyam-form');
      form.query.value = fav.name;
      form.grams.focus();
      form.grams.select();
      form.dispatchEvent(new Event('submit', { bubbles: true }));
    };
  });
  favDiv.querySelectorAll('.nyam-remove-btn').forEach(btn => {
    btn.onclick = async () => {
      await deleteFavoriteFromSupabase(btn.dataset.id);
      nyamFavorites = await loadFavoritesFromSupabase();
      localStorage.setItem('nyam_favorites', JSON.stringify(nyamFavorites));
      renderNyamFavorites();
    };
  });
}

function renderNyamFavoritesPage(root) {
  const section = document.createElement('section');
  section.className = 'p-4 pt-8 pb-24 max-w-md mx-auto w-full';
  section.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-xl font-semibold">Сохранённые продукты</h2>
      <button id="nyam-fav-back" class="text-blue-500 hover:text-blue-700 text-2xl" title="Назад">←</button>
    </div>
    <form id="nyam-fav-search" class="flex flex-col gap-4 mb-6">
      <input type="text" name="search" placeholder="Поиск по названию" class="rounded-xl border px-4 py-2" />
      <input type="number" name="grams" min="1" placeholder="Количество грамм" class="rounded-xl border px-4 py-2" />
    </form>
    <div id="nyam-fav-list"></div>
  `;
  root.appendChild(section);
  let search = '';
  let grams = '';
  const renderList = () => {
    const listDiv = document.getElementById('nyam-fav-list');
    let filtered = nyamFavorites;
    if (search) filtered = filtered.filter(f => f.name.toLowerCase().includes(search.toLowerCase()));
    if (!filtered.length) {
      listDiv.innerHTML = '<div class="text-gray-400 text-center">Нет сохранённых продуктов</div>';
      return;
    }
    listDiv.innerHTML = filtered.map(fav => {
      const xe = fav.carbs !== null && grams ? ((fav.carbs * grams) / 12 / 100).toFixed(2) : '';
      return `
        <div class="bg-white rounded-2xl shadow p-4 flex flex-col sm:flex-row gap-4 items-center justify-center mb-3">
          <div class="w-20 h-20 bg-gray-100 rounded-xl flex items-center justify-center overflow-hidden mb-2 sm:mb-0">
            ${fav.image ? `<img src="${fav.image}" alt="Фото" class="object-cover w-full h-full" />` : '<span class="text-gray-400">Нет фото</span>'}
          </div>
          <div class="flex-1 flex flex-col items-center sm:items-start">
            <div class="text-base font-semibold text-center sm:text-left">${fav.name}</div>
            <div class="text-gray-400 text-xs mb-1">${fav.info ? `Уточнение: ${fav.info}` : ''}</div>
            <div class="text-gray-500 text-sm">Углеводы: <span class="font-bold">${fav.carbs !== null ? fav.carbs + ' г/100г' : 'нет данных'}</span></div>
            ${xe ? `<div class="text-blue-600 text-lg font-bold">В ${grams} г ≈ <span>${xe}</span> ХЕ</div>` : ''}
            <div class="flex gap-2 mt-2">
              <button class="nyam-remove-btn bg-red-100 text-red-600 rounded-xl px-3 py-1 font-semibold hover:bg-red-200 transition" data-code="${fav.code}" data-info="${fav.info}">Удалить</button>
            </div>
          </div>
        </div>
      `;
    }).join('');
    listDiv.querySelectorAll('.nyam-remove-btn').forEach(btn => {
      btn.onclick = () => {
        nyamFavorites = nyamFavorites.filter(f => !(f.code === btn.dataset.code && f.info === btn.dataset.info));
        localStorage.setItem('nyam_favorites', JSON.stringify(nyamFavorites));
        renderList();
      };
    });
  };
  section.querySelector('input[name="search"]').oninput = (e) => {
    search = e.target.value;
    renderList();
  };
  section.querySelector('input[name="grams"]').oninput = (e) => {
    grams = e.target.value;
    renderList();
  };
  renderList();
  document.getElementById('nyam-fav-back').onclick = () => { NYAM_FAV_TAB = false; render(); };
}

function renderSettings(root) {
  const section = document.createElement('section');
  section.className = 'p-4 pt-8 pb-24 max-w-md mx-auto w-full';
  // Получаем имя или email
  const userName = (STATE.user && STATE.user.name) ? STATE.user.name : (STATE.user && STATE.user.email ? STATE.user.email : 'Пользователь');
  const userInitial = (STATE.user && STATE.user.name) ? STATE.user.name[0].toUpperCase() : (STATE.user && STATE.user.email ? STATE.user.email[0].toUpperCase() : '?');
  section.innerHTML = `
    <div class="flex items-center gap-2 mb-4">
      <button id="back-btn" class="text-blue-500 text-2xl bg-blue-50 rounded-full w-10 h-10 flex items-center justify-center hover:bg-blue-100" title="Назад">←</button>
      <h2 class="text-xl font-semibold">Настройки</h2>
    </div>
    <div class="bg-white rounded-2xl shadow-xl p-6 flex flex-col gap-6">
      <div class="flex flex-col items-center gap-2">
        <span class="text-sm text-gray-600">Фото профиля</span>
        <div class="w-20 h-20 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 text-white flex items-center justify-center font-bold text-3xl overflow-hidden relative">
          ${profilePhoto ? `<img src="${profilePhoto}" alt="Фото" class="w-full h-full object-cover" />` : userInitial}
        </div>
        <div class="flex gap-2 mt-2">
          <label class="bg-blue-100 text-blue-700 rounded-xl px-3 py-1 font-semibold hover:bg-blue-200 transition cursor-pointer flex items-center gap-1">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4"/></svg>
            Загрузить
            <input type="file" accept="image/*" class="hidden" id="photo-input" />
          </label>
          <button id="remove-photo" class="bg-red-100 text-red-600 rounded-xl px-3 py-1 font-semibold hover:bg-red-200 transition flex items-center gap-1 ${profilePhoto ? '' : 'hidden'}">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12"/></svg>
            Удалить
          </button>
        </div>
      </div>
      <button id="change-name-btn" class="flex items-center gap-2 bg-blue-100 text-blue-700 rounded-xl py-2 px-4 font-semibold hover:bg-blue-200 transition">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M15.232 5.232l3.536 3.536M9 13l6-6 3 3-6 6H9v-3z"/></svg>
        Сменить имя
      </button>
      <button id="export-all-btn" class="flex items-center gap-2 bg-green-100 text-green-700 rounded-xl py-2 px-4 font-semibold hover:bg-green-200 transition">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4"/></svg>
        Экспорт всех записей
      </button>
      <label class="flex items-center gap-2 bg-blue-100 text-blue-700 rounded-xl py-2 px-4 font-semibold hover:bg-blue-200 transition cursor-pointer">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 12h16"/></svg>
        Импорт всех записей
        <input type="file" id="import-all-input" accept="application/json" class="hidden" />
      </label>
      <button id="reset-btn" class="flex items-center gap-2 bg-red-100 text-red-600 rounded-xl py-2 px-4 font-semibold hover:bg-red-200 transition">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12"/></svg>
        Сбросить все данные
      </button>
    </div>
  `;
  root.appendChild(section);
  document.getElementById('back-btn').onclick = () => { SETTINGS_TAB = false; render(); };
  // Фото профиля
  section.querySelector('#photo-input').onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      profilePhoto = ev.target.result;
      localStorage.setItem('diary_photo', profilePhoto);
      render();
    };
    reader.readAsDataURL(file);
  };
  section.querySelector('#remove-photo').onclick = () => {
    profilePhoto = null;
    localStorage.removeItem('diary_photo');
    render();
  };
  // Имя
  section.querySelector('#change-name-btn').onclick = () => {
    openChangeNameModal();
  };
  // Экспорт
  section.querySelector('#export-all-btn').onclick = () => {
    const blob = new Blob([JSON.stringify(STATE.entries, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diary-all.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  // Импорт
  section.querySelector('#import-all-input').onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target.result);
        if (Array.isArray(imported)) {
          if (confirm('Заменить все текущие записи на импортированные?')) {
            STATE.entries = imported;
            saveState();
            render();
          }
        } else {
          alert('Файл не содержит корректный список записей!');
        }
      } catch {
        alert('Ошибка чтения файла!');
      }
    };
    reader.readAsText(file);
  };
  // Сброс
  section.querySelector('#reset-btn').onclick = () => {
    if (confirm('Вы уверены, что хотите удалить все данные?')) {
      STATE.entries = [];
      saveState();
      render();
    }
  };
}

// Модалка смены имени с поддержкой Supabase
function openChangeNameModal() {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30';
  const userName = (STATE.user && STATE.user.name) ? STATE.user.name : (STATE.user && STATE.user.email ? STATE.user.email : '');
  modal.innerHTML = `
    <div class="bg-white rounded-2xl shadow-xl p-6 w-full max-w-xs flex flex-col gap-4 relative">
      <button class="absolute top-2 right-2 text-gray-400 hover:text-gray-700 text-xl close-modal">×</button>
      <h3 class="text-lg font-semibold mb-2">Сменить имя</h3>
      <form id="change-name-form" class="flex flex-col gap-3">
        <input type="text" name="name" class="rounded-xl border px-4 py-2" value="${userName}" required />
        <div class="flex gap-2 mt-2">
          <button type="submit" class="bg-blue-500 text-white rounded-xl px-4 py-2 font-semibold hover:bg-blue-600 transition">Сохранить</button>
          <button type="button" class="close-modal bg-gray-100 text-gray-600 rounded-xl px-4 py-2 font-semibold hover:bg-gray-200 transition">Отмена</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelectorAll('.close-modal').forEach(btn => btn.onclick = () => modal.remove());
  modal.querySelector('#change-name-form').onsubmit = async (e) => {
    e.preventDefault();
    const newName = e.target.name.value.trim();
    if (newName) {
      // Сохраняем в Supabase user_metadata, если есть supabase
      if (supabase && STATE.user && STATE.user.id) {
        await supabase.auth.updateUser({ data: { name: newName } });
        // Обновляем локально
        STATE.user.name = newName;
        saveState();
        modal.remove();
        render();
      } else {
        // Только локально
        STATE.user.name = newName;
        saveState();
        modal.remove();
        render();
      }
    }
  };
}

// --- Supabase sync helpers ---
async function loadEntriesFromSupabase() {
  if (!supabase || !STATE.user) return [];
  const { data, error } = await supabase
    .from('entries')
    .select('*')
    .eq('user_id', STATE.user.id)
    .order('date', { ascending: false })
    .order('time', { ascending: false });
  return data || [];
}
async function addEntryToSupabase(entry) {
  if (!supabase || !STATE.user) return;
  await supabase.from('entries').insert([{ ...entry, user_id: STATE.user.id }]);
}
async function updateEntryInSupabase(entry, id) {
  if (!supabase || !STATE.user) return;
  await supabase.from('entries').update(entry).eq('id', id);
}
async function deleteEntryFromSupabase(id) {
  if (!supabase || !STATE.user) return;
  await supabase.from('entries').delete().eq('id', id);
}
async function loadFavoritesFromSupabase() {
  if (!supabase || !STATE.user) return [];
  const { data, error } = await supabase
    .from('favorites')
    .select('*')
    .eq('user_id', STATE.user.id)
    .order('inserted_at', { ascending: false });
  return data || [];
}
async function addFavoriteToSupabase(fav) {
  if (!supabase || !STATE.user) return;
  await supabase.from('favorites').insert([{ ...fav, user_id: STATE.user.id }]);
}
async function deleteFavoriteFromSupabase(id) {
  if (!supabase || !STATE.user) return;
  await supabase.from('favorites').delete().eq('id', id);
}
// --- Patch: загрузка данных при входе ---
async function syncUserData() {
  if (!supabase) return;
  // Получаем текущего пользователя
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return;
  // Имя из user_metadata
  user.name = user.user_metadata && user.user_metadata.name ? user.user_metadata.name : undefined;
  STATE.user = user;
  // Загружаем записи и избранное из Supabase
  STATE.entries = await loadEntriesFromSupabase();
  nyamFavorites = await loadFavoritesFromSupabase();
  localStorage.setItem('nyam_favorites', JSON.stringify(nyamFavorites));
  saveState();
}

// --- Init ---
loadState();
render();
window.addEventListener('storage', () => { loadState(); render(); }); 