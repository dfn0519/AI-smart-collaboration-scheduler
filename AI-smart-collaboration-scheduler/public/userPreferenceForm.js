import { getOneAccountObjectFromId, putOneAccount } from './accountApi.js';

const days = [
  { key: 'mon', bkKey: 'Mon', label: '禮拜一' },
  { key: 'tue', bkKey: 'Tue', label: '禮拜二' },
  { key: 'wed', bkKey: 'Wed', label: '禮拜三' },
  { key: 'thu', bkKey: 'Thu', label: '禮拜四' },
  { key: 'fri', bkKey: 'Fri', label: '禮拜五' },
  { key: 'sat', bkKey: 'Sat', label: '禮拜六' },
  { key: 'sun', bkKey: 'Sun', label: '禮拜日' },
];

const focusSlots = [
  '00:00-06:00', '06:00-09:00', '09:00-12:00',
  '12:00-15:00', '15:00-18:00', '18:00-21:00', '21:00-24:00', '無特別偏好'
];

const durationOptions = [
  '20-30min', '30-60min', '60-90min', '90-120min', '自訂'
];

let currentUserAccount = null;

document.getElementById('menu-button').addEventListener('click', async () => {
  const userPrefForm = document.getElementById('user-preference-modal');
  // 先把表單顯示出來，減少點開時因為等待後端回應而卡頓的感覺
  userPrefForm.classList.remove('hidden');

  // 從後端拉取載入 user_form
  const userId = sessionStorage.getItem("userId");
  if (userId) {
    currentUserAccount = await getOneAccountObjectFromId(userId);
    if (currentUserAccount && currentUserAccount.user_form) {
      populateForm(currentUserAccount.user_form);
    }
  }
});

document.getElementById('cancelBtn').addEventListener('click', () => {
  const userPrefForm = document.getElementById('user-preference-modal');
  userPrefForm.classList.add('hidden');
});

function populateForm(form) {
  if (!form) return;

  // 1. 每日空閒時段
  days.forEach(d => {
    const slotList = document.querySelector(`.slot-list[data-day="${d.key}"]`);
    if (!slotList) return;
    slotList.innerHTML = '';
    const times = form.available_time[d.bkKey] || [];
    if (times.length === 0) {
      appendSlotRow(slotList);
    } else {
      times.forEach(t => {
        const [start, end] = t.split(/[-–]/);
        appendSlotRow(slotList, start, end);
      });
    }
  });

  // 2. 最佳專注時段
  const checkboxes = document.querySelectorAll('#QA2-slots input[type="checkbox"]');
  checkboxes.forEach(cb => {
    cb.checked = (form.best_focus_periods || []).includes(cb.value);
  });

  // 3. 理想任務持續時間
  const radios = document.querySelectorAll('#QA3-slots input[type="radio"]');
  let matched = false;
  radios.forEach(rb => {
    if (rb.value === form.ideal_task_duration) {
      rb.checked = true;
      matched = true;
      document.getElementById('customDuration').disabled = true;
    }
  });
  if (!matched && form.ideal_task_duration) {
    const customRb = document.querySelector('#QA3-slots input[value="自訂"]');
    if (customRb) {
      customRb.checked = true;
      const customInput = document.getElementById('customDuration');
      customInput.disabled = false;
      const match = form.ideal_task_duration.match(/(\d+)/);
      if (match) customInput.value = match[0];
    }
  }

  // 4. 任務類型
  const taskList = document.getElementById('QA4-slots');
  taskList.innerHTML = '';
  const tasks = form.task_types || [];
  if (tasks.length === 0) {
    appendTaskRow(taskList);
  } else {
    tasks.forEach(t => {
      appendTaskRow(taskList, t.name, t.focus_level);
    });
  }

  // 5. 偏好時段
  if (form.time_preferences) {
    if (form.time_preferences.morning) document.getElementById('prefMorning').value = form.time_preferences.morning;
    if (form.time_preferences.afternoon) document.getElementById('prefAfternoon').value = form.time_preferences.afternoon;
    if (form.time_preferences.evening) document.getElementById('prefEvening').value = form.time_preferences.evening;
    if (form.time_preferences.night) document.getElementById('prefLateNight').value = form.time_preferences.night;
  }
}

// 初始化「每日時段」區塊
const dailySlotsEl = document.getElementById('QA1-slots');
days.forEach(d => {
  const section = document.createElement('div');
  section.className = 'each-section';
  section.style.background = 'transparent';
  section.style.border = '1px dashed rgba(255,255,255,0.15)';
  section.style.padding = '12px';

  const title = document.createElement('div');
  title.className = 'section-title';
  title.textContent = d.label;
  section.appendChild(title);

  const slotList = document.createElement('div');
  slotList.className = 'slot-list';
  slotList.dataset.day = d.key;
  section.appendChild(slotList);

  const addSlotBtn = document.createElement('button');
  addSlotBtn.type = 'button';
  addSlotBtn.className = 'QAButton';
  addSlotBtn.textContent = '＋ 新增時段';
  addSlotBtn.style.marginTop = '8px';
  addSlotBtn.addEventListener('click', () => appendSlotRow(slotList));
  section.appendChild(addSlotBtn);

  // 預設給一筆空白輸入
  appendSlotRow(slotList);

  dailySlotsEl.appendChild(section);
});

// 初始化專注時段選擇
const focusWrap = document.getElementById('QA2-slots');
focusSlots.forEach(label => {
  const pill = document.createElement('label');
  pill.className = 'pill';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.name = 'QA2-slots';
  cb.value = label;
  cb.style.accentColor = '#35a7ff';
  pill.appendChild(cb);
  pill.appendChild(document.createTextNode(label));
  focusWrap.appendChild(pill);
});

// 初始化持續時間選擇
const durationsWrap = document.getElementById('QA3-slots');
durationOptions.forEach(opt => {
  const row = document.createElement('label');
  row.className = 'pill';
  const rb = document.createElement('input');
  rb.type = 'radio';
  rb.name = 'QA3-slots';
  rb.value = opt;
  rb.style.accentColor = '#35a7ff';
  row.appendChild(rb);
  row.appendChild(document.createTextNode(opt));

  if (opt === '自訂') {
    const custom = document.createElement('input');
    custom.type = 'number';
    custom.min = '10';
    custom.max = '240';
    custom.placeholder = '自訂分鐘數';
    custom.id = 'customDuration';
    custom.style.width = '140px';
    custom.disabled = true;
    row.appendChild(custom);

    rb.addEventListener('change', () => { custom.disabled = false; custom.focus(); });
  } else {
    rb.addEventListener('change', () => {
      const custom = document.getElementById('customDuration');
      if (custom) { custom.disabled = true; custom.value = ''; }
    });
  }
  durationsWrap.appendChild(row);
});

// 初始化任務類型（至少一筆）
const taskList = document.getElementById('QA4-slots');
appendTaskRow(taskList);
document.getElementById('addTaskBtn').addEventListener('click', () => appendTaskRow(taskList));

// 提交
document.getElementById('userPrefForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = collectData();
  if (!validate(formData)) return;

  if (currentUserAccount) {
    currentUserAccount.user_form = formData;
    const updatedAccount = await putOneAccount(currentUserAccount._id, currentUserAccount);
    if (updatedAccount) {
      currentUserAccount = updatedAccount;
      alert('儲存成功！並已更新到伺服器');
      document.getElementById('user-preference-modal').classList.add('hidden');
    } else {
      alert('儲存失敗：伺服器錯誤');
    }
  } else {
    alert('警告：尚未登入或獲取使用者資料失敗，無法儲存。');
  }
});

function appendSlotRow(slotList, startVal = '', endVal = '') {
  const row = document.createElement('div');
  row.className = 'row';

  const startWrap = document.createElement('div');
  const startLabel = document.createElement('div');
  startLabel.className = 'label';
  startLabel.textContent = '開始';
  const startTime = document.createElement('input');
  startTime.type = 'time';
  startTime.required = true;
  if (startVal) startTime.value = startVal;
  startWrap.appendChild(startLabel);
  startWrap.appendChild(startTime);

  const endWrap = document.createElement('div');
  const endLabel = document.createElement('div');
  endLabel.className = 'label';
  endLabel.textContent = '結束';
  const endTime = document.createElement('input');
  endTime.type = 'time';
  endTime.required = true;
  if (endVal) endTime.value = endVal;

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'QAButton btn-danger';
  delBtn.textContent = '刪除';
  delBtn.style.marginLeft = '8px';
  delBtn.addEventListener('click', () => {
    if (slotList.querySelectorAll('.row').length > 1) {
      row.remove();
    }
  });

  endWrap.appendChild(endLabel);
  endWrap.appendChild(endTime);
  endWrap.appendChild(delBtn); // 直接放在 endWrap 裡

  row.appendChild(startWrap);
  row.appendChild(endWrap);

  slotList.appendChild(row);
}


// 工具：新增任務
function appendTaskRow(container, nameVal = '', focusVal = '低') {
  const row = document.createElement('div');
  row.className = 'task-row';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = '任務名稱';
  nameInput.required = true;
  if (nameVal) nameInput.value = nameVal;

  const focusSelect = document.createElement('select');
  ['低', '中', '高'].forEach(level => {
    const opt = document.createElement('option');
    opt.value = level; opt.textContent = `專注度：${level}`;
    focusSelect.appendChild(opt);
  });
  if (focusVal) focusSelect.value = focusVal;

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'QAButton btn-danger';
  delBtn.textContent = '刪除';
  delBtn.addEventListener('click', () => {
    const rows = container.querySelectorAll('.task-row');
    if (rows.length > 1) { row.remove(); }
  });

  row.appendChild(nameInput);
  row.appendChild(focusSelect);
  row.appendChild(delBtn);

  container.appendChild(row);
}


// 收集資料
function collectData() {
  const available_time = {};
  days.forEach(d => {
    const list = document.querySelector(`.slot-list[data-day="${d.key}"]`);
    if (!list) return;
    const slots = [];
    list.querySelectorAll('.row').forEach(r => {
      const times = r.querySelectorAll('input[type="time"]');
      const start = times[0].value || null;
      const end = times[1].value || null;
      if (start && end) { slots.push(`${start}-${end}`); }
    });
    available_time[d.bkKey] = slots;
  });

  const best_focus_periods = Array.from(document.querySelectorAll('#QA2-slots input[type="checkbox"]:checked')).map(x => x.value);

  const durRb = document.querySelector('#QA3-slots input[type="radio"]:checked');
  let ideal_task_duration = "";
  if (durRb) {
    if (durRb.value === '自訂') {
      const custom = document.getElementById('customDuration').value;
      if (custom) ideal_task_duration = `${custom}min`;
    } else {
      ideal_task_duration = durRb.value;
    }
  }

  const task_types = [];
  document.querySelectorAll('#QA4-slots .task-row').forEach(row => {
    const name = row.querySelector('input[type="text"]').value.trim();
    const focus_level = row.querySelector('select').value;
    if (name) {
      task_types.push({ name, focus_level });
    }
  });

  const time_preferences = {
    morning: document.getElementById('prefMorning').value || "中",
    afternoon: document.getElementById('prefAfternoon').value || "中",
    evening: document.getElementById('prefEvening').value || "中",
    night: document.getElementById('prefLateNight').value || "中",
  };

  return { available_time, best_focus_periods, ideal_task_duration, task_types, time_preferences };
}

// 驗證
function validate(form) {
  const dailySlotsError = document.getElementById('QA1-slots-error');
  const focusError = document.getElementById('QA2-slots-error');
  const durationError = document.getElementById('QA3-slots-error');
  const taskError = document.getElementById('QA4-slots-error');

  dailySlotsError.style.display = 'none';
  focusError.style.display = 'none';
  durationError.style.display = 'none';
  taskError.style.display = 'none';

  // 1. 每日時段必填：至少一日有一段合法時間
  const hasAnySlot = Object.values(form.available_time).some(slots => slots.length > 0);
  if (!hasAnySlot) {
    dailySlotsError.textContent = '請至少在一個「禮拜」新增一筆空閒時段（開始與結束都需填寫）。';
    dailySlotsError.style.display = 'block';
    return false;
  }
  // 檢查每一筆 start < end
  for (const dayKey in form.available_time) {
    for (const slotStr of form.available_time[dayKey]) {
      const [start, end] = slotStr.split('-');
      if (start >= end) {
        dailySlotsError.textContent = '所有空閒時段的「開始時間」需早於「結束時間」。';
        dailySlotsError.style.display = 'block';
        return false;
      }
    }
  }

  // 2. 專注時段必選至少一項
  if (!form.best_focus_periods || form.best_focus_periods.length === 0) {
    focusError.textContent = '請至少選擇一個「最佳專注時段」。';
    focusError.style.display = 'block';
    return false;
  }

  // 3. 持續時間必選；若自訂需填值
  if (!form.ideal_task_duration) {
    durationError.textContent = '請選擇一次任務的理想持續時間（或填寫自訂分鐘數）。';
    durationError.style.display = 'block';
    return false;
  }

  // 4. 任務類型至少一項
  if (!form.task_types || form.task_types.length === 0) {
    taskError.textContent = '請至少新增一項「任務名稱」與「專注度」。';
    taskError.style.display = 'block';
    return false;
  }

  return true;
}
