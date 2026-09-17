import os
from dotenv import load_dotenv
import sys
import re
# 載入 .env 檔案
load_dotenv()

import pandas as pd
import json
from datetime import timedelta
from datetime import datetime
from openai import OpenAI
from UserIntention import run_pipeline
from rag_memory import MemoryStore, rag_suggest_adjustments, MEMORY_PATH
from analyze_task import analyze_task

# 使用者輸入
#user_input = input("請輸入您的需求描述：")
'''
user_form = { 
"available_time": { "Mon": ["00:00-03:00", "09:30-13:00", "15:00-00:00"], 
                    "Tue": ["00:00-03:00", "09:30-13:00", "15:00-00:00"],
                    "Wed": ["00:00-03:00", "09:30-13:00", "15:00-00:00"],
                    "Thu": ["00:00-03:00", "09:30-13:00", "15:00-00:00"],
                    "Fri": ["00:00-03:00", "09:30-13:00", "15:00-00:00"],
                    "Sat": ["00:00-03:00", "15:00-00:00"], 
                    "Sun": ["00:00-03:00", "15:00-00:00"] },
"best_focus_periods": [ "00:00-06:00", "15:00-18:00" ], 
"ideal_task_duration": "60-90min", 
"task_types": [ {"name": "讀書", "focus_level": "中"}, {"name": "作業", "focus_level": "高"}, {"name": "專題", "focus_level": "低"} ],
"time_preferences": { "morning": "低", "afternoon": "中", "evening": "中", "night": "高" } }
user_activity_type = [task["name"] for task in user_form.get("task_types", [])]
if "其他" not in user_activity_type: 
    user_activity_type.append("其他")
    
# 載入資料
data = [
    ["2025-12-05", "17:30", "60min", "專題", "五"],
    ["2025-12-06", "01:30", "45min", "專題", "六"],
    ["2025-12-06", "12:30", "30min", "專題", "六"],
    ["2025-12-06", "15:00", "60min", "專題", "六"],
    ["2025-12-06", "17:00", "30min", "讀書", "六"],
    ["2025-12-06", "20:00", "90min", "讀書", "六"],
    ["2025-12-07", "02:30", "60min", "讀書", "日"],
    ["2025-12-07", "13:30", "60min", "讀書", "日"],
    ["2025-12-07", "03:30", "90min", "讀書", "日"],
    ["2025-12-07", "22:00", "90min", "讀書", "日"],
    ["2025-12-08", "01:00", "90min", "讀書", "一"],
    ["2025-12-08", "13:30", "60min", "作業", "一"],
    ["2025-12-09", "20:30", "120min","作業", "二"],
    ["2025-12-10", "14:30", "90min", "作業", "三"],
    ["2025-12-10", "20:30", "90min", "作業", "三"],
    ["2025-12-11", "01:30", "60min", "作業", "四"],
    ["2025-12-11", "16:30", "60min", "作業", "四"],
    ["2025-12-12", "01:00", "90min", "讀書", "五"],
    ["2025-12-12", "18:30", "60min", "讀書", "五"],
    ["2025-12-13", "02:00", "60min", "讀書", "六"],
    ["2025-12-13", "12:00", "150min","讀書", "六"],
    ["2025-12-13", "18:00", "60min", "讀書", "六"],
    ["2025-12-13", "21:00", "120min","作業", "六"],
    ["2025-12-14", "01:00", "150min","作業", "日"],
    ["2025-12-14", "13:00", "60min", "作業", "日"],
    ["2025-12-14", "15:30", "90min", "作業", "日"],
    ["2025-12-14", "20:30", "60min", "作業", "日"],
    ["2025-12-15", "01:30", "120min","作業", "一"],
    ["2025-12-15", "21:00", "90min", "作業", "一"],
    ["2025-12-16", "20:30", "90min", "讀書", "二"],
    ["2025-12-17", "00:30", "90min", "讀書", "三"],
    ["2025-12-17", "17:00", "60min", "作業", "三"],
    ["2025-12-17", "18:30", "60min", "讀書", "三"],
    ["2025-12-17", "21:00", "60min", "讀書", "三"],
    ["2025-12-18", "00:00", "60min", "讀書", "四"],
    ["2025-12-18", "18:00", "90min", "讀書", "四"],
    ["2025-12-19", "01:00", "90min", "讀書", "五"],
    ["2025-12-19", "15:00", "60min", "讀書", "五"],
    ["2025-12-19", "20:00", "60min", "讀書", "五"],
    ["2025-12-19", "22:00", "60min", "讀書", "五"],
    ["2025-12-20", "01:00", "90min", "讀書", "六"],
    ["2025-12-20", "12:30", "90min", "讀書", "六"],
    ["2025-12-20", "15:30", "90min", "讀書", "六"], 
    ["2025-12-20", "22:00", "90min", "讀書", "六"],
    ["2025-12-21", "01:30", "60min", "讀書", "日"],
    ["2025-12-21", "13:00", "90min", "讀書", "日"],
    ["2025-12-22", "11:30", "90min", "讀書", "一"],
    ["2025-12-22", "17:30", "60min", "讀書", "一"],
    ["2025-12-22", "22:30", "90min", "讀書", "一"],
    ["2025-12-30", "15:30", "120min", "專題", "二"],
    ["2025-12-31", "02:30", "90min", "專題", "三"],
    ["2026-01-02", "16:30", "30min", "專題", "五"],
    ["2026-01-02", "18:00", "90min", "專題", "五"],
    ["2026-01-03", "16:00", "90min", "專題", "六"],
    ["2026-01-04", "02:00", "90min", "專題", "日"]
]
'''
def scheduleAI(user_input, user_form, user_activity_type, data, existing_data=None, user_id="demo"):
    existing_data = existing_data or []

    user_intention = run_pipeline(user_input, user_activity_type)
    if isinstance(user_intention, dict):
        user_intention = [user_intention]

    store = MemoryStore(path=MEMORY_PATH)

    def block_to_time(block):
        hour = block // 2
        minute = (block % 2) * 30
        return f"{hour:02d}:{minute:02d}"

    def block_range_to_time(blocks):
        start = block_to_time(blocks[0])
        end_hour = (blocks[-1] + 1) // 2
        end_minute = ((blocks[-1] + 1) % 2) * 30
        end = f"{end_hour:02d}:{end_minute:02d}"
        return f"{start} ~ {end}"

    df = pd.DataFrame(data, columns=["date", "start", "duration", "type", "day"])

    df["start_dt"] = pd.to_datetime(df["date"] + " " + df["start"])
    df["duration_min"] = df["duration"].str.replace("min", "").astype(int)
    df["end_dt"] = df["start_dt"] + df["duration_min"].apply(lambda x: timedelta(minutes=x))

    def get_blocks(row):
        start_block = row["start_dt"].hour * 2 + (row["start_dt"].minute // 30)
        end_block = row["end_dt"].hour * 2 + (row["end_dt"].minute // 30)
        return list(range(start_block, end_block))
   
    def build_used_blocks_by_date(task_rows):
        used = {}

        if not task_rows:
            return used

        occ_df = pd.DataFrame(task_rows, columns=["date", "start", "duration", "type", "day"])

        if occ_df.empty:
            return used

        occ_df["start_dt"] = pd.to_datetime(occ_df["date"] + " " + occ_df["start"])
        occ_df["duration_min"] = occ_df["duration"].str.replace("min", "", regex=False).astype(int)
        occ_df["end_dt"] = occ_df["start_dt"] + occ_df["duration_min"].apply(lambda x: timedelta(minutes=x))

        for _, row in occ_df.iterrows():
            date_str = row["date"]
            start_block = row["start_dt"].hour * 2 + (row["start_dt"].minute // 30)
            end_block = row["end_dt"].hour * 2 + (row["end_dt"].minute // 30)

            if date_str not in used:
                used[date_str] = set()

            used[date_str].update(range(start_block, end_block))

        return used

    def build_date_usage_count(task_rows):
        usage = {}

        if not task_rows:
            return usage

        for row in task_rows:
            date_str = row[0]
            usage[date_str] = usage.get(date_str, 0) + 1

        return usage
    
    expanded = []
    for _, r in df.iterrows():
        blocks = get_blocks(r)
        for b in blocks:
            expanded.append({"block": b, "type": r["type"], "day": r["day"]})

    expanded_df = pd.DataFrame(expanded)

    total_distribution = expanded_df.groupby("block").size().to_dict()

    type_distribution = (
        expanded_df.groupby(["type", "block"])
        .size()
        .reset_index(name="count")
    )

    best_time_result = {}
    for t in type_distribution["type"].unique():
        rows = type_distribution[type_distribution["type"] == t]
        best_time_result[t] = {int(r["block"]): int(r["count"]) for _, r in rows.iterrows()}

    best_day = (
        expanded_df.groupby("day")
        .size()
        .reset_index(name="count")
        .sort_values("count", ascending=False)
    )
    best_day_result = {row["day"]: int(row["count"]) for _, row in best_day.iterrows()}

    def time_to_block(t: str) -> int:
        hh, mm = map(int, t.split(":"))
        return hh * 2 + (mm // 30)

    def parse_time_range_to_blocks(rng: str):
        start, end = rng.split("-")
        if end == "00:00":
            end = "24:00"
        s = time_to_block(start)
        e = time_to_block(end)
        return set(range(s, e))

    def available_blocks_for_weekday(user_form, weekday_key: str) -> set[int]:
        blocks = set()
        avail_time = user_form.get("available_time", {})
        if not avail_time:
            return set(range(48))
        for rng in avail_time.get(weekday_key, []):
            blocks |= parse_time_range_to_blocks(rng)
        return blocks

    def generate_windows(window_size: int, allowed_blocks: set[int]):
        windows = []
        for start in range(0, 48 - window_size + 1):
            w = list(range(start, start + window_size))
            if all(b in allowed_blocks for b in w):
                windows.append(w)
        return windows

    def score_window(blocks, total_dist, type_dist=None, used_blocks=None,
                    constraints=None, user_form=None, mode="normal", weight_patch=None):
        used_blocks = used_blocks or set()
        constraints = constraints or []
        user_form = user_form or {}

        if any(b in used_blocks for b in blocks):
            return -10**9

        total_score = sum(total_dist.get(b, 0) for b in blocks)
        type_score = 0
        if type_dist:
            type_score = sum(type_dist.get(b, 0) for b in blocks)

        base = total_score + 2.0 * type_score

        comfort = 0.0
        best_focus = user_form.get("best_focus_periods", [])
        for b in blocks:
            t0 = block_to_time(b)
            for rng in best_focus:
                s, e = rng.split("-")
                if (s <= t0 < e) or (e == "00:00" and t0 >= s):
                    comfort += 1.0
                    break

        fatigue = 0.0
        late_blocks = [b for b in blocks if b >= 44]
        fatigue += 2.0 * len(late_blocks)
        fatigue += max(0, len(blocks) - 4) * 0.8

        mode = mode or "normal"
        if mode not in ["normal", "relaxed", "push"]:
            mode = "normal"

        if "no_late_night" in constraints:
            if any(b >= 44 for b in blocks):
                return -10**9

        if "avoid_long_block" in constraints:
            if len(blocks) > 6:
                fatigue += 10.0

        if "prefer_morning" in constraints:
            if all(not (12 <= b < 24) for b in blocks):
                base -= 5.0
        if "prefer_evening" in constraints:
            if all(not (36 <= b < 48) for b in blocks):
                base -= 5.0
        if "prefer_afternoon" in constraints:
            if all(not (24 <= b < 36) for b in blocks):
                base -= 15.0
        if "need_breaks" in constraints and used_blocks:
            for b in blocks:
                if (b - 1 in used_blocks) or (b + 1 in used_blocks):
                    fatigue += 2.0
                    break

        if mode == "relaxed":
            fatigue *= 1.6
            comfort *= 1.3
        elif mode == "push":
            fatigue *= 0.7
            comfort *= 0.9

        weight_patch = weight_patch or {}

        late_penalty_mul = float(weight_patch.get("late_penalty_mul", 1.0))
        fatigue_mul = float(weight_patch.get("fatigue_mul", 1.0))
        comfort_mul = float(weight_patch.get("comfort_mul", 1.0))
        rag_bonus = float(weight_patch.get("rag_bonus", 0.0))

        if len(late_blocks) > 0:
            fatigue += (late_penalty_mul - 1.0) * (2.0 * len(late_blocks))

        fatigue *= fatigue_mul
        comfort *= comfort_mul

        final_score = base + 2.5 * comfort - 1.0 * fatigue + rag_bonus
        return final_score
        print(f"""
[DEBUG score_window]
blocks = {blocks}
time = {block_range_to_time(blocks)}
base = {base:.2f}
comfort = {comfort:.2f}
fatigue = {fatigue:.2f}
rag_bonus = {rag_bonus:.2f}
final_score = {final_score:.2f}
constraints = {constraints}
mode = {mode}
weight_patch = {weight_patch}
""", file=sys.stderr)

    def pick_top_k_windows(activity_type: str, need_min: int, weekday_key: str,
                        user_form, total_distribution, best_time_result,
                        used_blocks, constraints=None, top_k: int = 5, mode="normal", weight_patch=None):
        window_size = max(1, need_min // 30)

        allowed = available_blocks_for_weekday(user_form, weekday_key)
        windows = generate_windows(window_size, allowed)

        type_dist = (best_time_result or {}).get(activity_type) or {}

        scored = []
        for w in windows:
            s = score_window(
                w, total_distribution,
                type_dist=type_dist,
                used_blocks=used_blocks,
                constraints=constraints,
                user_form=user_form,
                mode=mode,
                weight_patch=weight_patch
            )
            if s <= -10**8:
                continue
            scored.append({"blocks": w, "score": s})

        scored.sort(key=lambda x: x["score"], reverse=True)
        print(f"\n[TOP {top_k} WINDOWS] activity={activity_type}", file=sys.stderr)
        for c in scored[:top_k]:
            print(f"time={block_range_to_time(c['blocks'])}, score={c['score']:.2f}", file=sys.stderr)
        return scored[:top_k]

    def date_list_in_range(start_yyyy_mm_dd: str, end_yyyy_mm_dd: str) -> list[str]:
        s = datetime.strptime(start_yyyy_mm_dd, "%Y-%m-%d").date()
        e = datetime.strptime(end_yyyy_mm_dd, "%Y-%m-%d").date()
        out = []
        cur = s
        while cur <= e:
            out.append(cur.strftime("%Y-%m-%d"))
            cur += timedelta(days=1)
        return out

    def weekday_cn(date_str: str) -> str:
        wd = datetime.strptime(date_str, "%Y-%m-%d").weekday()
        return ["一","二","三","四","五","六","日"][wd]

    weekday_map = {0: "Mon", 1: "Tue", 2: "Wed", 3: "Thu", 4: "Fri", 5: "Sat", 6: "Sun"}

    used_blocks_by_date = build_used_blocks_by_date(existing_data)
    date_usage_count = build_date_usage_count(existing_data)
    picked = []

    ENABLE_RAG = True

    for idx, task in enumerate(user_intention, 1):
        activity_type = task.get("activity_type", "其他")
        need_min = int(task.get("segment_length_min") or task.get("need_time") or 60)
        constraints = list(task.get("constraints") or [])
        mode = task.get("mode") or "normal"

        date_range = task.get("date_range")
        if not date_range or not isinstance(date_range, (list, tuple)) or len(date_range) != 2:
            sd = task.get("start_date")
            if sd and re.match(r"\d{4}-\d{2}-\d{2}", str(sd)):
                date_range = (sd, sd)
            else:
                today_str = datetime.today().strftime("%Y-%m-%d")
                date_range = (today_str, today_str)

        range_start, range_end = date_range
        candidate_dates = date_list_in_range(range_start, range_end)
        candidate_dates.sort(key=lambda d: best_day_result.get(weekday_cn(d), 0), reverse=True)

        weight_patch = None
        if ENABLE_RAG:
            query_text = f"排程:{activity_type}, 內容:{task.get('content', '')}, 持續時間:{need_min}, 狀態:{mode}"
            rag_result = rag_suggest_adjustments(
                store=store,
                user_state_text=query_text,
                userid=user_id,
                top_k=30,
                success_only=False,
                recent_n=50,
                decay_half_life_days=14
            )

            rag_constraints = rag_result.get("suggest_constraints", []) or []
            weight_patch = rag_result.get("weight_patch", {}) or {}

            # ===== RAG：完成加分、未完成扣分到 block 分數 =====
            rag_hits = rag_result.get("top_hits", [])
            boosted_total_distribution = dict(total_distribution)

            MAX_RAG_BOOST_PER_BLOCK = 20.0
            MAX_RAG_PENALTY_PER_BLOCK = 20.0

            BASE_RAG_BOOST = 2.0
            BASE_RAG_PENALTY = 2.0

            rag_boost_by_block = {}
            rag_penalty_by_block = {}

            for hit in rag_hits:
                meta = hit.get("meta", {})
                time_range = meta.get("time_range")

                if not time_range:
                    continue

                try:
                    s, e = time_range.split("~")
                    s_block = time_to_block(s)
                    e_block = time_to_block(e)

                    decay = float(meta.get("_decay_weight", 1.0))
                    success = bool(meta.get("success", False))

                    for b in range(s_block, e_block):
                        current_value = boosted_total_distribution.get(b, 0)

                        if success:
                            raw_boost = BASE_RAG_BOOST * decay
                            current_boost = rag_boost_by_block.get(b, 0.0)
                            allowed_boost = max(0.0, MAX_RAG_BOOST_PER_BLOCK - current_boost)
                            actual_boost = min(raw_boost, allowed_boost)

                            boosted_total_distribution[b] = current_value + actual_boost
                            rag_boost_by_block[b] = current_boost + actual_boost

                            print(
                                f"[RAG BOOST] block {b} += {actual_boost:.2f} "
                                f"(success=True, decay={decay:.2f}, total_boost={rag_boost_by_block[b]:.2f})",
                                file=sys.stderr
                            )

                        else:
                            raw_penalty = BASE_RAG_PENALTY * decay
                            current_penalty = rag_penalty_by_block.get(b, 0.0)
                            allowed_penalty = max(0.0, MAX_RAG_PENALTY_PER_BLOCK - current_penalty)
                            actual_penalty = min(raw_penalty, allowed_penalty)

                            boosted_total_distribution[b] = current_value - actual_penalty
                            rag_penalty_by_block[b] = current_penalty + actual_penalty

                            print(
                                f"[RAG PENALTY] block {b} -= {actual_penalty:.2f} "
                                f"(success=False, decay={decay:.2f}, total_penalty={rag_penalty_by_block[b]:.2f})",
                                file=sys.stderr
                            )

                except Exception as ex:
                    print("[RAG BOOST/PENALTY ERROR]", ex, file=sys.stderr)
                    continue

            constraints = list(dict.fromkeys(constraints + rag_constraints))
        else:
            boosted_total_distribution = dict(total_distribution)

        segment_count = int(task.get("segment_count") or 1)
        used_dates_for_this_task = set()

        for seg_i in range(segment_count):
            placed = False
            start_idx = seg_i % len(candidate_dates)
            rotated_dates = candidate_dates[start_idx:] + candidate_dates[:start_idx]

            best_pick = None
            best_final_score = -10**18

            for date_str in rotated_dates:
                if date_str in used_dates_for_this_task:
                    continue

                dt = datetime.strptime(date_str, "%Y-%m-%d").date()
                weekday_key = weekday_map[dt.weekday()]
                used_blocks = used_blocks_by_date.setdefault(date_str, set())

                top5 = pick_top_k_windows(
                    activity_type=activity_type,
                    need_min=need_min,
                    weekday_key=weekday_key,
                    user_form=user_form,
                    total_distribution=boosted_total_distribution,
                    best_time_result=best_time_result,
                    used_blocks=used_blocks,
                    constraints=constraints,
                    mode=mode,
                    top_k=5,
                    weight_patch=weight_patch
                )

                if not top5:
                    continue

                best = top5[0]
                usage_penalty = date_usage_count.get(date_str, 0) * 20
                final_score = best["score"] - usage_penalty

                if final_score > best_final_score:
                    best_final_score = final_score
                    best_pick = {
                        "date": date_str,
                        "best": best,
                        "top5": top5,
                        "final_score": final_score
                    }

            if best_pick is not None:
                date_str = best_pick["date"]
                best = best_pick["best"]
                top5 = best_pick["top5"]

                used_blocks = used_blocks_by_date.setdefault(date_str, set())
                used_blocks |= set(best["blocks"])

                date_usage_count[date_str] = date_usage_count.get(date_str, 0) + 1
                used_dates_for_this_task.add(date_str)

                print(f"[PICKED] {date_str} {block_range_to_time(best['blocks'])} score={best['score']:.2f}", file=sys.stderr)

                picked.append({
                    "activity_type": activity_type,
                    "segment_index": seg_i + 1,
                    "date": date_str,
                    "time": block_range_to_time(best["blocks"]),
                    "score": float(best["score"]),
                    "final_score": float(best_pick["final_score"]),
                    "mode": mode,
                    "constraints": constraints,
                    "top5": [
                        {
                            "time": block_range_to_time(c["blocks"]),
                            "score": float(c["score"])
                        }
                        for c in top5
                    ]
                })

                placed = True

            if not placed:
                for date_str in rotated_dates:
                    dt = datetime.strptime(date_str, "%Y-%m-%d").date()
                    weekday_key = weekday_map[dt.weekday()]
                    used_blocks = used_blocks_by_date.setdefault(date_str, set())

                    top5 = pick_top_k_windows(
                        activity_type=activity_type,
                        need_min=need_min,
                        weekday_key=weekday_key,
                        user_form=user_form,
                        total_distribution=boosted_total_distribution,
                        best_time_result=best_time_result,
                        used_blocks=used_blocks,
                        constraints=constraints,
                        mode=mode,
                        top_k=5,
                        weight_patch=weight_patch
                    )

                    if not top5:
                        continue

                    best = top5[0]
                    usage_penalty = date_usage_count.get(date_str, 0) * 20
                    final_score = best["score"] - usage_penalty

                    used_blocks |= set(best["blocks"])
                    date_usage_count[date_str] = date_usage_count.get(date_str, 0) + 1

                    print(f"[PICKED-FALLBACK] {date_str} {block_range_to_time(best['blocks'])} score={best['score']:.2f}", file=sys.stderr)

                    picked.append({
                        "activity_type": activity_type,
                        "segment_index": seg_i + 1,
                        "date": date_str,
                        "time": block_range_to_time(best["blocks"]),
                        "score": float(best["score"]),
                        "final_score": float(final_score),
                        "mode": mode,
                        "constraints": constraints,
                        "top5": [
                            {
                                "time": block_range_to_time(c["blocks"]),
                                "score": float(c["score"])
                            }
                            for c in top5
                        ]
                    })

                    placed = True
                    break

            if not placed:
                picked.append({
                    "activity_type": activity_type,
                    "segment_index": seg_i + 1,
                    "date_range": [range_start, range_end],
                    "error": "no window in date range",
                    "mode": mode,
                    "constraints": constraints
                })

    analyze_input_msg = {
        "任務排程內容": user_input,
        "tasks": [
            {k: item[k] for k in ["activity_type", "date", "time"] if k in item}
            for item in picked
        ]
    }

    analysis = analyze_task(analyze_input_msg , user_activity_type)
    return analysis