/*************************************************
*  群組API :
    *取得所有群組 getAllGroup()
    *新增群組 postGroup(data)
    *更新聊天室內容 putOneGroup(id, data)
    *取得一個群組的資料庫內容 getOneGroup(id)
    *創建一個群組 createGroup(groupData, account)
*************************************************/

const BASE_URL = typeof window === "undefined" 
  ? "http://localhost:3000"   // Node.js 用
  : "";                       // Browser 用 (空字串代表相對路徑)


import {putOneAccount} from './accountApi.js';

//取得所有群組
export async function getAllGroup(){
    try{
        const res = await fetch("/api/groups", {
            method : "GET",
        });
        if(!res.ok){
            console.log("群組不存在");
            return null;
        }
        const groups = await res.json();
        if(!groups){
            console.log("群組不存在");
            return null;
        }
        console.log("全部群組: ", groups);
        return groups;
    }
    catch(err){
        console.log("發生錯誤: ", err.message);
        return null;
    }
}

//新增群組
export async function postGroup(data){
    try{
        const res = await fetch("/api/groups", {
            method : "POST",
            headers : {
                "Content-Type" : "application/json" //告訴後端我們送去的是json
            },
            body : JSON.stringify(data) //data是要送的物件
        });
        if(!res.ok){
            console.log("新增群組失敗");
            return null;
        }
        const group = await res.json();
        if(!group){
            console.log("新增群組失敗");
            return null;
        }
        console.log("新增成功: ",group);
        return group;
    }
    catch(err){
        console.log("發生錯誤: ", err.message);
        return null;
    }
}

//更新聊天室內容
export async function putOneGroup(id, data){
    try{
        const res = await fetch(`/api/groups/${id}`, {
            method : "PUT",
            headers : {
                "Content-Type" : "application/json" //告訴後端我們送去的是json
            },
            body : JSON.stringify(data) //data是要送的物件
        });
        if(!res.ok){
            console.log("更新群組失敗");
            return null;
        }
        const updatedGroup = await res.json();
        if(!updatedGroup){
            console.log("更新群組失敗");
            return null;
        }
        console.log("修改成功: ",updatedGroup);
        return updatedGroup;
    }
    catch(err){
        console.log("發生錯誤: ", err.message);
        return null;
    }
}

/*取得一個群組的資料庫內容*/
export async function getOneGroup(id){
    try{
        console.log("準備發送 fetch 群組 ID:", id); // 🔹加這行

        const res = await fetch(`/api/groups/${id}`,{
            method : "GET"
        });

        console.log("取得群組前端回應:", res.status); // 🔹加這行

        const group = await res.json();
        console.log("取得群組 JSON:", group); // 🔹加這行

        return group; // 🔹一定要有這行
    }
    catch(err){
        console.log("發生錯誤: ", err.message);
        return null;
    }
}


/*尚未使用 */
export async function deleteOneGroup(id){
    try{
        const res = await fetch(`/api/groups/${id}`, {
            method : "DELETE"
        });
        if(!res.ok){
            console.log("刪除群組失敗");
            return null;
        }
        const deleteGroup = await res.json();
        if(!deleteGroup){
            console.log("刪除群組失敗");
            return null;
        }
        console.log(deleteGroup);
        return deleteGroup;
    }
    catch(err){
        console.log("發生錯誤: ", err.message);
        return null;
    }
}

export async function addGroupToUser(group, account){
    try{
        if(account.groups.includes(group._id)){
            console.log("have already added.");
            console.log(account.groups);
            return;
        }
        account.groups.push(group._id);
        const newAccount = await putOneAccount(account._id, account);
        if(!newAccount){
            console.log("addGroupToUser失敗");
            return null;
        }
        console.log("add successful: ", newAccount);
    }
    catch(error){
        console.log("發生錯誤: ", error.message);
        return null;
    }
}

//創建一個群組 return group物件
export async function createGroup(groupData, account){
    try{
        const group = await postGroup(groupData);
        
        if(!group){
            return null;
        }

        addGroupToUser(group, account);
        addUserToGroup(group, account);
        return group;
    }
    catch(error){
        console.log("發生錯誤: ", error.message);
        return null;
    }
}

export async function addUserToGroup(group, account){
    try{
        if(group.members.includes(account._id)){
            console.log("have already added.");
            console.log(group.members);
            return;
        }
        group.members.push(account._id);
        const newGroup = await putOneGroup(group._id, group);
        if(!newGroup){
            console.log("addUserGroup失敗");
            return null;
        }
        console.log("add successful: ", newGroup);
    }
    catch(error){
        console.log("發生錯誤: ", error.message);
        return null;
    }
}