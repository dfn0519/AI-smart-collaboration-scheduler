from openai import OpenAI
from dotenv import load_dotenv
import os, sys, json, subprocess
from datetime import datetime
from pathlib import Path
from scheduleAI import scheduleAI
from analyze_task import analyze_task
from rag_memory import MemoryStore

# 編碼設定
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

load_dotenv()
api_key = os.getenv("OPENAI_API_KEY")

client = OpenAI(api_key=api_key)

# 取得台灣時間與星期中文
from zoneinfo import ZoneInfo
today = datetime.now(ZoneInfo("Asia/Taipei"))
today_str = today.strftime('%Y-%m-%d')
    
weekday_mapping = {
    "Monday": "星期一", "Tuesday": "星期二", "Wednesday": "星期三",
    "Thursday": "星期四", "Friday": "星期五", "Saturday": "星期六", "Sunday": "星期日"
}
weekday_zh = weekday_mapping.get(today.strftime("%A"), today.strftime("%A"))
SCRIPT_DIR = Path(__file__).resolve().parent

rag_path = os.path.join(os.path.dirname(__file__), "schedule_agent_rag_examples.json")
store = MemoryStore(path=rag_path)

def judge_mode(input_text: str, data: list) -> int:
    # 從 RAG 提取相關範例
    hits = store.query(query_text=input_text, top_k=10)
    if hits:
        rag_context = "\n    ".join([f"- 需求: {it.text} -> 應回傳 mode: {it.meta.get('label', '4')}" for score, it in hits])
        print(f"\n[RAG 參考範例] (前 {len(hits)} 筆):\n    {rag_context}\n", file=sys.stderr)
    else:
        rag_context = "(目前無相似範例，請根據內建知識判斷)"
        print("\n[RAG 參考範例]: 無\n", file=sys.stderr)

    message = f"""你是一個任務分類器，會有四種類型與我說出的對話請你分配到適合的類別中，今天是{weekday_zh}，請根據使用者需求來選擇判斷回答方式。

    (1).使用者需求:{input_text}
    (2).使用者歷史紀錄:{data}，共有{len(data)}筆紀錄。

    以下是一些相似的歷史判斷參考 (RAG_CONTEXT)：
    {rag_context}
    
    請參考上述 RAG 例子，這能幫助你更好的理解甚麼樣的需求屬於哪個 mode。

    【重要規則】：
    1.任務安排時間有精確到某日幾點，且有明確的日期範圍(像是周五晚上八點、周一早上十點) => 回傳 {{"mode": 1}}
    2.任務有提到要安排，但沒有準確時間到幾點，且使用者歷史紀錄(像週五晚上、週六早上，沒有明確的幾點鐘) >= 10筆資料 => 回傳 {{"mode": 2}}
    3.任務有提到要安排，但沒有準確時間到幾點，且使用者歷史紀錄 < 10筆資料 => 回傳 {{"mode": 3}}
    4.與任務安排看似不相關的對話 => 回傳 {{"mode": 4}}
    5.目標人物為你、他、她、他們 => 回傳 {{"mode": 4}}

    重要：只能回傳 JSON，不要加任何其他文字。
    """

    try:
        r = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": message}],
            temperature=0,
            response_format={"type": "json_object"},
        )
        obj = json.loads(r.choices[0].message.content)
        mode = int(obj.get("mode", 4))
        return mode if mode in (1, 2, 3, 4) else 4
    except Exception:
        return 4

def run_child(script_name: str, input_text: str) -> list:
    script_path = str(SCRIPT_DIR / script_name)
    p = subprocess.run(
        [sys.executable, script_path, input_text],
        capture_output=True,
        text=True,
        encoding="utf-8"
    )

    if p.returncode != 0:
        return []

    out = p.stdout.strip()

    try:
        parsed = json.loads(out)
        return parsed if isinstance(parsed, list) else []
    except Exception:
        return []

def analyze_user_preference(input_text: str, user_form: dict, history_data: list) -> list:
    # 提取可能的任務分類
    user_activity_type = [task["name"] for task in user_form.get("task_types", [])]
    if "其他" not in user_activity_type:
        user_activity_type.append("其他")
    
    categories_str = ", ".join(user_activity_type)
    
    message = f"""你是一個行程抽取助手。
請你判斷文字中的行程資訊，並抽取成結構化的格式。

請從以下訊息中抽取結構化的行程資訊(可能會包含多個行程，請分別拆分)：
- title: {categories_str} (這是可能的行程類別，請根據訊息內容選擇最適合的類別，如果訊息中沒有明確的類別，請選擇 "其他")
- content: (任務內容)
- date: (禮拜幾、周末、星期幾、下個月的什麼時候，不用進行邏輯推算)
- time: (時間，格式 HH:mm，請結合歷史紀錄中該類別通常發生的時間點進行推論)
- duration: (建議時長範圍:{user_form.get("task_durations")})

訊息: {input_text}

「參考資訊」
使用者個人設定 (user_form):
{json.dumps(user_form, ensure_ascii=False, indent=2)}

歷史紀錄 (history_data):
{json.dumps(history_data, ensure_ascii=False, indent=2)}

「訊息一般為一至兩個行程，請盡量不要回傳超過兩個行程」
以下為範例輸出，請用陣列將JSON格式包起來如下，並不用使用換行空格，這段回傳將提供給下個機器使用：
[{{ "title": "學習", "content": "學習程式", "date": "{today_str}", "time": "09:00", "duration": 60}},
{{ "title": "運動", "content": "跑步", "date": "{today_str}", "time": "14:00", "duration": 30}}]

重要：只能回傳 JSON，不要加任何其他預導文字。
"""

    try:
        r = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": message}],
            temperature=0,
        )
        content = r.choices[0].message.content
        # 移除 markdown 區塊
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()
            
        obj = json.loads(content)
        
        # 處理陣列或物件包陣列的情況
        if isinstance(obj, dict):
            for key in obj:
                 if isinstance(obj[key], list):
                     return obj[key]
            return []
        return obj if isinstance(obj, list) else []
    except Exception as e:
        print(f"analyze_user_preference 發生錯誤: {e}", file=sys.stderr)
        return []

def main():
    input_text = sys.argv[1] if len(sys.argv) > 1 else ""
    user_form_str = sys.argv[2] if len(sys.argv) > 2 else "{}"
    history_data_str = sys.argv[3] if len(sys.argv) > 3 else "[]"
    existing_data_str = sys.argv[4] if len(sys.argv) > 4 else "[]"
    user_id = sys.argv[5] if len(sys.argv) > 5 else "demo"

    user_form = json.loads(user_form_str)
    data = json.loads(history_data_str)
    existing_data = json.loads(existing_data_str)

    print("偵測到 user_form =", user_form, file=sys.stderr)
    print("偵測到 history_data 筆數 =", len(data), file=sys.stderr)
    print("偵測到 existing_data 筆數 =", len(existing_data), file=sys.stderr)

    user_activity_type = [task["name"] for task in user_form.get("task_types", [])]
    if "其他" not in user_activity_type:
        user_activity_type.append("其他")

    mode = judge_mode(input_text, data)
    print("偵測到 input_text =", input_text, file=sys.stderr)
    print("偵測到 mode =", mode, file=sys.stderr)

    if mode == 1:
        tasks = analyze_task(input_text, user_activity_type)
        print(json.dumps(tasks, ensure_ascii=False))
        return

    # 當 mode 是 2 或 3 且資料不足 10 筆時，使用LLM邏輯
    if (mode == 2 or mode == 3) and len(data) < 10:
        tasks = analyze_user_preference(input_text, user_form, data)
        print("偵測到 tasks =", tasks, file=sys.stderr)
        tasks = analyze_task(tasks, user_activity_type)
        print(json.dumps(tasks, ensure_ascii=False))
        return

    # 當 mode 是 2 或 3 且資料大於 10 筆時，使用排程邏輯
    if (mode == 2 or mode == 3) and len(data) >= 10:
        tasks = scheduleAI(input_text, user_form, user_activity_type, data, existing_data, user_id)
        print(json.dumps(tasks, ensure_ascii=False))
        return

    print("[]")

if __name__ == "__main__":
    main()