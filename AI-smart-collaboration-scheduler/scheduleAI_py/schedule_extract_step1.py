from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
import os
import json
from dotenv import load_dotenv
import sys
from rag_memory import MemoryStore # 加入 RAG 存取

# 載入環境變數
load_dotenv()
openai_api_key = os.getenv("OPENAI_API_KEY")

# 初始化 LLM
llm = ChatOpenAI(model="gpt-4o-mini", temperature=0, api_key=openai_api_key)

# 初始化 RAG 存儲 (範例存放在 schedule_rag_examples.json)
rag_path = os.path.join(os.path.dirname(__file__), "schedule_rag_examples.json")
store = MemoryStore(path=rag_path)

# Prompt：判斷是否有行程安排傾向 (增加了 RAG 輔助資訊與歷史對話)
judge_prompt = ChatPromptTemplate.from_template(
    """你是第一層訊息判斷助手。下面為聊天室中的對話紀錄與當前訊息。
請結合歷史對話紀錄，判斷以下「當前訊息」是否與目標人物行程安排相關，或是回覆前面訊息的行程安排。
你的接手者會在你回答YES的情況下去詳細審查訊息內容，所以你可以不用太嚴謹地判斷行程安排的細節，只要有可能包含行程安排的傾向就回答YES。

目標人物: {target_user}

歷史對話紀錄:
{history_text}

以下是一些相似的訊息判斷參考 (RAG)：
{rag_context}

請參考上述例子與歷史紀錄，對「當前訊息」判斷 YES 或 NO。
請只回傳 "YES" 或 "NO"。

當前訊息: {message}"""
)

def judge_message(message: str, target_user: str, history_text: str):
    # 1. 從 RAG 中尋找相似訊息
    hits = store.query(query_text=message, top_k=20)
    
    # 2. 構建 RAG 上下文
    if hits:
        rag_context = "\n".join([f"- 訊息: {it.text} -> 判斷: {it.meta.get('label', '未知')}" for score, it in hits])
    else:
        rag_context = "（目前無相似範例，請根據內建知識判斷）"

    # 3. 呼叫 LLM
    result = (judge_prompt | llm).invoke({
        "message": message, 
        "target_user": target_user,
        "rag_context": rag_context,
        "history_text": history_text
    })
    return result.content.strip()

if __name__ == "__main__":
    # 從命令列接收參數
    if len(sys.argv) < 3:
        print("用法: python schedule_extract_step1.py <target_user> <message> [chat_history_json]")
        sys.exit(1)

    target_user = sys.argv[1]
    message = sys.argv[2]
    
    chat_history_str = "[]"
    if len(sys.argv) > 3:
        chat_history_str = sys.argv[3]
        
    try:
        chat_history = json.loads(chat_history_str)
    except Exception as e:
        chat_history = []
        
    formatted_history = []
    for msg in chat_history:
        speaker = msg.get("speaker", msg.get("role", "unknown"))
        content = msg.get("content", "")
        formatted_history.append(f"{speaker}: {content}")
        
    history_text = "\n".join(formatted_history) if formatted_history else "（無歷史紀錄）"

    output = judge_message(message, target_user, history_text)
    print(output)