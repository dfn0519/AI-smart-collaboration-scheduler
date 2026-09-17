import { postGroup, getAllGroup, getOneGroup, putOneGroup, deleteOneGroup, addGroupToUser, addUserToGroup, createGroup } from './groupApi.js';
import { getUserGroup, putOneAccount, getOneAccountObjectFromId, getOneAccountObjectFromName } from './accountApi.js';
import { initSocket, joinGroup, leaveGroup, broadcast } from './socket.js';

const createGroupInput = document.getElementById('create-group-name'); // 群組名稱輸入(創建)
const addGroupInput = document.getElementById('add-group-id') //群組id輸入(加入)
const tabContainer = document.getElementById('tab-container'); // 左側聊天室列表
const chatContainer = document.getElementById('chat-container'); // 聊天室主畫面
const homeWindow = document.getElementById('home-window'); // 大廳畫面
const messageInput = document.getElementById('message-input'); // 訊息輸入框
const messageWindow = document.getElementById('message-window'); // 聊天訊息容器
const sendButton = document.getElementById("send-button"); // 發送訊息按鈕
const logoutButton = document.getElementById("logout-button"); // 登出按鈕
const homeButton = document.getElementById("home-button"); // 回大廳按鈕

const userId = sessionStorage.getItem("userId");

let chatHistoryMap = {}; // 各群組的聊天紀錄
let currentGroupId = null; // 當前聊天室ID
let userGroups = []; //使用者所有的群組
const BASE_URL = typeof window === "undefined"
    ? "http://localhost:3000"   // Node.js 用
    : "";                       // Browser 用 (空字串代表相對路徑)


// === 輔助函式：新增群組 Tab 到 UI ===
function addGroupTabToUI(group) {
    const wrapper = document.createElement('div');
    wrapper.className = 'group-tab-wrapper';

    const groupTab = document.createElement('button');
    groupTab.className = 'tab-group';
    groupTab.innerHTML = group.name;
    groupTab.dataset.groupId = group._id;
    groupTab.addEventListener('click', () => switchChatRoom(groupTab));

    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-id-button';
    copyBtn.innerHTML = '複製ID';
    copyBtn.title = '點擊複製群組 ID';
    copyBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // 防止點擊複製時也觸發切換聊天室
        navigator.clipboard.writeText(group._id).then(() => {
            const originalText = copyBtn.innerHTML;
            copyBtn.innerHTML = '已複製!';
            copyBtn.classList.add('copied');
            setTimeout(() => {
                copyBtn.innerHTML = originalText;
                copyBtn.classList.remove('copied');
            }, 1000);
        });
    });

    wrapper.appendChild(groupTab);
    wrapper.appendChild(copyBtn);
    tabContainer.appendChild(wrapper);
}


// === 初始化 ===
window.addEventListener("DOMContentLoaded", async () => {

    initSocket();//建立socket連線
    userGroups = await getUserGroup(userId);

    userGroups.forEach(group => {
        chatHistoryMap[group._id] = group.chatHistory;
        addGroupTabToUI(group);
    });
});

// === 建立新群組 ===
document.getElementById("create-group-button").addEventListener("click", async () => {
    const groupName = createGroupInput.value.trim();
    if (!groupName) return;
    createGroupInput.value = '';

    const initialMessages = [
        { role: 'system', content: `請你幫助使用者規劃日程表...` }
    ];

    //新增新群組至後端
    const group = await postGroup({
        name: groupName,
        members: [userId],
        chatHistory: initialMessages
    });
    chatHistoryMap[group._id] = initialMessages;

    //新增user的群組id，然後更新user的data
    userGroups.push(group._id);
    await putOneAccount(userId, { groups: userGroups });

    //新增群組的tab (使用輔助函式)
    addGroupTabToUI(group);
    tabContainer.scrollTop = tabContainer.scrollHeight;
});

// === 加入群組 ===
document.getElementById("add-group-button").addEventListener("click", async () => {
    const groupId = addGroupInput.value.trim();
    if (!groupId) return;
    addGroupInput.value = '';

    // 本地快取先擋住重複加入
    if (userGroups.some(g => g._id === groupId)) {
        alert("你已經加入過這個群組！");
        return;
    }

    try {
        const group = await getOneGroup(groupId);
        if (!group || group.error) {
            alert("找不到此群組！");
            return;
        }

        const user = await getOneAccountObjectFromId(userId);

        // 更新群組 members（後端）
        if (!group.members.includes(userId)) {
            group.members.push(userId);
            await putOneGroup(groupId, { members: group.members });
        }

        // 更新使用者 groups（後端）
        if (!user.groups.includes(groupId)) {
            user.groups.push(groupId);
            await putOneAccount(userId, { groups: user.groups });
        }

        // 更新本地快取與 UI（前端）
        userGroups.push(groupId);
        chatHistoryMap[groupId] = group.chatHistory;

        addGroupTabToUI(group);
        tabContainer.scrollTop = tabContainer.scrollHeight;

    } catch (err) {
        console.error(err);
        alert("加入群組時發生錯誤，請稍後再試！");
    }
});

// === 切換聊天室 ===
function switchChatRoom(tab) {

    setActiveTab(tab);
    currentGroupId = tab.dataset.groupId;
    console.log("socket join", currentGroupId);
    joinGroup(currentGroupId);

    homeWindow.style.display = 'none';
    chatContainer.style.display = 'flex';
    messageWindow.innerHTML = '';

    //渲染群組每個訊息
    chatHistoryMap[currentGroupId].forEach(msg => {
        if (msg.role !== 'system')
            renderMessage(msg);
    });
}

// === 回大廳 ===
homeButton.addEventListener("click", () => {
    setActiveTab(homeButton);
    homeWindow.style.display = 'flex';
    chatContainer.style.display = 'none';
});

// === 顯示訊息泡泡 ===
function renderMessage(msg) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message-bubble';
    messageDiv.innerHTML = msg.content;

    if (msg.role === 'assistant') {
        messageDiv.classList.add('is-assistant');
    }

    const group = userGroups.find(g => g._id === currentGroupId);
    const sourceRoom = group ? group.name : '未知聊天室';

    const isTaskWarning = msg.content.trim() === "請輸入與排程相關的訊息，以便我協助你偵測任務需求和提供建議";
    const isStartTask = msg.content.trim() === "請你吩咐我幫您安排您的任務規劃吧~~~";

    if (msg.role === 'assistant' && sourceRoom === "AI助理聊天室" && !isTaskWarning && !isStartTask) {
        if (msg.haveTasked === false) {
            const addBtn = document.createElement('button');
            addBtn.innerHTML = "新增到任務列表";
            addBtn.classList.add("aichat-button");
            addBtn.onclick = () => {
                // 派送事件給任務系統
                const event = new CustomEvent("addTaskFromChat", { detail: msg.content });
                document.dispatchEvent(event);

                msg.haveTasked = true; // 標記已新增
                // 更新 chatHistoryMap
                chatHistoryMap[currentGroupId] = chatHistoryMap[currentGroupId].map(m =>
                    m._id === msg._id ? { ...m, haveTasked: true } : m
                );
                // 同步更新後端
                putOneGroup(currentGroupId, { chatHistory: chatHistoryMap[currentGroupId] });

                addBtn.remove();
                const done = document.createElement("div");
                done.innerHTML = " ✅ 已新增";
                messageDiv.appendChild(done);
                messageDiv.style.opacity = 0.5;
            };
            messageDiv.appendChild(addBtn);
        } else {
            messageDiv.innerHTML += " ✅ 已新增";
            messageDiv.style.opacity = 0.5;
        }
    } else if (msg.role === 'user' && msg.speaker === userId) {
        messageDiv.classList.add('is-own');
    } else {
        messageDiv.classList.add('is-assistant');
    }

    messageWindow.appendChild(messageDiv);
    messageWindow.scrollTop = messageWindow.scrollHeight;
}

// === 發送訊息 ===
sendButton.addEventListener("click", handleSendMessage);

async function handleSendMessage() {
    const content = messageInput.value.trim();
    if (!content) return;

    // 立即顯示使用者訊息
    renderMessage({ role: 'user', speaker: userId, content });
    chatHistoryMap[currentGroupId].push({ role: 'user', speaker: userId, content });

    messageInput.value = '';
    messageInput.focus();
    sendButton.disabled = true;

    // 廣播給同群組其他人
    broadcast(currentGroupId, { userId, content, role: "user" }, "me");

    // 先更新當前聊天室的歷史紀錄，不等 API
    await putOneGroup(currentGroupId, { chatHistory: chatHistoryMap[currentGroupId] });

    // 保留測試用的 group 與 demoMessages
    const group = userGroups.find(g => g._id === currentGroupId);
    const sourceRoom = group ? group.name : '未知聊天室';

    // API 呼叫改成背景執行，不阻塞訊息送出
    (async () => {
        try {
            const assistantGroup = userGroups.find(group => group.name === "AI助理聊天室");
            const assistantRoomId = assistantGroup ? assistantGroup._id : null;

            if (sourceRoom != "AI助理聊天室") {
                const actualUser = userId;
                const actualMessage = content;

                const step1History = chatHistoryMap[currentGroupId].slice(-4, -1);
                const step2History = chatHistoryMap[currentGroupId].slice(-11, -1);

                const res = await fetch(`${BASE_URL}/judge_step1`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        targetUser: actualUser,
                        inputMessage: actualMessage,
                        chatHistory: step1History
                    })
                });

                const data = await res.json();
                console.log("Step1 Python 回傳:", data.output);

                if (data.output === "YES") {
                    const res2 = await fetch(`${BASE_URL}/judge_step2`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            targetUser: actualUser,
                            inputMessage: actualMessage,
                            chatHistory: step2History
                        })
                    });

                    const data2 = await res2.json();
                    let step2Result = data2.output;

                    // 如果 Python 傳回來的是字串格式的 JSON，先轉換成物件
                    if (typeof step2Result === "string") {
                        try {
                            step2Result = JSON.parse(step2Result);
                        } catch (e) {
                            console.error("Step2 JSON Parse 失敗:", step2Result);
                            step2Result = {};
                        }
                    }

                    console.log("Step2 解析後:", step2Result);

                    // 轉小寫
                    const purposeLower = String(step2Result.purpose).toLowerCase().trim();

                    // 判斷聊天室存在和purpose是否null
                    if (assistantRoomId != null && chatHistoryMap[assistantRoomId] &&
                        step2Result.purpose && purposeLower !== "null") {

                        const { time, purpose } = step2Result;
                        const content = `目的：${purpose || "無"} 時間：${time || "無"}`;
                        console.log("傳給排程機器人的內容:", content, "使用者ID:", userId);
                        const res = await fetch(`${BASE_URL}/schedule_agent`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                content: content,
                                targetUser: userId
                            })
                        });
                        const data = await res.json();
                        console.log(data)
                        let output = data.output;

                        // 如果 output 是字串但長得像 JSON，嘗試再 parse 一次
                        if (typeof output === "string") {
                            try {
                                output = JSON.parse(output);
                            } catch (e) {
                                console.error("output is string but not JSON:", output);
                                output = [];
                            }
                        }
                        console.log("output:", output);
                        if (output.length > 0) {
                            let newMessage = "";
                            output.forEach(item => {
                                newMessage +=
                                    `任務偵測和建議:<br>` +
                                    `類別: ${item.title}<br>` +
                                    `內容: ${item.content}<br>` +
                                    `日期: ${item.date}<br>` +
                                    `時間: ${item.time}<br>` +
                                    `持續時間: ${item.duration}<br><br>`;
                            });

                            chatHistoryMap[assistantRoomId].push({ role: 'assistant', content: newMessage, haveTasked: false });
                            broadcast(assistantRoomId, { userId, content: newMessage, role: "assistant" }, "ai");
                            await putOneGroup(assistantRoomId, { chatHistory: chatHistoryMap[assistantRoomId] });
                            refreshCurrentChatRoom(currentGroupId);
                        }
                    }
                }
            } else {
                if (sourceRoom === "AI助理聊天室") {
                    const res = await fetch(`${BASE_URL}/schedule_agent`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            content: content,
                            targetUser: userId
                        })
                    });
                    const data = await res.json();
                    console.log(data)
                    let output = data.output;

                    if (typeof output === "string") {
                        try {
                            output = JSON.parse(output);
                        } catch (e) {
                            console.error("output is string but not JSON:", output);
                            output = [];
                        }
                    }
                    let newMessage = "";
                    if (output.length > 0) {
                        output.forEach(item => {
                            newMessage +=
                                `任務偵測和建議:<br>` +
                                `類別: ${item.title}<br>` +
                                `內容: ${item.content}<br>` +
                                `日期: ${item.date}<br>` +
                                `時間: ${item.time}<br>` +
                                `持續時間: ${item.duration}<br><br>`;
                        });

                        chatHistoryMap[assistantRoomId].push({ role: 'assistant', content: newMessage, haveTasked: false });
                        broadcast(assistantRoomId, { userId, content: newMessage, role: "assistant" }, "ai");
                        await putOneGroup(assistantRoomId, { chatHistory: chatHistoryMap[assistantRoomId] });
                        refreshCurrentChatRoom(currentGroupId);
                    } else {
                        const noTaskMessage = "請輸入與排程相關的訊息，以便我協助你偵測任務需求和提供建議";
                        chatHistoryMap[assistantRoomId].push({ role: 'assistant', content: noTaskMessage, haveTasked: false });
                        broadcast(assistantRoomId, { userId, content: noTaskMessage, role: "assistant" }, "ai");
                        await putOneGroup(assistantRoomId, { chatHistory: chatHistoryMap[assistantRoomId] });
                        refreshCurrentChatRoom(currentGroupId);
                    }
                }
            }
        } catch (err) {
            console.error("API Error:", err);
        }
    })();
    sendButton.disabled = false;
}

//其他socket接受到訊息
window.addEventListener("socket-receive-message", e => {
    const data = e.detail;
    chatHistoryMap[data.groupId].push({ role: data.role, speaker: data.speaker, content: data.content });
    if (data.groupId !== currentGroupId) return;
    renderMessage({ role: data.role, speaker: data.speaker, content: data.content });
});


// === 切換選單顏色 ===
function setActiveTab(activeTab) {
    const allTabs = document.querySelectorAll(".tab-group, .tab-home");
    allTabs.forEach(tab => tab.classList.remove("active"));
    activeTab.classList.add("active");
}

// === 登出 ===
logoutButton.addEventListener("click", handleLogout);

function handleLogout() {
    sessionStorage.clear();
    window.location.href = "/";
}

// 重新渲染當前聊天室
function refreshCurrentChatRoom() {
    if (!currentGroupId || !chatHistoryMap[currentGroupId]) {
        return;
    }

    // 先清空目前畫面，避免重複附加
    messageWindow.innerHTML = '';

    chatHistoryMap[currentGroupId].forEach(msg => {
        if (msg.role !== 'system') {
            renderMessage(msg);
        }
    });
}
