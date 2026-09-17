import { postTask, getUserTasks, deleteOneTask, putOneTask } from "./taskApi.js";
import { getOneAccountObjectFromId } from "./accountApi.js";
const BASE_URL = typeof window === "undefined"
    ? "http://localhost:3000"   // Node.js 用
    : "";                       // Browser 用 (空字串代表相對路徑)


const userId = sessionStorage.getItem("userId");

// === 日歷渲染 ===
document.addEventListener("DOMContentLoaded", async () => {
    //--- 抓取資料庫中的task與使用者自訂任務類型
    let tasksData = {};
    let taskTypes = ["其他"]; // 預設至少有其他
    try {
        const [tasksFromDB, accountData] = await Promise.all([
            getUserTasks(userId),
            getOneAccountObjectFromId(userId)
        ]);

        if (tasksFromDB) {
            tasksData = buildTasksData(tasksFromDB);
        }

        if (accountData && accountData.user_form && accountData.user_form.task_types) {
            // 從帳號設定中提取任務類型名稱
            taskTypes = accountData.user_form.task_types.map(t => t.name);
            if (!taskTypes.includes("其他")) taskTypes.push("其他");
        }
    } catch (err) {
        console.error("載入資料失敗:", err);
    }

    // --- 日歷初始化
    const monthYear = document.getElementById("month-year"); //該年月
    const daysContainer = document.getElementById("calendar-days"); //每日1~31號容器
    const prevButton = document.getElementById("prev");
    const nextButton = document.getElementById("next");
    let selectedDay = null; //被點選的日期
    let curDate = new Date();

    const months = ["一月", "二月", "三月",
        "四月", "五月", "六月",
        "七月", "八月", "九月",
        "十月", "十一月", "十二月",]

    function renderCalendar(date) {
        const year = date.getFullYear(); //取得date的年份
        const month = date.getMonth(); //取得date的月份
        const firstDayOfMonth = new Date(year, month, 1).getDay(); //取得該月第一天是星期幾
        const lastDayOfMonth = new Date(year, month + 1, 0).getDate(); //取得該月最後一天是幾號
        monthYear.textContent = `${months[month]} ${year}`;
        daysContainer.innerHTML = "";

        //前個月的日期
        const lastDayOfPrevMonth = new Date(year, month, 0).getDate();
        for (let i = firstDayOfMonth; i > 0; i--) {
            const newDayDiv = document.createElement('div');
            newDayDiv.textContent = lastDayOfPrevMonth - i + 1;
            newDayDiv.classList.add('otherMonthDay');

            // 判斷是否有未完成任務 
            const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            const tasks = tasksData[dateKey];
            if (tasks && tasks.some(task => task.finished === false)) {
                newDayDiv.style.borderBottom = "2px solid #FF9800";
            }

            newDayDiv.addEventListener('click', function () {
                document.querySelectorAll('.selected').forEach(day => day.classList.remove('selected'));
                this.classList.add('selected');
                const clickedDate = new Date(year, month - 1, this.textContent); //點選的日期
                clickedDate.setHours(clickedDate.getHours() + 8); // 調整為台灣時區 (UTC+8)
                selectedDay = clickedDate.toISOString().split('T')[0]; //clickedDate = YYYY-MM-DDT16:00:00.000Z => YYYY-MM-DD
                renderTasks(selectedDay);
            });

            daysContainer.appendChild(newDayDiv);
        }

        //當月的日期
        for (let i = 1; i <= lastDayOfMonth; i++) {
            const newDayDiv = document.createElement('div');
            newDayDiv.textContent = i;

            // 判斷是否有未完成任務 
            const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            const tasks = tasksData[dateKey];
            if (tasks && tasks.some(task => task.finished === false)) {
                newDayDiv.style.borderBottom = "2px solid #FF9800";
            }

            newDayDiv.addEventListener('click', function () {
                document.querySelectorAll('.selected').forEach(day => day.classList.remove('selected'));
                this.classList.add('selected');
                const clickedDate = new Date(year, month, this.textContent); //點選的日期
                clickedDate.setHours(clickedDate.getHours() + 8); // 調整為台灣時區 (UTC+8)
                selectedDay = clickedDate.toISOString().split('T')[0]; //clickedDate = YYYY-MM-DDT16:00:00.000Z => YYYY-MM-DD
                renderTasks(selectedDay);
            });

            daysContainer.appendChild(newDayDiv);
        }

        //下個月的日期
        const nextMonthStartDay = 6 - new Date(year, month + 1, 0).getDay(); //要補幾天
        for (let i = 1; i <= nextMonthStartDay; i++) { //補的天數幾號，剛好為1~天數
            const newDayDiv = document.createElement('div');
            newDayDiv.textContent = i;
            newDayDiv.classList.add('otherMonthDay');

            // 判斷是否有未完成任務 
            const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            const tasks = tasksData[dateKey];
            if (tasks && tasks.some(task => task.finished === false)) {
                newDayDiv.style.borderBottom = "2px solid #FF9800";
            }

            newDayDiv.addEventListener('click', function () {
                document.querySelectorAll('.selected').forEach(day => day.classList.remove('selected'));
                this.classList.add('selected');
                const clickedDate = new Date(year, month + 1, this.textContent); //點選的日期
                clickedDate.setHours(clickedDate.getHours() + 8); // 調整為台灣時區 (UTC+8)
                selectedDay = clickedDate.toISOString().split('T')[0]; //clickedDate = YYYY-MM-DDT16:00:00.000Z => YYYY-MM-DD
                renderTasks(selectedDay);
            });

            daysContainer.appendChild(newDayDiv);
        }
    }

    //切換月份後渲染
    prevButton.addEventListener('click', () => {
        curDate.setMonth(curDate.getMonth() - 1);
        renderCalendar(curDate);
    });

    nextButton.addEventListener('click', () => {
        curDate.setMonth(curDate.getMonth() + 1);
        renderCalendar(curDate);
    });

    renderCalendar(curDate); //初始渲染

    //渲染任務列表=========================================
    // 動態生成 select 選項
    function userTaskTypes(selectId, selectedValue = "") {
        const select = document.getElementById(selectId);
        select.innerHTML = ""; // 清空舊選項

        taskTypes.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            if (t === selectedValue) opt.selected = true; // 編輯時預設選中
            select.appendChild(opt);
        });
    }

    //從資料庫拿到的task轉換成前端使用的taskData
    function buildTasksData(tasks) {
        const result = {};

        tasks.forEach(task => {
            const dateKey = task.date;

            if (!result[dateKey]) {
                result[dateKey] = [];
            }

            result[dateKey].push({
                _id: task._id,                  //刪除編輯會用到
                title: task.title,
                content: task.content,
                time: task.time,
                duration: task.duration.toString(),
                finished: task.finished || false,
                finishedStartTime: task.finishedStartTime,
                finishedDuration: task.finishedDuration,
                finishedCompletionStatus: task.finishedCompletionStatus
            });
        });

        return result;
    }

    // 統一資料結構：tasksData[date] = [{ title, content, time, duration }]
    function renderTasks(selectedDay) {
        const taskList = document.getElementById('task-list');
        taskList.innerHTML = "";

        const tasks = tasksData[selectedDay];

        // 新增任務按鈕
        const newTaskBtn = document.createElement('button');
        newTaskBtn.classList.add('task-textmid-item');
        newTaskBtn.style.cursor = 'pointer';
        newTaskBtn.style.border = 'none';
        newTaskBtn.innerHTML = '+ 新增任務(點擊)';

        newTaskBtn.addEventListener('click', () => {
            document.getElementById('add-task-modal').classList.remove('hidden');
            document.getElementById('add-content').value = '';
            document.getElementById('add-start-datetime').value = '';
            document.getElementById('add-duration').value = '';
            userTaskTypes('add-title');

            document.getElementById('save-add-btn').onclick = async () => {
                const title = document.getElementById('add-title').value.trim();
                const content = document.getElementById('add-content').value.trim();
                const startDatetime = document.getElementById('add-start-datetime').value;
                const duration = parseInt(document.getElementById('add-duration').value, 10);

                if (!title || !content || !startDatetime || isNaN(duration)) {
                    alert("請填寫所有欄位");
                    return;
                }

                const start = new Date(startDatetime);
                const formatTime = (date) => {
                    const h = String(date.getHours()).padStart(2, '0');
                    const m = String(date.getMinutes()).padStart(2, '0');
                    return `${h}:${m}`;
                };

                const dateKey = startDatetime.split("T")[0]; // 取日期部分
                const newTaskData = {
                    owner: userId,
                    title,
                    content,
                    date: dateKey,
                    time: formatTime(start),
                    duration
                };

                const savedTask = await postTask(newTaskData);
                if (!savedTask) {
                    alert("新增任務失敗");
                    return;
                }

                if (!tasksData[dateKey]) tasksData[dateKey] = [];
                tasksData[dateKey].push({
                    _id: savedTask._id,
                    title: savedTask.title,
                    content: savedTask.content,
                    time: savedTask.time,
                    duration: savedTask.duration.toString(),
                    finished: savedTask.finished
                });

                renderTasks(selectedDay);
                renderCalendar(curDate);
                document.getElementById('add-task-modal').classList.add('hidden');
            };

            document.getElementById('cancel-add-btn').onclick = () => {
                document.getElementById('add-task-modal').classList.add('hidden');
            };
        });
        taskList.appendChild(newTaskBtn);

        if (!tasks || tasks.length === 0) return;

        tasks.forEach((task, index) => {
            const div = document.createElement('div');
            div.classList.add('task-item');

            // 顯示任務內容
            if (task.finished == false) {
                const content = document.createElement('div');
                content.innerHTML = `
                    任務：${task.title}<br>
                    內容：${task.content}<br>
                    開始時間：${task.time}<br>
                    時長：${task.duration} 分鐘
                `;

                // 操作按鈕容器
                const btnGroup = document.createElement('div');
                btnGroup.classList.add('task-buttons');

                // 刪除
                const deleteBtn = document.createElement('button');
                deleteBtn.textContent = '刪除';
                deleteBtn.addEventListener('click', async () => {
                    const taskToDelete = tasksData[selectedDay][index];
                    const confirmed = confirm("確定要刪除這個任務嗎？");
                    if (!confirmed) return;

                    const result = await deleteOneTask(taskToDelete._id); // 呼叫 API
                    if (!result) {
                        alert("刪除失敗");
                        return;
                    }

                    // 刪除前端資料
                    tasksData[selectedDay].splice(index, 1);
                    renderTasks(selectedDay);
                    renderCalendar(curDate);
                });

                // 編輯
                const editBtn = document.createElement('button');
                editBtn.textContent = '編輯';
                editBtn.addEventListener('click', () => {
                    document.getElementById('edit-task-modal').classList.remove('hidden');
                    document.getElementById('edit-content').value = task.content;
                    document.getElementById('edit-start-datetime').value = `${selectedDay}T${task.time}`;
                    document.getElementById('edit-duration').value = task.duration;
                    userTaskTypes('edit-title', task.title);

                    document.getElementById('save-edit-btn').onclick = async () => {
                        const newTitle = document.getElementById('edit-title').value.trim();
                        const newContent = document.getElementById('edit-content').value.trim();
                        const startDatetime = document.getElementById('edit-start-datetime').value;
                        const duration = parseInt(document.getElementById('edit-duration').value, 10);

                        if (!newTitle || !newContent || !startDatetime || isNaN(duration)) {
                            alert("請填寫所有欄位");
                            return;
                        }

                        const start = new Date(startDatetime);
                        const formatTime = (date) => {
                            const h = String(date.getHours()).padStart(2, '0');
                            const m = String(date.getMinutes()).padStart(2, '0');
                            return `${h}:${m}`;
                        };

                        const newDateKey = startDatetime.split("T")[0];

                        const updatedTask = {
                            title: newTitle,
                            content: newContent,
                            date: newDateKey,
                            time: formatTime(start),
                            duration
                        }
                        const savedTask = await putOneTask(task._id, updatedTask);
                        if (!savedTask) return;

                        // 如果日期改變，移動任務
                        if (newDateKey !== selectedDay) {
                            tasksData[selectedDay].splice(index, 1);
                            if (!tasksData[newDateKey]) tasksData[newDateKey] = [];
                            tasksData[newDateKey].push({
                                _id: savedTask._id,
                                title: newTitle,
                                content: newContent,
                                time: formatTime(start),
                                duration: duration.toString(),
                                finished: false
                            });
                        } else {
                            tasksData[selectedDay][index] = {
                                _id: savedTask._id,
                                title: newTitle,
                                content: newContent,
                                time: formatTime(start),
                                duration: duration.toString(),
                                finished: false
                            };
                        }
                        renderTasks(selectedDay);
                        renderCalendar(curDate);
                        document.getElementById('edit-task-modal').classList.add('hidden');
                    };

                    document.getElementById('cancel-edit-btn').onclick = () => {
                        document.getElementById('edit-task-modal').classList.add('hidden');
                    };
                });

                // 完成
                const doneBtn = document.createElement('button');
                doneBtn.textContent = '完成';
                doneBtn.addEventListener('click', () => {
                    document.getElementById('done-task-modal').classList.remove('hidden');
                    document.getElementById('done-start-datetime').value = `${selectedDay}T${task.time}`;
                    document.getElementById('done-duration').value = task.duration;
                    document.getElementById('done-energy-level').value = task.finishedEnergyLevel || "普通";
                    document.getElementById('done-completion-status').value = task.finishedCompletionStatus || "完成";

                    document.getElementById('save-done-btn').onclick = async () => {
                        const finishTime = document.getElementById('done-start-datetime').value;
                        const duration = parseInt(document.getElementById('done-duration').value, 10);
                        const energyLevel = document.getElementById('done-energy-level').value;
                        const completionStatus = document.getElementById('done-completion-status').value;
                        const isFinished = true;


                        if (!finishTime || isNaN(duration)) {
                            alert("請輸入完成時間與持續時間！");
                            return;
                        }
                        const saved = await putOneTask(task._id, {
                            finished: isFinished,
                            finishedStartTime: finishTime,
                            finishedDuration: duration,
                            finishedEnergyLevel: energyLevel,
                            finishedCompletionStatus: completionStatus
                        });


                        if (!saved) {
                            alert("完成狀態儲存失敗");
                            return;
                        }

                        const rag = await fetch(`${BASE_URL}/rag_memory`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                owner: userId,
                                title: task.title || "",
                                content: task.content || "",
                                date: finishTime ? finishTime.split("T")[0] : selectedDay,
                                time: finishTime ? finishTime.split("T")[1] : task.time || "",
                                duration: duration,
                                finishedEnergyLevel: energyLevel,
                                finishedCompletionStatus: completionStatus,
                            })
                        });


                        tasksData[selectedDay][index].finishedStartTime = finishTime;
                        tasksData[selectedDay][index].finishedDuration = duration.toString();
                        tasksData[selectedDay][index].finishedEnergyLevel = energyLevel;
                        tasksData[selectedDay][index].finishedCompletionStatus = completionStatus;
                        tasksData[selectedDay][index].finished = isFinished;

                        renderTasks(selectedDay);
                        renderCalendar(curDate);
                        document.getElementById('done-task-modal').classList.add('hidden');
                    };

                    document.getElementById('cancel-done-btn').onclick = () => {
                        document.getElementById('done-task-modal').classList.add('hidden');
                    };
                });

                btnGroup.appendChild(deleteBtn);
                btnGroup.appendChild(editBtn);
                btnGroup.appendChild(doneBtn);

                div.appendChild(content);
                div.appendChild(btnGroup);
                taskList.appendChild(div);
            } else {
                const content = document.createElement('div');
                content.innerHTML = `
                    <s>任務：${task.title}</s><br>
                    <s>內容：${task.content}</s><br>
                    <s>開始時間：${task.time}</s><br>
                    <s>時長：${task.duration} 分鐘</s><br>
                    <strong>實際開始時間：${task.finishedStartTime}</strong><br>
                    <strong>實際持續時間：${task.finishedDuration} 分鐘</strong>
                    <strong>完成後狀態：${task.finishedEnergyLevel || "普通"}</strong><br>
                    <strong>是否完成：${task.finishedCompletionStatus || "完成"}</strong>
                `;
                content.classList.add('task-done');
                div.appendChild(content);
                taskList.appendChild(div);
            }
        });
    }

    // 監聽聊天室派送的事件
    document.addEventListener("addTaskFromChat", async (e) => {
        const taskMsg = e.detail;
        const dateKey = curDate.toISOString().split("T")[0];

        try {
            const taskList = parseTasksFromMessage(taskMsg, userId, dateKey);

            //將切分後的結果一一新增到資料庫，並更新前端資料結構
            for (const data of taskList) {
                const newTaskData = {
                    owner: userId,
                    title: data.title || "其他",
                    content: data.content,
                    date: data.date || dateKey,
                    time: data.time,
                    duration: data.duration || 60
                };
                const savedTask = await postTask(newTaskData);
                if (!savedTask) {
                    alert("新增任務失敗");
                    return;
                }

                // 更新本地 tasksData
                if (!tasksData[savedTask.date]) tasksData[savedTask.date] = [];
                tasksData[savedTask.date].push({
                    _id: savedTask._id, // 用資料庫回傳的 _id
                    title: savedTask.title,
                    content: savedTask.content,
                    time: savedTask.time,
                    duration: savedTask.duration.toString(),
                    finished: savedTask.finished || false
                });
            }

            // 更新 UI
            renderTasks(selectedDay);
            renderCalendar(curDate);

        } catch (err) {
            console.error("API Error:", err);
        }
    });
});

function parseTasksFromMessage(message, userId, dateKey) {
    const blocks = message.replace(/<br\s*\/?>/gi, "\n").split("任務偵測和建議")
        .map(b => b.trim())
        .filter(b => b.length > 0);

    return blocks.map(block => {
        const titleMatch = block.match(/類別\s*:\s*(.+?)\s/);
        const contentMatch = block.match(/內容\s*:\s*(.+?)\n/);
        const dateMatch = block.match(/日期\s*:\s*([0-9\-]+)/);
        const timeMatch = block.match(/時間\s*:\s*([0-9:]+)/);
        const durationMatch = block.match(/持續時間\s*:\s*(\d+)/);

        return {
            owner: userId,
            title: titleMatch?.[1] || "其他",
            content: contentMatch?.[1] || "",
            date: dateMatch?.[1] || dateKey,
            time: timeMatch?.[1] || null,
            duration: durationMatch ? Number(durationMatch[1]) : 60
        };
    });
}