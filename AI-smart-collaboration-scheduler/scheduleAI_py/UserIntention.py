import unicodedata
from fuzzywuzzy import process
from openai import OpenAI
import os
from dotenv import load_dotenv
import re
import json
from datetime import datetime, timedelta
from rag_memory import MemoryStore, rag_suggest_adjustments, MEMORY_PATH
import calendar
from datetime import date
from zoneinfo import ZoneInfo
from dateutil.relativedelta import relativedelta

#將gpt回傳的文字轉成json
def safe_json_loads(s: str):
    if not isinstance(s, str):
        return s
    #將開頭的```json跟結尾的```刪掉
    s = re.sub(r"```(?:json)?\s*", "", s.strip(), flags=re.IGNORECASE)
    s = re.sub(r"\s*```$", "", s.strip())

    try:
        return json.loads(s)
    except json.JSONDecodeError:
        pass
    #找出真正的json開頭跟結尾
    m = re.search(r"(\[.*\]|\{.*\})", s, flags=re.DOTALL)
    if not m:
        raise ValueError(f"Cannot find JSON in model output: {s[:200]}...")
    return json.loads(m.group(1))

# 呼叫流程
def run_pipeline(user_input: str, user_activity_type):
    clean_input = preprocess(user_input)
    fuzzy_result = fuzzy_activity_match(clean_input, user_activity_type)

    # 先從文字抽 constraints
    rule_constraints = extract_constraints_rulebased(clean_input)

    raw_result = extract_intent_with_ai(clean_input, user_activity_type)
    raw_obj = safe_json_loads(raw_result)

    today_str = datetime.today().strftime("%Y-%m-%d")

    def merge_constraints(task_dict: dict) -> dict:
        # 確保 constraints 是 list
        cs = task_dict.get("constraints") or []
        if not isinstance(cs, list):
            cs = [str(cs)]

         # 合併 rule-based constraints
        for x in rule_constraints:
            if x not in cs:
                cs.append(x)

        # 防呆：把 relaxed/push 從 constraints 移除
        cs = [x for x in cs if x not in ["relaxed", "push"]]
        task_dict["constraints"] = cs
        return task_dict

    if isinstance(raw_obj, list):
        final_list = []
        for item in raw_obj:
            processed = postprocess(item, today_str)

            if isinstance(processed, dict):
                if not processed.get("activity_type"):
                    processed["activity_type"] = fuzzy_result

                processed = merge_constraints(processed)

            final_list.append(processed)
        return final_list

    else:
        final_result = postprocess(raw_obj, today_str)
        if isinstance(final_result, dict):
            if not final_result.get("activity_type"):
                final_result["activity_type"] = fuzzy_result
            final_result = merge_constraints(final_result)

        return [final_result]

# 載入 .env 檔案
load_dotenv()

# API key 設定
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# 活動類型字典
# -----------------------------
# 1. 前置處理：文字正規化 + 錯字修正
# -----------------------------
def preprocess(text):
    # 全形轉半形
    text = unicodedata.normalize("NFKC", text)
    # 去掉奇怪符號
    text = re.sub(r"[^\w\s:：點後分鐘]", "", text)
    # 常見錯字修正
    corrections = {".後": "點後", ".前": "點前"}
    for wrong, right in corrections.items():
        text = text.replace(wrong, right)
    return text

# -----------------------------
# 2. 模糊比對：活動類型
# -----------------------------
def fuzzy_activity_match(text, user_activity_type):
    best_match = process.extractOne(text, user_activity_type)
    if best_match and best_match[1] > 70:  # 相似度閾值
        return best_match[0]
    return "其他"
#比對文字並加入constraints，根據情況可以自己調整參數
def extract_constraints_rulebased(clean_text: str) -> list[str]:
    # 抽取硬規則
    c = []

    # ---- 時段偏好（你可以持續擴充）----
    if any(k in clean_text for k in ["晚上", "夜晚"]):
        c.append("prefer_evening")

    if any(k in clean_text for k in ["早上", "上午"]):
        c.append("prefer_morning")

    # ---- 避免特定情況 ----
    if any(k in clean_text for k in ["太晚", "熬夜", "凌晨", "半夜"]):
        c.append("no_late_night")

    if any(k in clean_text for k in ["太長", "太久"]):
        c.append("avoid_long_block")

    if any(k in clean_text for k in ["休息", "空檔"]):
        c.append("need_breaks")

    # 去重（保持順序）
    seen = set()
    out = []
    for x in c:
        if x not in seen:
            out.append(x)
            seen.add(x)
    return out

# -----------------------------
# 3. AI 抽取：意圖與槽位
# -----------------------------
def extract_intent_with_ai(text, user_activity_type):
    today = datetime.today()
    today_str = today.strftime("%Y-%m-%d")
    weekday_str = today.strftime("%A")

    prompt = f"""
今天是 {today_str}，星期 {weekday_str}。
你是一個 Intent & Slot Extraction 系統，基於 Joint Intent-Slot Filling 方法，
請從以下輸入句子抽取欄位：{text}

【重要規則】
1) 如果輸入包含 2 個(含)以上不同 activity_type（例如 讀書 + 專題），你必須輸出 JSON 陣列 []，
   每個任務一個物件，不可以把時間加總成同一個任務。
2) 每個物件的 need_time/segment_count/segment_length_min 只對應該活動，不可混在一起。
請依照下列格式輸出 JSON，不要亂補日期或時間：
- date 與 deadline 請保持原始描述（例如 "下禮拜二"、"三天後"），不要轉成 YYYY-MM-DD。
- segment_length_min 請只輸出使用者明確指定的數字或範圍，不要自行推算。

輸出格式：
{{
  "activity_type": "",     # {user_activity_type} 之一
  "start_date": "",        # task開始時間(格式 YYYY-MM-DD)、如果使用者沒指定，請填今天{today_str} 
  "deadline": "",           # task截止時間(這禮拜/下禮拜/這個月/下個月的甚麼時候)，保持原始描述
  "need_time": ,           # 需要多少時間（分鐘為單位）
  "segment_count": ,       # 分成幾次完成（預設 1）
  "segment_length_min": ,  # 每段要持續多少分鐘，保留原始描述中的數字或範圍
  "mode": "normal",        # "normal" / "relaxed" / "push"
  "constraints": []        # 例如 ["傾向晚上", "不在週末進行", "禮拜五晚上幾點不行"]
}}
"""

    r = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "你是一個意圖與槽位抽取模型"},
            {"role": "user", "content": prompt}
        ]
    )
    return r.choices[0].message.content

# -----------------------------
# 4. 後置檢查：日期與時間正規化
# -----------------------------
def start_of_week(d: datetime) -> datetime:
    # 以週一為一週開始
    return (d - timedelta(days=d.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)

def end_of_week(d: datetime) -> datetime:
    sow = start_of_week(d)
    return (sow + timedelta(days=6)).replace(hour=0, minute=0, second=0, microsecond=0)

def month_end(d: datetime) -> datetime:
    last_day = calendar.monthrange(d.year, d.month)[1]
    return d.replace(day=last_day, hour=0, minute=0, second=0, microsecond=0)

def parse_date_range(desc: str, now: datetime | None = None) -> tuple[str, str] | None:
    """
    回傳 (range_start_yyyy_mm_dd, range_end_yyyy_mm_dd) 皆為字串
    """
    now = now or datetime.now(ZoneInfo("Asia/Taipei"))
    if not desc:
        return None
    desc = str(desc).strip()

    # 1) 這禮拜X / 下禮拜X（單日→range_start=range_end=那天）
    weekdays_map = {
        "一": 0, "1": 0, "二": 1, "2": 1, "三": 2, "3": 2, 
        "四": 3, "4": 3, "五": 4, "5": 4, "六": 5, "6": 5, 
        "日": 6, "天": 6, "7": 6
    }

    week_pattern = r"((?:這|下|下下)個?)?(?:禮拜|星期|週)([一二三四五六日天1234567])"
    m = re.search(week_pattern, desc)
    if m:
        prefix_full = m.group(1)
        day_val = m.group(2)
        wd = weekdays_map.get(day_val, 0)
        base = start_of_week(now)
        
        # 判斷位移 (Offset)
        offset = 0
        if prefix_full:
            if "下下" in prefix_full:
                offset = 14
            elif "下" in prefix_full:
                offset = 7
        
        target = base + timedelta(days=offset + wd)
        
        is_this_week_or_none = (prefix_full is None) or ("這" in prefix_full)
        if is_this_week_or_none and target.date() < now.date():
            target += timedelta(days=7)
            
        ds = target.strftime("%Y-%m-%d")
        return (ds, ds)

    # 2) 週末處理
    if "週末" in desc or "周末" in desc or "周六日" in desc or "週六日" in desc:
        offset = 0
        if "下下" in desc: offset = 14
        elif "下" in desc: offset = 7
        s = start_of_week(now) + timedelta(days=offset + 5) # 週六
        e = s + timedelta(days=1) # 週日
        return (s.strftime("%Y-%m-%d"), e.strftime("%Y-%m-%d"))

    # 3) 本週 / 下週 / 下下週（整週範圍）
    if any(x in desc for x in ["這禮拜", "本週", "這週", "這周", "這星期"]):
        # 起點用 now (今天)，終點用週日
        s = now.replace(hour=0, minute=0, second=0, microsecond=0)
        e = start_of_week(now) + timedelta(days=6)
        return (s.strftime("%Y-%m-%d"), e.strftime("%Y-%m-%d"))

    if any(x in desc for x in ["下下禮拜", "下下週", "下下星期", "下下周"]):
        s = start_of_week(now) + timedelta(days=14)
        e = s + timedelta(days=6)
        return (s.strftime("%Y-%m-%d"), e.strftime("%Y-%m-%d"))

    if any(x in desc for x in ["下禮拜", "下週", "下周", "下星期"]):
        s = start_of_week(now) + timedelta(days=7)
        e = s + timedelta(days=6)
        return (s.strftime("%Y-%m-%d"), e.strftime("%Y-%m-%d"))
        
    # 4) 本月 / 月底
    if any(x in desc for x in ["本月", "月底", "這個月"]):
        s = now.replace(hour=0, minute=0, second=0, microsecond=0)
        e = month_end(now)
        return (s.strftime("%Y-%m-%d"), e.strftime("%Y-%m-%d"))
  
    # 5) 下個月
    if "下個月" in desc or "下月" in desc:
        target_m = now + relativedelta(months=+1)
        s = target_m.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        e = month_end(s)
        return (s.strftime("%Y-%m-%d"), e.strftime("%Y-%m-%d"))
        

    # 6) 明天/後天/幾天後 → 單日
    if "明天" in desc:
        d = (now + timedelta(days=1)).strftime("%Y-%m-%d")
        return (d, d)
    if "後天" in desc:
        d = (now + timedelta(days=2)).strftime("%Y-%m-%d")
        return (d, d)
    if "大後天" in desc:
        d = (now + timedelta(days=3)).strftime("%Y-%m-%d")
        return (d, d)

    # 匹配：數字天後 OR 中文天後
    cn_num = {"一": 1, "二": 2, "兩": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10}
    m = re.search(r"([0-9]+|[一二兩三四五六七八九十]+)天後", desc)
    if m:
        val = m.group(1)
        # 如果是純數字
        if val.isdigit():
            days = int(val)
        else:
            # 如果是中文數字
            days = cn_num.get(val, 0)

        if days > 0:
            d = (now + timedelta(days=days)).strftime("%Y-%m-%d")
            return (d, d)
            
    # 7) 優先處理具體日期：支援 2026-05-20, 5/20, 5月20日, 05月20號
    # 匹配 YYYY-MM-DD
    m_ymd = re.search(r"(\d{4})[-/月](\d{1,2})[-/日號](\d{1,2})[日號]?", desc)
    if m_ymd:
        d = f"{int(m_ymd.group(1))}-{int(m_ymd.group(2)):02d}-{int(m_ymd.group(3)):02d}"
        return (d, d)

    # 匹配 MM/DD 或 MM月DD日/號 (自動補年份)
    m_md = re.search(r"\b(\d{1,2})[-/月](\d{1,2})[日號]?\b", desc)
    if m_md:
        month, day = int(m_md.group(1)), int(m_md.group(2))
        year = now.year
        # 跨年防呆：12月提到1月視為明年
        if now.month >= 11 and month <= 2:
            year += 1
        try:
            target_dt = datetime(year, month, day)
            d = target_dt.strftime("%Y-%m-%d")
            return (d, d)
        except ValueError:
            pass # 2/30 這種無效日期直接跳過

    return None

# 日期正規化
def normalize_date(description):
    today = datetime.today()
    '''
    # 防呆：None 或空字串 → 預設今天
    if not description or str(description).strip() == "":
        return today.strftime("%Y-%m-%d")
    '''
    # 空字串/None：回傳 None（代表沒有）
    if description is None or str(description).strip() == "":
        return None
    desc = str(description)

    if "今天" in desc:
        return today.strftime("%Y-%m-%d")
    if "明天" in desc:
        return (today + timedelta(days=1)).strftime("%Y-%m-%d")
    if "後天" in desc:
        return (today + timedelta(days=2)).strftime("%Y-%m-%d")

    # N天後 / N天前
    match = re.search(r"(\d+)天後", desc)
    if match:
        days = int(match.group(1))
        return (today + timedelta(days=days)).strftime("%Y-%m-%d")

    match = re.search(r"(\d+)天前", desc)
    if match:
        days = int(match.group(1))
        return (today - timedelta(days=days)).strftime("%Y-%m-%d")

    # 這禮拜X / 下禮拜X
    weekdays = {"一":0,"二":1,"三":2,"四":3,"五":4,"六":5,"日":6}
    match = re.search(r"(這|下)禮拜([一二三四五六日])", desc)
    if match:
        target_week = match.group(1)
        target_day = weekdays[match.group(2)]
        days_ahead = target_day - today.weekday()
        if target_week == "下":
            days_ahead += 7
        if days_ahead <= 0 and target_week == "這":
            days_ahead += 7
        return (today + timedelta(days=days_ahead)).strftime("%Y-%m-%d")

    # 具體日期 YYYY-MM-DD
    match = re.search(r"(\d{4}-\d{2}-\d{2})", desc)
    if match:
        return match.group(1)

    # MM月DD日
    match = re.search(r"(\d{1,2})月(\d{1,2})日", desc)
    if match:
        year = today.year
        month = int(match.group(1))
        day = int(match.group(2))
        return f"{year}-{month:02d}-{day:02d}"

    return None  # 保留原始描述

# 時間長度正規化
def normalize_time_length(text):
    if not text:
        return None
    match = re.findall(r"(\d+)", str(text))
    if match:
        nums = list(map(int, match))
        avg = sum(nums) / len(nums)
        return round(avg / 30) * 30
    return None

#能量模式
def normalize_mode(m):
    if not m:
        return "normal"
    m = str(m).strip()

    if m in ["normal", "relaxed", "push"]:
        return m
    if any(k in m for k in ["普通", "正常", "一般"]):
        return "normal"
    if m in ["輕鬆", "放鬆", "不要太累"]:
        return "relaxed"
    if m in ["累", "累一點", "趕工", "衝刺", "拼一點"]:
        return "push"
    return "normal"

# 後置檢查函式
def postprocess(raw_result, today_str):
    # 1) 先把輸入轉成 dict
    if isinstance(raw_result, dict):
        data = raw_result
    elif isinstance(raw_result, str):
        try:
            data = json.loads(raw_result)
        except Exception:
            print("⚠️ JSON 解析失敗，原始輸出：", raw_result)
            return raw_result
    else:
        print("⚠️ postprocess 收到非 dict/str：", type(raw_result))
        return raw_result

    # 2) start_date normalize
    data["start_date"] = normalize_date(data.get("start_date", today_str))

    # 3) deadline normalize -> range
    deadline_desc = data.get("deadline")
    rng = parse_date_range(deadline_desc)  
    data["date_range"] = rng  # ("YYYY-MM-DD","YYYY-MM-DD") or None

    # 如果使用者沒給 range，就用 start_date 當單日 range
    if not data["date_range"]:
        sd = data.get("start_date") or today_str
        data["date_range"] = (sd, sd)

    # 仍然保留 deadline 原字串
    data["deadline"] = deadline_desc

    # 4) need_time normalize
    data["need_time"] = normalize_time_length(data.get("need_time"))

    # 5) segment_length_min normalize
    data["segment_length_min"] = normalize_time_length(data.get("segment_length_min"))

    # 6) segment_count 預設值保底
    if not data.get("segment_count"):
        data["segment_count"] = 1

    # 7) mode normalize + 保底
    data["mode"] = normalize_mode(data.get("mode"))

    return data

# -----------------------------
# 主程式測試
# -----------------------------
if __name__ == "__main__":
    user_activity_type = ["讀書", "作業", "專題", "其他"]
    user_input = input("請輸入您的需求描述：")

    # 取得使用者意圖 and 基本設定
    user_intention = run_pipeline(user_input, user_activity_type)
    print(f"\n🔹 使用者意圖分析結果: {user_intention}")
    #我加的370~390
    # =========================
    # RAG：用使用者輸入去查「過去成功排法」
    # =========================
    store = MemoryStore(path=MEMORY_PATH)

    rag_result = rag_suggest_adjustments(
        store=store,
        user_state_text=user_input,   # 直接用使用者原句（通常包含：我很累/排輕鬆）
        userid="demo",                # 之後換成真 userid
        top_k=5,
        success_only=True
    )

    rag_constraints_global = rag_result.get("suggest_constraints", []) or []
    rag_weight_patch_global = rag_result.get("weight_patch", {}) or {}

    print("\n[RAG] suggest_constraints =", rag_constraints_global)
    print("[RAG] weight_patch =", rag_weight_patch_global)
    print("[RAG] top_hits (score, time_range, late, duration) =",
        [(h["score"], h["meta"].get("time_range"), h["meta"].get("late"), h["meta"].get("duration"))
        for h in rag_result.get("top_hits", [])])