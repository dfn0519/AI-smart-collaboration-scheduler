require('dotenv').config();
const path = require('path');
const cors = require('cors');
const express = require('express');
const mongoose = require("mongoose");
const GroupProduct = require("./models/product.group.js");
const AccountProduct = require("./models/product.account.js");
const TaskProdct = require("./models/product.task.js");
const { spawn } = require("child_process");
const PYTHON = process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

//socket
const http = require("http");
const { Server } = require("socket.io");
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
    }
})

//某個檔案要發送connection給此io
io.on("connection", (socket) => {
    console.log("使用者連線:", socket.id);

    socket.on("join-group", (groupId) => {
        socket.join(groupId);
        console.log("使用者socket加入群組", groupId, "");
    });

    socket.on("leave-group", (groupId) => {
        socket.leave(groupId);
        console.log("使用者socket離開群組", groupId, "\n");
    });
    socket.on("send-message", async (data) => {
        console.log("收到訊息:", data, "\n");
        socket.to(data.groupId).emit("receive-message", data);//發送訊息
    });
});
/*************************************************
* 頁面路由
*************************************************/
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/:userId", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "group.html"));
});

/*************************************************
*   使用AI api:

*************************************************/
//schedule_agent，判斷使用者訊息和監聽內容需要的工具
app.post("/schedule_agent", async (req, res) => {
    const { content, targetUser } = req.body;
    let userFormStr = "{}";
    let historyDataStr = "[]";
    let existingDataStr = "[]";

    function getWeekdayCN(dateStr) {
        const dayMap = ["日", "一", "二", "三", "四", "五", "六"];
        const d = new Date(dateStr + "T00:00:00");
        return dayMap[d.getDay()];
    }

    try {
        if (targetUser) {
            const account = await AccountProduct.findOne({ _id: targetUser });
            if (account && account.user_form) {
                userFormStr = JSON.stringify(account.user_form);
            }

            const tasksHistory = await TaskProdct.find({
                owner: targetUser,
                finishedCompletionStatus: { $in: ["完成", "非準時完成"] } //歷史紀錄取有記錄成功完成工作的
            })
                .sort({ date: 1, time: 1 })
                .lean();

            const tasksExisting = await TaskProdct.find({
                owner: targetUser,
                finished: false //歷史紀錄取有記錄成功完成工作的
            })
                .sort({ date: 1, time: 1 })
                .lean();

            const historyData = tasksHistory.map(task => [
                task.date,
                task.time,
                `${task.duration}min`,
                task.title,
                getWeekdayCN(task.date)
            ]);
            historyDataStr = JSON.stringify(historyData);

            const existingData = tasksExisting.map(task => [
                task.date,
                task.time,
                `${task.duration}min`,
                task.title,
                getWeekdayCN(task.date)
            ]);
            existingDataStr = JSON.stringify(existingData);
        }
    } catch (err) {
        console.error("Error fetching user form/history data:", err);
    }
    const py = spawn(PYTHON, [
        "scheduleAI_py/schedule_agent.py",
        content,
        userFormStr,
        historyDataStr,
        existingDataStr, //未完成在型事曆上的任務
        String(targetUser || "")
    ]);

    let result = "";
    py.stdout.on("data", (data) => {
        result += data.toString();
    });

    py.stderr.on("data", (data) => {
        console.error("Python 錯誤:", data.toString());
    });

    py.on("close", (code) => {
        try {
            const parsed = JSON.parse(result.trim());
            res.json({ output: parsed, code });
        } catch (err) {
            res.json({ output: { raw: result.trim() }, code });
        }
    });
});

//第一層判斷是否為任務訊息
app.post("/judge_step1", (req, res) => {
    const { targetUser, inputMessage, chatHistory } = req.body;

    const py = spawn(PYTHON, ["scheduleAI_py/schedule_extract_step1.py", targetUser, inputMessage, JSON.stringify(chatHistory)]);

    let result = "";
    py.stdout.on("data", (data) => {
        result += data.toString();
    });

    py.stderr.on("data", (data) => {
        console.error("Python 錯誤:", data.toString());
    });

    py.on("close", (code) => {
        res.json({ output: result.trim(), code });
    });
});

//第二層判斷任務細節
app.post("/judge_step2", (req, res) => {
    const { targetUser, inputMessage, chatHistory } = req.body;

    const py = spawn(PYTHON, ["scheduleAI_py/schedule_extract_step2.py", targetUser, inputMessage, JSON.stringify(chatHistory)]);
    py.stdout.setEncoding("utf8");
    py.stderr.setEncoding("utf8");

    let result = "";
    py.stdout.on("data", (data) => {
        result += data.toString();
    });

    py.stderr.on("data", (data) => {
        console.error("Python 錯誤:", data.toString());
    });

    py.on("close", (code) => {
        if (!result.trim()) {
            return res.json({ output: { time: null, purpose: null }, code });
        }
        try {
            const parsed = JSON.parse(result.trim());
            res.json({ output: parsed, code });
        } catch (err) {
            res.json({ output: { raw: result.trim() }, code });
        }
    });
});

//AI助理聊天室任務資訊分析，呼叫py處理
app.post("/analyze_task", (req, res) => {
    const { msg, categories, today, weekday } = req.body;
    const py = spawn(PYTHON, ["scheduleAI_py/analyze_task.py", JSON.stringify(msg), JSON.stringify(categories), today, weekday]);

    let result = "";
    py.stdout.on("data", (data) => {
        result += data.toString();
    });

    py.stderr.on("data", (data) => {
        console.error("Python 錯誤:", data.toString());
    });

    py.on("close", () => {
        try {
            const lines = result.trim().split("\n");
            const jsonLine = lines[lines.length - 1]; // 只吃最後一行
            const parsed = JSON.parse(jsonLine);
            res.json(parsed);
        } catch (err) {
            res.status(500).json({
                error: "Python 回傳格式錯誤",
                raw: result
            });
        }
    });
});

//傳入rag新增到資料庫
app.post("/rag_memory", (req, res) => {
    const { owner, ...rest } = req.body;
    const payload = JSON.stringify(rest || {});
    console.log(owner, "hello")
    const py = spawn(PYTHON, ["scheduleAI_py/rag_memory.py", payload, String(owner || "")]);

    py.stderr.on("data", (d) => console.error("[rag_memory]", d.toString()));
    py.on("error", (e) => console.error("[rag_memory] spawn錯誤:", e.message));
    py.on("close", (code) => {
        if (code !== 0) console.error("[rag_memory] exit code:", code);
    });

    return res.status(202).json({ ok: true });
});

/*************************************************
*  群組API :
    *取得所有群組
    *新增群組
    *更新聊天室內容
    *取得一個群組的資料庫內容
*************************************************/

// 取得所有群組
app.get("/api/groups", async (req, res) => {
    try {
        const groups = await GroupProduct.find({});
        res.status(200).json(groups);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
})

// 新增群組
app.post("/api/groups", async (req, res) => {
    try {
        const product = await GroupProduct.create(req.body);
        if (!product) {
            console.log("新增群組失敗");
            return res.status(500).json({ message: "新增群組失敗" });
        }
        console.log("新增群組到資料庫");
        res.status(200).json(product);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
})

// 更新聊天室內容
app.put("/api/groups/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const group = await GroupProduct.findByIdAndUpdate(id, req.body);
        if (!group) {
            return res.status(404).json({ message: "群組不存在" });
        }
        const updatedGroup = await GroupProduct.findById(id);
        if (!updatedGroup) {
            return res.status(404).json({ message: "更新後的群組不存在" });
        }
        res.status(200).json(updatedGroup);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// 取得一個群組的資料庫內容
app.get("/api/groups/:id", async (req, res) => {
    try {
        const { id } = req.params; //從req中取得id
        const group = await GroupProduct.findById(id);
        if (!group) {
            return res.status(404).json({ message: "群組不存在" });
        }
        res.status(200).json(group);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});

/*************************************************
*  帳號API :
    *新增帳號
    *登入帳號
    *取得帳號的所有群組
    *更新單一帳號內容
    *從名稱取得帳號物件
    *用account id取得一個帳號物件
*************************************************/
//新增帳號
app.post("/api/accounts", async (req, res) => {
    try {
        const account = await AccountProduct.create(req.body);
        if (!account) {
            console.log("新增帳號失敗");
            return res.status(500).json({ message: "新增帳號失敗" });
        }
        console.log("帳號已新增到資料庫");
        res.status(200).json(account);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
})

//帳號登入
app.post("/api/accounts/login", async (req, res) => {
    try {
        const { userName, password } = req.body;

        const account = await AccountProduct.findOne({ userName: userName });
        if (!account) {
            return res.status(404).json({ message: "account not found" });
        }
        if (account.password !== password) {
            return res.status(401).json({ message: "the password is not correct" });
        }
        res.status(200).json({ message: "登入成功", userId: account._id });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
})


//取得帳號的所有群組
app.get("/api/accounts/:userId/groups", async (req, res) => {
    try {
        const userId = req.params.userId;

        const account = await AccountProduct.findById(userId);
        if (!account) {
            return res.status(404).json({ error: "User not found" });
        }

        const groups = await GroupProduct.find({ _id: { $in: account.groups } });
        res.json(groups); // 把群組列表回傳
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});

//更新單一帳號內容
app.put("/api/accounts/:userId", async (req, res) => {
    try {
        const { userId } = req.params;
        const account = await AccountProduct.findByIdAndUpdate(userId, req.body, { new: true });

        if (!account) {
            return res.status(404).json({ message: "帳號不存在" });
        }

        const updatedAccount = await AccountProduct.findById(userId);
        res.status(200).json(updatedAccount);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
})

//從名稱取得帳號物件
app.get("/api/accounts/name/:userName", async (req, res) => {
    try {
        const { userName } = req.params;
        const account = await AccountProduct.findOne({ userName: userName });

        if (!account) {
            return res.status(404).json({ message: "該帳號不存在" });
        }

        res.status(200).json(account);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
})

//用account id取得一個帳號物件
app.get("/api/accounts/id/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const account = await AccountProduct.findById(id);

        if (!account) {
            return res.status(404).json({ message: "該帳號不存在" });
        }

        res.status(200).json(account);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
})

/*************************************************
*  任務API :
    *新增任務
    *修改任務
    *查詢任務
    *刪減任務
*************************************************/

//新增任務
app.post("/api/tasks", async (req, res) => {
    try {
        const task = await TaskProdct.create(req.body);
        if (!task) {
            console.log("新增任務失敗");
            return res.status(500).json({ message: "新增任務失敗" });
        }
        console.log("新增任務到資料庫");
        res.status(200).json(task);
    }
    catch (error) {
        console.log(error);
        res.status(500).json({ message: error });
    }
})

//修改任務
app.put("/api/tasks/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const task = await TaskProdct.findByIdAndUpdate(id, req.body);
        if (!task) {
            return res.status(404).json({ message: "任務不存在" });
        }
        const updatedTask = await TaskProdct.findById(id);
        if (!updatedTask) {
            return res.status(404).json({ message: "更新後的任務不存在" });
        }
        res.status(200).json(updatedTask);

    }
    catch (error) {
        console.log(error);
        res.status(500).json({ message: error });
    }
})

//登入時將所有屬於account的任務找出來
///api/tasks?owner=USER_ID
app.get("/api/tasks", async (req, res) => {
    try {
        const { owner } = req.query;
        if (!owner) {
            return res.status(400).json({ error: "owner is required" });
        }

        const tasks = await TaskProdct.find({ owner }).lean();
        res.json(tasks);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

//查詢任務
app.get("/api/tasks/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const task = await TaskProdct.findById(id);
        if (!task) {
            return res.status(404).json({ message: "任務不存在" });
        }
        res.status(200).json({ task });
    }
    catch (error) {
        res.status(500).json({ message: error });
    }
});

//刪減任務
app.delete("/api/tasks/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const task = await TaskProdct.findByIdAndDelete(id);
        if (!task) {
            return res.status(404).json({ message: "任務不存在" });
        }
        console.log("成功刪除任務");
        res.status(200).json({ message: "成功刪除", task });
    }
    catch (error) {
        res.status(500).json({ message: error });
    }
});

// 啟動伺服器
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error("缺少 MONGODB_URI，請先建立 .env 設定檔");
    process.exit(1);
}

mongoose.connect(MONGODB_URI)
.then(() => {
    console.log("connected to database"); 
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`server is running on ${PORT}`); 
    })
    /*
    app.listen(PORT, () => {
        console.log("serve is running on 3000"); 
    })
    */
})
.catch((err) => {
    console.log(err.message)
})
