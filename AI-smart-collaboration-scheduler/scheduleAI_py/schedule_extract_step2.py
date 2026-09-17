import sys
import os
import json
import datetime
from zoneinfo import ZoneInfo
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate

# 編碼設定
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

# 載入環境變數
load_dotenv()
openai_api_key = os.getenv("OPENAI_API_KEY")

# 初始化 LLM
llm = ChatOpenAI(model="gpt-4o-mini", temperature=0, api_key=openai_api_key)

# Prompt：抽取結構化行程
extract_prompt = ChatPromptTemplate.from_template(
    """你是一個行程抽取助手，下面是某聊天室中的對話紀錄。請以『目標行程資訊（最新發言）』為中心，去訊息中尋找符合的行程資訊：
- 時間
- 目的

【重要指示：克服歷史記憶干擾】
1. 對話紀錄越靠近底部越新。請優先採信「最新的討論與決議」。
2. 聊天室可能包含了「好幾個不同的行程」。請判斷「目標行程資訊」是在回應哪一個事件，並「完全忽略」其他無關的舊行程（即使它們有明確的時間地點）。
3. 若舊的行程已經討論完畢，請勿將舊時間影響到新的行程目的上。


目標人物 : {target_user}
目標行程資訊 : {target_msg}
聊天室訊息: {messages}

目前的現實時間為：{current_date}

【時間擷取絕對規則】(請嚴格遵守)
1. 遇到「星期X、禮拜X、週X」=> 【直接輸出原文，絕對不要轉換成 YYYY-MM-DD】。
   範例：「週五下午四點半」 -> "週五下午四點半"
2. 遇到「這禮拜、下禮拜、這週末、下週末」=> 【直接輸出原文，絕對不要轉換】。
   範例：「下週末吃飯」 -> "下週末"
3. 只有當對話明確說出「X號、X月X日、X/X」時，才需要結合當前現實時間輸出 YYYY-MM-DD。
   範例：「15號晚上」 -> "YYYY-MM-15 晚上"
   範例：「12/15」 -> "YYYY-12-15"

【輸出要求】(這部分非常重要，寧願沒抓到也不要抓錯)
請只輸出純 JSON 格式，例如(請直接截取與目標行程資訊相關的時間或目的，若無明確指出請保持null)：
預設:{{"time": "null", "purpose": "null"}}
若有偵測到時間或目的，請輸出:{{"time": "...", "purpose": "..."}}"""
)

def clean_json_output(content: str) -> dict:
    content = content.strip()
    content = content.replace("```json", "").replace("```", "").replace("json\n", "").strip()
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        return {"time": None, "purpose": None}

if __name__ == "__main__":
    # 從命令列接收參數
    if len(sys.argv) < 4:
        print(json.dumps({"time": None, "purpose": None}))
        sys.exit(1)

    target_user = sys.argv[1]
    input_message = sys.argv[2]
    messages_str = sys.argv[3]  # 這是 JSON 陣列
    
    try:
        chat_history = json.loads(messages_str)
    except Exception:
        chat_history = []
        
    # messages 包含往回第 2 ~ 10 句 (共 9 則)
    formatted_history = []
    recent_chat_history = chat_history[-9:] if len(chat_history) > 9 else chat_history
    
    for msg in recent_chat_history:
        speaker = msg.get("speaker", msg.get("role", "unknown"))
        content = msg.get("content", "")
        formatted_history.append(f"{speaker}: {content}")
        
    combined_messages = "\n".join(formatted_history) if formatted_history else "（無歷史紀錄）"

    # 取得台灣時間 (Asia/Taipei)
    taipei_time = datetime.datetime.now(ZoneInfo("Asia/Taipei"))
    
    # 將英文星期轉為中文
    weekday_mapping = {
        "Monday": "星期一", "Tuesday": "星期二", "Wednesday": "星期三",
        "Thursday": "星期四", "Friday": "星期五", "Saturday": "星期六", "Sunday": "星期日"
    }
    weekday_en = taipei_time.strftime("%A")
    weekday_zh = weekday_mapping.get(weekday_en, weekday_en)
    
    current_date_str = f"{taipei_time.strftime('%Y-%m-%d')} {weekday_zh}"

    structured = (extract_prompt | llm).invoke({
        "target_msg": input_message,
        "messages": combined_messages,
        "target_user": target_user,
        "current_date": current_date_str
    })

    data = clean_json_output(structured.content)
    print(json.dumps(data, ensure_ascii=False))