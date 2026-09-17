let socket = null;
const BASE_URL = typeof window === "undefined" 
  ? "http://localhost:3000"   // Node.js 用
  : "";                       // Browser 用 (空字串代表相對路徑)

export function initSocket(){
    if(!socket){
        socket = io(BASE_URL);

        //前端連上socket時觸發
        socket.on("connect", () => {
            console.log("socket前端已連線", socket.id);
        });

        //當收到server廣播訊息時觸發window事件給其他模組
        socket.on("receive-message", data => {
            const event = new CustomEvent("socket-receive-message", { detail: data});
            window.dispatchEvent(event);
        });
    }
    return socket;
}

export function joinGroup(groupId){
    if(!socket) initSocket();
    if(!groupId) return;
    socket.emit("join-group", groupId);
}

export function leaveGroup(groupId){
    if(!socket) initSocket();
    if(!groupId) return;
    socket.emit("leave-group", groupId);
}

export function broadcast(groupId, messageData, sender){
    console.log("broadcast\n");
    if(!socket || !groupId || !messageData) return;
    socket.emit("send-message", {groupId, ...messageData, sender}); //messageData = {userId, content} ...messageData將她展開
}
