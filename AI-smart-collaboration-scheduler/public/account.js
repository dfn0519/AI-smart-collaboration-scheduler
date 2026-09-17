import { postAccount, login, putOneAccount } from './accountApi.js';
import { postGroup } from './groupApi.js';

const tabs = document.querySelectorAll(".account-tab"); //上方登入創建切換按鈕
const submitBtn = document.getElementById("submit-btn"); //下方登入創建按鈕
const username = document.getElementById("username");
const password = document.getElementById("password");
const BASE_URL = typeof window === "undefined"
    ? "http://localhost:3000"   // Node.js 用
    : "";                       // Browser 用 (空字串代表相對路徑)

// 登入/註冊 按鈕切換
tabs.forEach(tab => {
    tab.addEventListener("click", () => {
        //切換active外觀顯示
        tabs.forEach(t => t.classList.remove("active"));
        tab.classList.add("active");

        //清空輸入區內容
        username.value = '';
        password.value = '';

        // 根據上方按鈕 變換 下方按鈕 (登入/創建)
        if (tab.textContent.includes('登入')) {
            submitBtn.textContent = '登入帳號';
        } else {
            submitBtn.textContent = '建立並登入帳號';
        }
    });
});

// 主執行按鈕事件（登入or創建帳號）
submitBtn.addEventListener("click", async () => {
    const user = username.value.trim();
    const pass = password.value.trim();

    if (user === '' || pass === '') return;

    const data = { userName: user, password: pass };

    try {
        if (!submitBtn.textContent.includes('建立')) {
            const userMsg = await login(data);

            if (userMsg && userMsg.userId) {
                sessionStorage.setItem("userId", userMsg.userId);
                window.location.href = `${BASE_URL}/${userMsg.userId}`;
                alert("登入成功");
            }

        } else {
            const createData = {
                ...data,
                user_form: {
                    available_time: {
                        Mon: ["17:00-22:00"],
                        Tue: ["17:00-22:00"],
                        Wed: ["17:00-22:00"],
                        Thu: ["17:00-22:00"],
                        Fri: ["17:00-22:00"],
                        Sat: ["09:00-22:00"],
                        Sun: ["09:00-22:00"]
                    },
                    best_focus_periods: ["15:00-18:00", "18:00-21:00"],
                    ideal_task_duration: "60-90min",
                    task_types: [
                        { name: "學習", focus_level: "中" },
                        { name: "工作", focus_level: "高" },
                        { name: "運動", focus_level: "低" }
                    ],
                    time_preferences: {
                        morning: "低",
                        afternoon: "中",
                        evening: "高",
                        night: "中"
                    }
                }
            };
            await postAccount(createData);
            const userMsg = await login(data);
            if (!userMsg || !userMsg.userId) {
                console.error("帳號建立成功，但登入失敗");
                return;
            }

            const initialMessages = [
                { role: 'system', content: `請你幫助使用者規劃日程表...` },
                { role: 'assistant', content: '請你吩咐我幫您安排您的任務規劃吧~~~' }
            ];

            const group = await postGroup({
                name: "AI助理聊天室",
                members: [userMsg.userId],
                chatHistory: initialMessages
            });

            // 確保群組建立成功
            if (!group || !group._id) {
                console.error("群組建立失敗");
                return;
            }

            // 更新使用者的群組列表
            await putOneAccount(userMsg.userId, { groups: [group._id] });

            // 建立完成後導向聊天室
            sessionStorage.setItem("userId", userMsg.userId);
            window.location.href = `${BASE_URL}/${userMsg.userId}`;
            alert("創建帳號成功並已登入");
        }
    } catch (err) {
        console.error("建立帳號流程錯誤:", err);
    }
});