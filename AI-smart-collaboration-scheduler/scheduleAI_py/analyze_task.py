import os
import json
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from datetime import datetime
from zoneinfo import ZoneInfo
from UserIntention import parse_date_range
import sys
# 載入環境變數
load_dotenv()
openai_api_key = os.getenv("OPENAI_API_KEY")

# 初始化 GPT
llm = ChatOpenAI(model="gpt-4o-mini", temperature=0, api_key=openai_api_key)

# Prompt：抽取結構化行程
extract_prompt = ChatPromptTemplate.from_template(
    """你是一個行程抽取助手。
請你判斷文字中的行程資訊，並抽取成結構化的格式。

請從以下訊息中抽取結構化的行程資訊(可能會包含多個行程)：
- title: {categories} (這是可能的行程類別，請根據訊息內容選擇最適合的類別，如果訊息中沒有明確的類別，請選擇 "其他")
- content: (任務內容)
- date: (日期，格式 YYYY-MM-DD，如果訊息沒提到日期，請使用今天)
- time: (時間，格式 HH:MM)
- duration: (時長，例如 60 代表 60 分鐘，沒有的話請填60)

請使用目標日期範圍當作date的參考依據，如果沒有目標日期範圍，請使用今天作為推算依據
訊息: {message}
目標日期範圍: {date_text_list}
今天的日期是：{today}，星期是：{weekday}

「如果訊息中包含多個行程，時間請盡量分散，date一定格式要是YYYY-MM-DD」
以下為範例輸出，請用陣列將JSON格式包起來如下，並不用使用換行空格，這段回傳將提供給下個機器使用：
[{{ "title": "學習", "content": "學習程式", "date": "2026-01-09", "time": "09:00", "duration": 60}},
{{ "title": "運動", "content": "跑步", "date": "2026-01-09", "time": "14:00", "duration": 30}}]
"""
)

def analyze_task(message: str, categories: list[str]) -> str:
    
    date_text_list = extract_date_text(message)
    print("date_text_list", date_text_list, file=sys.stderr)
    # 用 parse_date_range 將日期文字轉為 YYYY-MM-DD
    resolved_dates = []
    for dt_text in date_text_list:
        result = parse_date_range(dt_text)
        if result:
            start_d, end_d = result
            if start_d == end_d:
                resolved_dates.append(start_d)
            else:
                resolved_dates.append(f"{start_d} ~ {end_d}")
        else:
            resolved_dates.append(dt_text)  # parse 不了就保留原文
    print("resolved_dates", resolved_dates, file=sys.stderr)

    today = datetime.now(ZoneInfo("Asia/Taipei"))
    today_str = today.strftime('%Y-%m-%d')
        
    weekday_mapping = {
        "Monday": "星期一", "Tuesday": "星期二", "Wednesday": "星期三",
        "Thursday": "星期四", "Friday": "星期五", "Saturday": "星期六", "Sunday": "星期日"
    }
    weekday_zh = weekday_mapping.get(today.strftime("%A"), today.strftime("%A"))

    # 呼叫 GPT
    structured = (extract_prompt | llm).invoke({
        "message": message,
        "date_text_list": resolved_dates if resolved_dates else [],
        "today": today_str,
        "weekday": weekday_zh,
        "categories": categories
    })

    return structured.content

# Prompt：僅提取日期相關文字
date_extract_prompt = ChatPromptTemplate.from_template(
    """你是一個日期文字提取助手。
訊息: {message}

「重要規則」
請從使用者訊息中推測出是否為以下日期形式、或是英文的日期形式，轉為中文回傳:
1.(這/下/下下)禮拜一、(這/下/下下)禮拜二、(這/下/下下)禮拜三、(這/下/下下)禮拜四、(這/下/下下)禮拜五、(這/下/下下)禮拜六、(這/下/下下)禮拜日
2.(這/下/下下)星期一、(這/下/下下)星期二、(這/下/下下)星期三、(這/下/下下)星期四、(這/下/下下)星期五、(這/下/下下)星期六、(這/下/下下)星期日
3.(這/下/下下)週一、(這/下/下下)週二、(這/下/下下)週三、(這/下/下下)週四、(這/下/下下)週五、(這/下/下下)週六、(這/下/下下)週日
4.今天、明天、後天、大後天
5.一天後、兩天後、三天後、四天後、五天後、六天後、七天後
6.(這/下/下下)週末、(這/下/下下)周末、(這/下/下下)週六日、(這/下/下下)周六日、(這/下/下下)禮拜六日
7.(這/下/下下)月、(這/下/下下)月底
8.準確日期式時間:1月1日、1月2號、1/3、2026/1/1

「不要硬傳」
請用 JSON 陣列格式回傳，如果訊息中沒有任何日期時間相關文字，請回傳空陣列 []。
重要：只能回傳 JSON，不要加任何其他文字。
"""
)


def extract_date_text(message: str) -> list:
    # 提取日期文字
    result = (date_extract_prompt | llm).invoke({
        "message": message,
    })

    try:
        content = result.content.strip()
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()
        parsed = json.loads(content)
        return parsed if isinstance(parsed, list) else []
    except Exception:
        return []