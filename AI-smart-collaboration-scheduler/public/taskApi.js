/*************************************************
*  任務API :
    *從taskId找尋物件 getOneTask(taskId)
    *從account取得所有該帳號的任務 getUserTasks(userId)
    *新增任務到資料庫 postTask(data)
    *修改一個任務 putOneTask(taskId, data)
    *刪除一個任務 deleteOneTask(taskId)
*************************************************/

const BASE_URL = typeof window === "undefined"
    ? "http://localhost:3000"   // Node.js 用
    : "";                       // Browser 用 (空字串代表相對路徑)

//從id取得任務
export async function getOneTask(taskId) {
    try {
        const res = await fetch(`${BASE_URL}/api/tasks/${taskId}`, {
            method: "GET",
        });
        if (!res.ok) {
            console.log("單一任務不存在");
            return null;
        }
        const task = await res.json();
        if (!task) {
            console.log("單一任務不存在");
            return null;
        }
        console.log("單一任務存在: ", task);
        return task;
    }
    catch (error) {
        console.log("發生錯誤: ", error.message);
        return null;
    }
}

//從account取得所有該帳號的任務
export async function getUserTasks(userId) {
    try {
        const res = await fetch(`/api/tasks?owner=${userId}`);
        if (!res.ok) return null;
        return await res.json();
    } catch (err) {
        console.error(err);
        return null;
    }
}

//新增任務到資料庫
export async function postTask(data) {
    try {
        const res = await fetch(`${BASE_URL}/api/tasks`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(data)
        });
        if (!res.ok) {
            console.log("res is not ok");
            return null;
        }
        const task = await res.json();
        if (!task) {
            console.log("新增任務失敗");
            return null;
        }
        console.log("新增成功: ", task);
        return task;
    }
    catch (error) {
        console.log("發生錯誤: ", error.message);
        return null;
    }
}

//修改一個任務
export async function putOneTask(taskId, data) {
    try {
        const res = await fetch(`${BASE_URL}/api/tasks/${taskId}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(data)
        });
        if (!res.ok) {
            console.log("修改任務失敗");
            return null;
        }
        const updatedTask = await res.json();
        if (!updatedTask) {
            console.log("修改任務失敗");
            return null;
        }
        console.log("修改任務成功: ", updatedTask);
        return updatedTask;
    }
    catch (error) {
        console.log("發生錯誤: ", error.message);
        return null;
    }
}

//刪除一個任務
export async function deleteOneTask(taskId) {
    try {
        const res = await fetch(`${BASE_URL}/api/tasks/${taskId}`, {
            method: "DELETE"
        });
        if (!res.ok) {
            console.log("任務刪除失敗");
            return null;
        }
        const deleteTask = await res.json();
        if (!deleteTask) {
            console.log("任務刪除失敗");
            return null;
        }
        console.log(deleteTask);
        return deleteTask;
    }
    catch (error) {
        console.log("發生錯誤: ", error.message);
        return null;
    }
}