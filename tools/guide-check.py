#!/usr/bin/env python3
"""「증권사별 CSV 받는 법」 토글 실화면 점검 — Playwright headless (모바일 390x844).

사용법:
    python3 tools/guide-check.py                 # 로컬 서버를 직접 띄워 점검
    python3 tools/guide-check.py https://taxmoa.com live

점검 항목
  1) CSV 탭 상단·파일 업로드 영역 위에 토글이 있고 처음에는 닫혀 있는지
  2) 토글을 누르면 열리고 다시 누르면 닫히는지
  3) 증권사 6개 탭이 390px 폭에서 잘리거나 겹치지 않는지(가로 스크롤 없음)
  4) 6개 탭을 차례로 눌러 해당 안내만 보이는지
  5) 펼친 상태에서도 페이지 가로 스크롤이 없는지, 업로드 영역이 그대로 동작하는지
스크린샷: /workspace/downloads/us-stock-tax/
"""
import os
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = "/workspace/downloads/us-stock-tax"
os.makedirs(OUT, exist_ok=True)

BASE = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "http://127.0.0.1:4173"
TAG = sys.argv[2] if len(sys.argv) > 2 else "local"

BROKERS = [
    ("kiwoom", "키움증권"),
    ("shinhan", "신한투자증권"),
    ("samsung", "삼성증권"),
    ("nh", "NH투자증권"),
    ("toss", "토스증권"),
    ("mirae", "미래에셋증권"),
]

results = []


def check(name, ok, detail=""):
    results.append((ok, name, detail))
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))


def scroll_to(page, sel, extra=0):
    """붙박이 상단 바·탭 아래로 대상 요소를 가져온다(두 번 재서 보정)."""
    page.evaluate(
        """([sel, extra]) => {
            const el = document.querySelector(sel);
            if (!el) return;
            const bar = document.querySelector('.topbar');
            const tabs = document.querySelector('.tabs');
            const offset = (bar ? bar.offsetHeight : 0) + (tabs ? tabs.offsetHeight : 0) + 8 - extra;
            window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - offset), behavior: 'instant' });
        }""",
        [sel, extra],
    )
    page.wait_for_timeout(120)
    page.evaluate(
        """([sel, extra]) => {
            const el = document.querySelector(sel);
            const tabs = document.querySelector('.tabs');
            const bar = document.querySelector('.topbar');
            if (!el) return;
            const limit = Math.max(
                tabs ? tabs.getBoundingClientRect().bottom : 0,
                bar ? bar.getBoundingClientRect().bottom : 0
            );
            const gap = el.getBoundingClientRect().top - limit - 8 + extra;
            window.scrollBy({ top: gap, behavior: 'instant' });
        }""",
        [sel, extra],
    )
    page.wait_for_timeout(300)


def start_server():
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=ROOT, **kwargs)

        def translate_path(self, path):
            local = super().translate_path(path)
            if not os.path.exists(local):
                clean = path.split("?", 1)[0].split("#", 1)[0]
                if not os.path.splitext(clean)[1]:
                    candidate = local.rstrip("/") + ".html"
                    if os.path.exists(candidate):
                        return candidate
            return local

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 4173), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


server = None
if BASE.startswith("http://127.0.0.1"):
    server = start_server()

with sync_playwright() as p:
    browser = p.chromium.launch(args=["--no-sandbox"])
    ctx = browser.new_context(
        viewport={"width": 390, "height": 844},
        device_scale_factor=2,
        is_mobile=True,
        has_touch=True,
        user_agent=(
            "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) "
            "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
        ),
        locale="ko-KR",
        timezone_id="Asia/Seoul",
    )
    page = ctx.new_page()
    page.add_init_script(
        "document.addEventListener('DOMContentLoaded', () => {"
        "const s = document.createElement('style');"
        "s.textContent = 'html{scroll-behavior:auto !important}';"
        "document.head.appendChild(s);});"
    )
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))

    page.goto(f"{BASE}/", wait_until="networkidle")
    page.click("#tab-csv")
    page.wait_for_timeout(300)

    # ── 1. 위치·초기 상태 ─────────────────────────────
    check("토글 보임", page.is_visible("#csv-help"))
    check("처음에는 닫힘", page.evaluate("() => !document.getElementById('csv-help').open"))
    check("안내 본문은 접힌 상태에서 안 보임", page.locator(".csv-help-body").is_visible() is False)
    order = page.evaluate(
        """() => {
            const help = document.getElementById('csv-help');
            const drop = document.getElementById('csv-drop');
            return !!(help.compareDocumentPosition(drop) & Node.DOCUMENT_POSITION_FOLLOWING);
        }"""
    )
    check("업로드 영역 위에 있음", order)
    label = page.inner_text(".ch-label").strip()
    check("버튼 이름", label == "증권사별 CSV 받는 법", label)
    check("증권사 수 배지", page.inner_text(".ch-note").strip() == "6개 증권사")

    scroll_to(page, "#panel-csv .privacy-badge")
    page.screenshot(path=os.path.join(OUT, f"{TAG}-20-csv-help-closed.png"))

    # ── 2. 열고 닫기 ──────────────────────────────────
    page.click(".csv-help-btn")
    page.wait_for_timeout(300)
    check("누르면 열림", page.evaluate("() => document.getElementById('csv-help').open"))
    check("본문 보임", page.locator(".csv-help-body").is_visible())
    page.click(".csv-help-btn")
    page.wait_for_timeout(250)
    check("다시 누르면 닫힘", page.evaluate("() => !document.getElementById('csv-help').open"))
    page.click(".csv-help-btn")
    page.wait_for_timeout(300)

    # ── 3. 6개 탭 폭·겹침 ─────────────────────────────
    boxes = page.evaluate(
        """() => Array.from(document.querySelectorAll('.broker-tab')).map((t) => {
            const r = t.getBoundingClientRect();
            return {
                label: t.textContent.trim(), left: r.left, right: r.right,
                top: r.top, bottom: r.bottom,
                clipped: t.scrollWidth > t.clientWidth + 1
            };
        })"""
    )
    check("탭 6개", len(boxes) == 6, str([b["label"] for b in boxes]))
    inside = all(b["left"] >= 0 and b["right"] <= 390.5 for b in boxes)
    check("탭이 390px 안에 들어감", inside, str([(b["label"], round(b["left"]), round(b["right"])) for b in boxes]))
    no_clip = all(not b["clipped"] for b in boxes)
    check("증권사 이름 잘림 없음", no_clip, str([b["label"] for b in boxes if b["clipped"]]))
    same_row_ok = True
    for i in range(len(boxes) - 1):
        a, b = boxes[i], boxes[i + 1]
        if abs(a["top"] - b["top"]) < 2 and a["right"] > b["left"] + 0.5:
            same_row_ok = False
    check("같은 줄 탭끼리 겹치지 않음", same_row_ok)
    overflow = page.evaluate("() => document.documentElement.scrollWidth - window.innerWidth")
    check("펼친 상태 가로 스크롤 없음", overflow <= 1, f"초과 {overflow}px")

    # ── 4. 탭 전환 ────────────────────────────────────
    for idx, (key, name) in enumerate(BROKERS):
        page.click(f"#btab-{key}")
        page.wait_for_timeout(160)
        visible = page.evaluate(
            """() => Array.from(document.querySelectorAll('.broker-panel'))
                .filter((p) => !p.hidden).map((p) => p.id)"""
        )
        ok = visible == [f"bpanel-{key}"]
        first = page.inner_text(f"#bpanel-{key} .steps li:first-child").strip()
        check(f"{name} 탭", ok and len(first) > 5, f"보이는 패널 {visible} / 첫 줄 {first[:26]!r}")
    selected = page.evaluate(
        "() => Array.from(document.querySelectorAll('.broker-tab')).filter((t) => t.getAttribute('aria-selected') === 'true').length"
    )
    check("선택된 탭 하나", selected == 1, str(selected))

    # ── 5. 화면 캡처 ──────────────────────────────────
    page.click("#btab-kiwoom")
    page.wait_for_timeout(250)
    scroll_to(page, "#panel-csv .privacy-badge")  # 보호 배지부터 카드·가이드까지 한 화면에
    page.screenshot(path=os.path.join(OUT, f"{TAG}-21-csv-help-open.png"))
    if TAG == "live":
        page.screenshot(path=os.path.join(OUT, "live-csv-help.png"))
    page.screenshot(path=os.path.join(OUT, "taxping-csv-help.png"))
    page.locator("#csv-help").screenshot(path=os.path.join(OUT, f"{TAG}-22-csv-help-only.png"))
    page.screenshot(path=os.path.join(OUT, f"{TAG}-23-csv-help-full.png"), full_page=True)

    # ── 6. 가이드를 연 채 업로드가 그대로 되는지 ───────
    page.click("#csv-sample")
    page.wait_for_selector("#csv-result:not([hidden])", timeout=5000)
    page.wait_for_timeout(200)
    check("가이드 연 채 샘플 CSV 인식", page.inner_text("#csv-total").strip() == "269,632",
          page.inner_text("#csv-total").strip())

    # ── 7. 데스크톱(1280) 배치 ────────────────────────
    page2 = ctx.new_page()
    page2.set_viewport_size({"width": 1280, "height": 900})
    page2.goto(f"{BASE}/", wait_until="networkidle")
    page2.click("#tab-csv")
    page2.click(".csv-help-btn")
    page2.wait_for_timeout(300)
    rows = page2.evaluate(
        """() => {
            const tops = new Set(Array.from(document.querySelectorAll('.broker-tab'))
                .map((t) => Math.round(t.getBoundingClientRect().top)));
            return tops.size;
        }"""
    )
    check("데스크톱에서 탭 한 줄", rows == 1, f"{rows}줄")
    wide = page2.evaluate("() => document.documentElement.scrollWidth - window.innerWidth")
    check("데스크톱 가로 스크롤 없음", wide <= 1, f"초과 {wide}px")
    page2.locator("#csv-help").screenshot(path=os.path.join(OUT, f"{TAG}-24-csv-help-desktop.png"))

    browser.close()

if server:
    server.shutdown()

print()
fails = [r for r in results if not r[0]]
if errors:
    print("콘솔 오류:", errors)
print(f"총 {len(results)}건 중 {len(results) - len(fails)}건 통과, 실패 {len(fails)}건")
sys.exit(1 if fails or errors else 0)
