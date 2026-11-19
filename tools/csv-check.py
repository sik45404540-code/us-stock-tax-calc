#!/usr/bin/env python3
"""CSV 불러오기 탭 실화면 점검 — Playwright headless (모바일 390x844).

사용법:
    python3 tools/csv-check.py                 # 로컬 서버를 직접 띄워 점검
    python3 tools/csv-check.py https://taxmoa.com live

점검 항목
  1) 4개 탭이 390px 폭에 겹치지 않고 들어가는지
  2) 개인정보 보호 배지 문구
  3) 샘플 CSV(CP949) → 인코딩 자동 판별 → 이익/손실/필요경비/세액/종목별 표
  4) 컬럼 매핑 드롭다운으로 수수료를 빼면 필요경비가 0원이 되는지
  5) 머리글을 못 알아보는 파일을 올렸을 때 경고 + 수동 매핑으로 복구되는지
  6) '세액 계산에 바로 반영하기' → 세액 계산 탭 값·세액이 채워지는지
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

results = []


def check(name, ok, detail=""):
    results.append((ok, name, detail))
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))


def text(page, sel):
    return page.inner_text(sel).strip()


def scroll_to(page, sel):
    """상단 바 + 붙박이 탭 높이를 빼고 그 위치로 이동한다."""
    page.evaluate(
        """(sel) => {
            const el = document.querySelector(sel);
            if (!el) return;
            const bar = document.querySelector('.topbar');
            const tabs = document.querySelector('.tabs');
            const offset = (bar ? bar.offsetHeight : 0) + (tabs ? tabs.offsetHeight : 0) + 8;
            const top = el.getBoundingClientRect().top + window.scrollY - offset;
            window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
        }""",
        sel,
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

# 머리글을 일부러 낯설게 만든 파일 (수동 매핑 확인용, CP949)
manual_path = "/tmp/manual-map.csv"
with open(manual_path, "wb") as fp:
    fp.write(
        "코드,처분일,이익금,비용\nNVDA,2026-03-12,\"2,000,000\",2,000\nTSLA,2026-05-08,\"-500,000\",1,500\n".encode("cp949")
    )

usd_path = "/tmp/usd-realized.csv"
with open(usd_path, "w", encoding="utf-8-sig") as fp:
    fp.write(
        "Symbol,Realized P/L ($),Commission ($)\n"
        "NVDA,500.00,2.00\n"
        "TSLA,-100.00,1.00\n"
    )

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

    # ── 1. 탭 4개가 390px에 들어가는지 ─────────────────
    tabs = page.locator(".tab")
    check("탭 개수", tabs.count() == 4, f"{tabs.count()}개")
    boxes = page.evaluate(
        """() => Array.from(document.querySelectorAll('.tab')).map((t) => {
            const r = t.getBoundingClientRect();
            return { label: t.textContent.trim(), left: r.left, right: r.right, top: r.top, bottom: r.bottom };
        })"""
    )
    within = all(b["left"] >= 0 and b["right"] <= 390.5 for b in boxes)
    no_overlap = all(boxes[i]["right"] <= boxes[i + 1]["left"] + 0.5 for i in range(len(boxes) - 1))
    check("탭이 390px 안에 들어감", within, str([(b["label"], round(b["left"]), round(b["right"])) for b in boxes]))
    check("탭끼리 겹치지 않음", no_overlap)
    overflow = page.evaluate("() => document.documentElement.scrollWidth - window.innerWidth")
    check("가로 스크롤 없음", overflow <= 1, f"초과 {overflow}px")
    labels = [b["label"] for b in boxes]
    check("4번째 탭 이름", labels[-1] == "CSV 불러오기", labels[-1])

    # ── 2. CSV 탭 + 보호 배지 ──────────────────────────
    page.click("#tab-csv")
    page.wait_for_timeout(250)
    check("탭 전환", page.is_visible("#panel-csv"))
    badge = text(page, "#panel-csv .privacy-badge")
    check("보호 배지 문구", "내 기기 브라우저 안에서만 계산되며 서버로 전송되지 않습니다" in badge, badge[:60])
    check("샘플 버튼 보임", page.is_visible("#csv-sample"))
    check("파일 선택 input", page.locator("#csv-file").count() == 1)
    scroll_to(page, "#panel-csv .card")
    page.screenshot(path=os.path.join(OUT, f"{TAG}-10-csv-empty.png"))

    # ── 3. 샘플 CSV 체험하기 ───────────────────────────
    page.click("#csv-sample")
    page.wait_for_selector("#csv-result:not([hidden])", timeout=5000)
    page.wait_for_timeout(200)
    checks = {
        "#csv-total": "269,632",
        "#csv-profit": "4,500,000원",
        "#csv-loss": "750,000원",
        "#csv-fee": "24,400원",
        "#csv-base": "1,225,600원",
        "#csv-rows": "8건",
    }
    for sel, want in checks.items():
        got = text(page, sel)
        check(f"샘플 {sel}", got == want, f"화면 {got!r} / 기대 {want!r}")
    status = text(page, "#csv-status")
    check("인코딩 표시", "EUC-KR" in status and "8건" in status, status)
    symbol_rows = page.locator("#csv-symbols tr").count()
    check("종목별 표 8줄", symbol_rows == 8, f"{symbol_rows}줄")
    first_symbol = text(page, "#csv-symbols tr:first-child th")
    check("1등 종목", first_symbol == "아마존(AMZN)", first_symbol)
    check("합계 줄 제외 안내", "합계 줄 1개" in text(page, "#csv-note"), text(page, "#csv-note"))

    scroll_to(page, "#panel-csv .privacy-badge")
    page.screenshot(path=os.path.join(OUT, f"{TAG}-11-csv-top.png"))
    page.screenshot(path=os.path.join(OUT, "taxping-csv.png"))
    scroll_to(page, "#csv-result")
    page.screenshot(path=os.path.join(OUT, f"{TAG}-12-csv-result.png"))
    page.screenshot(path=os.path.join(OUT, "taxping-csv-result.png"))
    scroll_to(page, "#csv-map")
    page.wait_for_timeout(200)
    page.screenshot(path=os.path.join(OUT, f"{TAG}-13-csv-mapping.png"))
    page.screenshot(path=os.path.join(OUT, f"{TAG}-14-csv-full.png"), full_page=True)

    # ── 4. 컬럼 매핑 폴백 ──────────────────────────────
    fee_select = page.locator(".map-select").nth(4)  # FIELD_ORDER: name,pnl,sell,buy,fee,...
    check("수수료 매핑 자동", fee_select.input_value() == "5", fee_select.input_value())
    fee_select.select_option("-1")
    page.wait_for_timeout(200)
    check("수수료 사용 안 함 → 필요경비 0원", text(page, "#csv-fee") == "0원", text(page, "#csv-fee"))
    fee_select.select_option("5")
    page.wait_for_timeout(200)
    check("수수료 되살림 → 24,400원", text(page, "#csv-fee") == "24,400원", text(page, "#csv-fee"))

    # ── 5. 낯선 머리글 파일: 경고 + 수동 매핑 ──────────
    page.click("#csv-reset")
    page.wait_for_timeout(150)
    page.set_input_files("#csv-file", manual_path)
    page.wait_for_timeout(500)
    warning = text(page, "#csv-warnings")
    check("낯선 머리글 경고", "컬럼을 찾지 못했습니다" in warning, warning[:80])
    pnl_index = page.evaluate(
        "() => Array.from(document.querySelectorAll('.map-select'))[1].options.length"
    )
    check("매핑 드롭다운에 컬럼 4개+사용안함", pnl_index == 5, f"{pnl_index}")
    page.locator(".map-select").nth(1).select_option("2")  # 이익금 → 실현손익
    page.wait_for_timeout(200)
    check("수동 매핑 후 이익 2,000,000원", text(page, "#csv-profit") == "2,000,000원", text(page, "#csv-profit"))
    check("수동 매핑 후 손실 500,000원", text(page, "#csv-loss") == "500,000원", text(page, "#csv-loss"))
    check("원화 파일에는 환율칸 숨김", page.locator("#csv-fx-field").is_visible() is False)

    # ── 5-2. 달러 파일: 환율 입력칸이 나타나고 환산되는지 ──
    page.click("#csv-reset")
    page.set_input_files("#csv-file", usd_path)
    page.wait_for_timeout(500)
    check("달러 파일 환율칸 표시", page.locator("#csv-fx-field").is_visible())
    check("달러 이익 환산(1,380원)", text(page, "#csv-profit") == "690,000원", text(page, "#csv-profit"))
    page.fill("#csv-fx", "1400")
    page.dispatch_event("#csv-fx", "change")
    page.wait_for_timeout(300)
    check("환율 1,400 적용", text(page, "#csv-profit") == "700,000원", text(page, "#csv-profit"))
    check("환산 안내 문구", "달러 금액은 환율" in text(page, "#csv-note"), text(page, "#csv-note"))

    # ── 5-3. 끌어다 놓기(drag & drop) ─────────────────
    page.click("#csv-reset")
    page.evaluate(
        """async () => {
            const text = '종목명,실현손익\\nNVDA,"1,000,000"\\nTSLA,"-250,000"\\n';
            const file = new File([new TextEncoder().encode(text)], 'drop.csv', { type: 'text/csv' });
            const dt = new DataTransfer();
            dt.items.add(file);
            const zone = document.getElementById('csv-drop');
            zone.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }));
            zone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
        }"""
    )
    page.wait_for_timeout(600)
    check("끌어다 놓기로 읽기", text(page, "#csv-profit") == "1,000,000원", text(page, "#csv-profit"))
    check("끌어다 놓은 손실", text(page, "#csv-loss") == "250,000원", text(page, "#csv-loss"))

    # ── 6. 세액 계산에 반영 ────────────────────────────
    page.click("#csv-reset")
    page.click("#csv-sample")
    page.wait_for_selector("#csv-result:not([hidden])")
    page.wait_for_timeout(200)
    page.click("#csv-apply")
    page.wait_for_timeout(500)
    check("세액 계산 탭으로 이동", page.is_visible("#panel-calc"))
    check("실현 이익 반영", page.input_value("#in-profit") == "4,500,000", page.input_value("#in-profit"))
    check("실현 손실 반영", page.input_value("#in-loss") == "750,000", page.input_value("#in-loss"))
    check("필요경비 반영", page.input_value("#in-expenses") == "24,400", page.input_value("#in-expenses"))
    check("예상 세액 자동 계산", text(page, "#out-total") == "269,632", text(page, "#out-total"))
    scroll_to(page, "#panel-calc .result")
    page.screenshot(path=os.path.join(OUT, f"{TAG}-15-csv-applied.png"))
    page.screenshot(path=os.path.join(OUT, "taxping-csv-applied.png"))

    # 탭으로 돌아가도 결과가 남아 있는지
    page.click("#tab-csv")
    page.wait_for_timeout(200)
    check("탭 복귀 후 결과 유지", page.is_visible("#csv-result") and text(page, "#csv-total") == "269,632")

    browser.close()

if server:
    server.shutdown()

print()
fails = [r for r in results if not r[0]]
if errors:
    print("콘솔 오류:", errors)
print(f"총 {len(results)}건 중 {len(results) - len(fails)}건 통과, 실패 {len(fails)}건")
sys.exit(1 if fails or errors else 0)
