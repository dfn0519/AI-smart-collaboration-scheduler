/*************************************************
*  帳號API :
    *新增帳號 postAccount(data)
    *登入帳號 login(data)
    *取得帳號的所有群組 getUserGroup(userId)
    *更新單一帳號內容 putOneAccount(userId, data)
    *從名稱取得帳號物件 getOneAccountObjectFromName(userName)
    *用id取得一個帳號物件 getOneAccountObjectFromId(userId)
    *將創建的task加進帳號物件 addTaskToUser(task, account)
*************************************************/
const BASE_URL = typeof window === "undefined" 
  ? "http://localhost:3000"   // Node.js 用
  : "";                       // Browser 用 (空字串代表相對路徑)

//新增帳號
export async function postAccount(data){
    try{
        const res = await fetch(`${BASE_URL}/api/accounts`, {
            method : "POST",
            headers : {
                "Content-Type" : "application/json" //告訴後端我們送去的是json
            },
            body : JSON.stringify(data) //data是要送的物件
        });

        if(!res.ok){
            const errorMsg = await res.json();
            console.log("創建帳號失敗: ", errorMsg);
            return null;
        }

        const respondData = await res.json();
        if(!respondData){
            console.log("創建帳號失敗");
            return null;
        }
        console.log("新增成功: ", respondData);
        
        return respondData;
    }
    catch(error){
        console.log("發生錯誤: ", error.message);
        return null;
    }
}

//帳號登入
export async function login(data){
    try{
        const res = await fetch(`${BASE_URL}/api/accounts/login`, {
            method : "POST",
            headers : {
                "Content-Type" : "application/json" //告訴後端我們送去的是json
            },
            body : JSON.stringify(data) //data是要送的物件
        });
        
        const userMsg = await res.json();
        
        if(res.status === 200){
            console.log("登入成功,用戶ID為: ", userMsg.userId);
        }
        else if(res.status === 401){
            console.log("密碼錯誤,", userMsg);
        }
        else if(res.status === 404){
            console.log("找不到帳號,", userMsg);
        }

        return userMsg;
    }
    catch(error){
        console.log("發生錯誤: ", error.message);
        return null;
    }
}

//取得帳號的所有群組
export async function getUserGroup(userId) {
    try {
        const res = await fetch(`${BASE_URL}/api/accounts/${userId}/groups`, {
            method : "GET",
            headers : {
                "Content-Type" : "application/json" //告訴後端我們送去的是json
            },
        });

        if (!res.ok) {
            throw new Error("無法獲取群組");
        }
        const groups = await res.json();
        if(!groups){
            console.log("無法獲取群組");
            return null;
        }
        console.log("使用者的群組：", groups);
        return groups;
    } 
    catch (err) {
        console.error("錯誤：", err.message);
        return [];
    }
}

//更新單一帳號內容
export async function putOneAccount(userId, data){
    try{
        const res = await fetch(`${BASE_URL}/api/accounts/${userId}`, {
            method : "PUT",
            headers : {
                "Content-Type" : "application/json" //告訴後端我們送去的是json
            },
            body : JSON.stringify(data) //data是要送的物件
        });

        if(!res.ok){
            const errorMsg = await res.json();
            console.log("更新帳號失敗: ", errorMsg);
            return null;
        }

        const updatedAccount = await res.json();
        
        if(!updatedAccount){
            console.log("更新帳號失敗");
            return null;
        }
        console.log("修改成功: ",updatedAccount);
        
        return updatedAccount;
    }
    catch(error){
        console.log("發生錯誤: ", error.message);
        return null;
    }
}

//用userName得到account物件並回傳
export async function getOneAccountObjectFromName(userName){
    try{
        const res = await fetch(`${BASE_URL}/api/accounts/name/${userName}`,{
            method : "GET"
        });

        if(!res.ok){
            console.log("該名稱未有帳號");
            return null;
        }

        const account = await res.json();

        if(!account){
            console.log("該名稱未有帳號");
            return null;
        }

        return account;
    }
    catch(error){
        console.log("發生錯誤: ", error.message);
        return null;
    }
}

//用ID得到account物件並回傳
export async function getOneAccountObjectFromId(userId){
    try{
        const res = await fetch(`${BASE_URL}/api/accounts/id/${userId}`,{
            method : "GET"
        });

        if(!res.ok){
            console.log("該id未有帳號");
            return null;
        }

        const account = await res.json();

       if(!account){
            console.log("該id未有帳號");
            return null;
        }

        return account;
    }
    catch(error){
        console.log("發生錯誤: ", error.message);
        return null;
    }
}

//新增任務id到帳號,在post task後使用
export async function addTaskToUser(task, account){
    try{
        if(account.tasks.includes(task._id)){
            console.log("任務已存在");
            return null;
        }
        account.tasks.push(task._id);
        const newAccount = await putOneAccount(account._id, account);
        if(!newAccount){
            console.log("更新失敗");
            return null;
        }
        console.log("更新成功");
        return newAccount;
    }
    catch(error){
        console.log("發生錯誤: ", error.message);
        return null;
    }
}