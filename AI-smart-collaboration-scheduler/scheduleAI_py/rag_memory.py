from __future__ import annotations

import json
import math
import os
from dataclasses import dataclass
import sys
from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime, timedelta


from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

# ========== 設定 ==========
EMBED_MODEL = os.getenv("EMBED_MODEL", "text-embedding-3-small")
MEMORY_PATH = os.getenv("MEMORY_PATH", "scheduleAI_py/memory_store.json")  # 可選：落地成檔案

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


# ========== 基本工具 ==========
def _cosine(a: List[float], b: List[float]) -> float:
    """cosine similarity"""
    dot = 0.0
    na = 0.0
    nb = 0.0
    for x, y in zip(a, b):
        dot += x * y
        na += x * x
        nb += y * y
    if na == 0.0 or nb == 0.0:
        return -1.0
    return dot / (math.sqrt(na) * math.sqrt(nb))


def embed_text(text: str) -> List[float]:
    """用 OpenAI embedding model 把文字轉向量"""
    text = (text or "").strip()
    if not text:
        return []
    resp = client.embeddings.create(
        model=EMBED_MODEL,
        input=text
    )
    return resp.data[0].embedding


# ========== Memory Store ==========
@dataclass
class MemoryItem:
    text: str
    embedding: List[float]
    meta: Dict[str, Any]


class MemoryStore:
    """
    先用本地 list 當向量庫（可選存到 json 檔）。
    之後要換 Chroma/FAISS 也很容易：保留 query() 的介面即可。
    """
    def __init__(self, path: Optional[str] = MEMORY_PATH):
        self.path = path
        self.items: List[MemoryItem] = []
        if self.path and os.path.exists(self.path):
            self.load()

    def load(self) -> None:
        with open(self.path, "r", encoding="utf-8") as f:
            raw = json.load(f)
        self.items = [
            MemoryItem(
                text=x["text"],
                embedding=x.get("embedding", []),
                meta=x.get("meta", {}),
            )
            for x in raw
        ]

    def save(self) -> None:
        if not self.path:
            return
        raw = [
            {"text": it.text, "embedding": it.embedding, "meta": it.meta}
            for it in self.items
        ]
        with open(self.path, "w", encoding="utf-8") as f:
            json.dump(raw, f, ensure_ascii=False, indent=2)

    def add(self, text: str, meta: Dict[str, Any], auto_embed: bool = True) -> MemoryItem:
        emb = embed_text(text) if auto_embed else meta.get("embedding", [])
        item = MemoryItem(text=text, embedding=emb, meta=meta)
        self.items.append(item)
        self.save()
        return item

    def query(
        self,
        query_text: str,
        top_k: int = 5,
        filters: Optional[Dict[str, Any]] = None,
        min_success_only: bool = False,
        recent_n: Optional[int] = None,
        decay_half_life_days: Optional[int] = None,
    ) -> List[Tuple[float, MemoryItem]]:
        """
        filters: 例如 {"userid": "...", "mode": "relaxed"}
        min_success_only: 只看 success=True 的案例（你想要「成功案例」就開）
        recent_n: 只看最近 N 筆資料，再做相似度搜尋
        decay_half_life_days: 時間衰退半衰期（天）
        """
        q_emb = embed_text(query_text)
        if not q_emb:
            return []

        today = datetime.today().date()

        def parse_item_date(item: MemoryItem) -> Optional[datetime.date]:
            item_date = item.meta.get("date")
            if not item_date:
                return None
            try:
                return datetime.strptime(item_date, "%Y-%m-%d").date()
            except Exception:
                return None

        def pass_filter(item: MemoryItem) -> bool:
            if min_success_only and not bool(item.meta.get("success", False)):
                return False

            if not filters:
                return True

            for k, v in filters.items():
                if item.meta.get(k) != v:
                    return False
            return True

        filtered_items: List[MemoryItem] = []
        for it in self.items:
            if not it.embedding:
                continue
            if not pass_filter(it):
                continue
            filtered_items.append(it)

        if recent_n is not None and recent_n > 0:
            filtered_items.sort(
                key=lambda item: (
                    parse_item_date(item) or datetime.min.date(),
                    item.meta.get("time", ""),
                ),
                reverse=True
            )
            filtered_items = filtered_items[:recent_n]

        scored: List[Tuple[float, MemoryItem]] = []
        for it in filtered_items:
            s = _cosine(q_emb, it.embedding)

            item_date = parse_item_date(it)
            decay_weight = 1.0
            if decay_half_life_days is not None and decay_half_life_days > 0 and item_date is not None:
                days_old = max(0, (today - item_date).days)
                decay_weight = 0.5 ** (days_old / decay_half_life_days)
                s = s * decay_weight

            new_meta = dict(it.meta)
            new_meta["_decay_weight"] = decay_weight
            new_meta["_query_score"] = s
            scored_item = MemoryItem(text=it.text, embedding=it.embedding, meta=new_meta)

            scored.append((s, scored_item))

        scored.sort(key=lambda x: x[0], reverse=True)
        return scored[:top_k]


# ========== RAG：把成功案例轉成「可用建議」 ==========
def _aggregate_patterns(cases: List[MemoryItem]) -> Dict[str, Any]:
    """
    把相似案例 meta 做簡單統計 -> 轉成可用規則
    """
    if not cases:
        return {
            "suggest_constraints": [],
            "weight_patch": {
                "late_penalty_mul": 1.0,
                "fatigue_mul": 1.0,
                "comfort_mul": 1.0,
                "rag_bonus": 0.0,
            },
            "notes": [],
        }

    late_false = 0.0
    late_true = 0.0
    duration_sum = 0.0
    duration_weight_sum = 0.0
    mode_counter = {}

    notes = []
    for it in cases:
        m = it.meta or {}
        w = float(m.get("_decay_weight", 1.0))

        late = bool(m.get("late", False))
        if late:
            late_true += w
        else:
            late_false += w

        d = m.get("duration")
        if isinstance(d, (int, float)):
            duration_sum += float(d) * w
            duration_weight_sum += w

        mode = m.get("mode")
        if mode:
            mode_counter[mode] = mode_counter.get(mode, 0.0) + w

        notes.append(it.text)

    avg_dur = (duration_sum / duration_weight_sum) if duration_weight_sum > 0 else None

    suggest_constraints: List[str] = []

    if late_false >= late_true + 0.5:
        suggest_constraints.append("no_late_night")

    if avg_dur is not None and avg_dur <= 120:
        suggest_constraints.append("avoid_long_block")

    total_weight = max(1.0, late_false + late_true)
    confidence = min(1.0, total_weight / 10.0)

    weight_patch = {
        "late_penalty_mul": 1.0 + (0.6 * confidence if "no_late_night" in suggest_constraints else 0.0),
        "fatigue_mul": 1.0 + (0.4 * confidence if "avoid_long_block" in suggest_constraints else 0.0),
        "comfort_mul": 1.0 + 0.5 * confidence,
        "rag_bonus": 2.0 * confidence,
    }

    return {
        "suggest_constraints": suggest_constraints,
        "weight_patch": weight_patch,
        "mode_votes": mode_counter,
        "notes": notes[:3],
    }


def rag_suggest_adjustments(
    store: MemoryStore,
    user_state_text: str,
    userid: Optional[str] = None,
    top_k: int = 5,
    success_only: bool = False, #可改變
    recent_n: Optional[int] = None,
    decay_half_life_days: Optional[int] = None,
) -> Dict[str, Any]:
    """
    入口：給你一句「我今天很累/明天排輕鬆」 + 任務描述，回傳建議
    """
    filters = {"userid": userid} if userid else None
    hits = store.query(
        query_text=user_state_text,
        top_k=top_k,
        filters=filters,
        min_success_only=success_only,
        recent_n=recent_n,
        decay_half_life_days=decay_half_life_days,
    )
    cases = [it for _, it in hits]
    agg = _aggregate_patterns(cases)

    agg["top_hits"] = [
        {"score": float(score), "text": it.text, "meta": it.meta}
        for score, it in hits
    ]
    return agg


def make_time_range(start_time: str, duration_minutes: int) -> str:
    start = datetime.strptime(start_time, "%H:%M")
    actual_end = start + timedelta(minutes=duration_minutes)

    floored_start_minute = 0 if start.minute < 30 else 30
    rounded_start = start.replace(minute=floored_start_minute, second=0, microsecond=0)

    floored_end_minute = 0 if actual_end.minute < 30 else 30
    rounded_end = actual_end.replace(minute=floored_end_minute, second=0, microsecond=0)

    return f"{rounded_start.strftime('%H:%M')}~{rounded_end.strftime('%H:%M')}"


def ingest_task_event(payload: Dict[str, Any], userid: str, store_path: Optional[str] = MEMORY_PATH) -> None:
    title = str(payload.get("title", "")).strip()
    content = str(payload.get("content", "")).strip()
    date = str(payload.get("date", ""))
    time = str(payload.get("time", ""))
    duration = payload.get("duration")
    finished_energy_level = str(payload.get("finishedEnergyLevel", "普通")).strip() or "普通"
    finished_completion_status = str(payload.get("finishedCompletionStatus", "完成")).strip() or "完成"
    
    energy_to_mode = {"輕鬆": "relaxed", "普通": "normal", "疲勞": "push"}
    mode = energy_to_mode.get(finished_energy_level, "normal")
    status_to_TF = {"完成": True, "非準時完成": True, "未完成": False}
    status = status_to_TF.get(finished_completion_status, False)
    time_range = make_time_range(time, duration) if time and duration else ""

    text = (
        f"排程:{title}, 內容:{content}, 持續時間:{duration} 狀態:{mode}"
    )

    meta = {
      "userid": userid,
      "date": date,
      "time": time,
      "mode": mode,
      "late": True if finished_completion_status == "非準時完成" else False,
      "duration": duration,
      "time_range": time_range,
      "success": status,
    }

    store = MemoryStore(path=store_path)
    store.add(text=text, meta=meta, auto_embed=True)


if __name__ == "__main__":
    if len(sys.argv) > 1:
        try:
            payload = json.loads(sys.argv[1])
            userid = sys.argv[2] if len(sys.argv) > 2 else "demo"
            if not isinstance(payload, dict):
                raise ValueError("傳入的 JSON 必須是一個物件")
            ingest_task_event(payload, userid)
            print(json.dumps({"ok": True}, ensure_ascii=False))
        except Exception as e:
            print(f"[rag_memory]插入失敗: {e}", file=sys.stderr)
            sys.exit(1)
    else:
        print(json.dumps({"ok": False, "error": "傳入的 JSON 格式不正確"}, ensure_ascii=False))
        sys.exit(1)