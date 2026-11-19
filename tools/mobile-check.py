#!/usr/bin/env python3
"""모바일(390x844) 실입력 점검 — Playwright headless.

사용법:
    python3 tools/mobile-check.py https://us-stock-tax-calc.pages.dev
    python3 tools/mobile-check.py http://127.0.0.1:4173

각 계산기에 실제 값을 입력하고 화면의 결과 숫자를 확인한 뒤 스크린샷을 저장한다.
저장 위치: /workspace/downloads/us-stock-tax/
"""
import os
import sys
import time

from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:4173").rstrip("/")
OUT = "/workspace/downloads/us-stock-tax"
os.makedirs(OUT, exist_ok=True)
TAG = sys.argv[2] if len(sys.argv) > 2 else "local"

results = []


def check(name, got, want):
    ok = want in got
    results.append((ok, name, got, want))
    print(("PASS " if ok else "FAIL ") + name + f" — 화면: {got!r} / 기대 포함: {want!r}")


def text(page, sel):
    return page.inner_text(sel).strip()


def type_money(page, sel, value):
    page.click(sel)
    page.fill(sel, "")
    page.type(sel, str(value), delay=12)
    page.wait_for_timeout(120)


def scroll_to(page, sel):
    page.evaluate(
        """(sel) => {
            const el = document.querySelector(sel);
            if (!el) return;
            const bar = document.querySelector('.topbar');
            const top = el.getBoundingClientRect().top + window.scrollY - (bar ? bar.offsetHeight : 0) - 14;
            window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
        }""",
        sel,
    )
    page.wait_for_timeout(350)


def shot(page, name, full=False):
    path = os.path.join(OUT, f"{TAG}-{name}.png")
    page.screenshot(path=path, full_page=full)
    print("SHOT", path)
    return path


with sync_playwright() as p:
    browser = p.chromium.launch(args=["--no-sandbox"])
    ctx = browser.new_context(
        viewport={"width": 390, "height": 844},
        device_scale_factor=2,
        is_mobile=True,
        has_touch=True,
        user_agent=("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) "
                    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"),
        locale="ko-KR",
        timezone_id="Asia/Seoul",
    )
    page = ctx.new_page()
    # 부드러운 스크롤을 꺼서 스크린샷이 스크롤 중간에 찍히지 않게 한다
    page.add_init_script(
        "document.addEventListener('DOMContentLoaded', () => {"
        "const s = document.createElement('style');"
        "s.textContent = 'html{scroll-behavior:auto !important}';"
        "document.head.appendChild(s);});"
    )
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))

    # ── 1. 양도세 계산기 ─────────────────────────────
    page.goto(f"{BASE}/", wait_until="networkidle")
    check("index.h1", text(page, "h1"), "미국주식 양도세 계산기")
    type_money(page, "#in-profit", 12_000_000)
    type_money(page, "#in-loss", 3_000_000)
    check("index.세액", text(page, "#out-total"), "1,430,000")
    check("index.과세표준", text(page, "#out-base"), "6,500,000")
    shot(page, "01-index-top")
    scroll_to(page, "#panel-calc .result")
    shot(page, "02-index-result")

    # 절세 역산 탭
    page.click("#tab-plan")
    page.wait_for_timeout(200)
    check("index.역산탭", text(page, "#out-need"), "6,500,000")
    page.click("#tab-calc")

    # ── 2. 배당소득세 ────────────────────────────────
    page.goto(f"{BASE}/dividend.html", wait_until="networkidle")
    check("dividend.h1", text(page, "h1"), "배당소득세 계산기")
    type_money(page, "#in-domestic", 15_000_000)
    type_money(page, "#in-us", 6_000_000)
    check("dividend.총세금", text(page, "#out-total"), "3,210,000")
    check("dividend.미국세", text(page, "#out-us-tax"), "900,000")
    check("dividend.비교표", text(page, "#cmp-national"), "2,310,000")
    shot(page, "03-dividend-top")
    scroll_to(page, "#cmp-card")
    shot(page, "04-dividend-compare")

    # 2,000만 이하 분리과세
    page.goto(f"{BASE}/dividend.html", wait_until="networkidle")
    type_money(page, "#in-domestic", 10_000_000)
    check("dividend.분리과세", text(page, "#out-total"), "1,540,000")
    check("dividend.종결안내", text(page, "#out-note"), "원천징수로 종결")

    # ── 3. ISA ───────────────────────────────────────
    page.goto(f"{BASE}/isa.html", wait_until="networkidle")
    check("isa.h1", text(page, "h1"), "ISA 절세 계산기")
    type_money(page, "#in-profit", 5_000_000)
    check("isa.일반형절세", text(page, "#out-saving"), "1,023,000")
    page.click("button[data-type='lowIncome']")
    page.wait_for_timeout(200)
    check("isa.서민형절세", text(page, "#out-saving"), "1,221,000")
    check("isa.비과세한도", text(page, ".meter-cap"), "4,000,000원")
    scroll_to(page, "#panel-isa .result, .card.result")
    shot(page, "05-isa-result")

    # ── 4. 수수료 ────────────────────────────────────
    page.goto(f"{BASE}/fee.html", wait_until="networkidle")
    check("fee.h1", text(page, "h1"), "수수료·환전우대 비교기")
    check("fee.차이", text(page, "#out-diff"), "61,415")
    check("fee.A실수령", text(page, "#out-a"), "10,984,605")
    check("fee.B실수령", text(page, "#out-b"), "10,923,190")
    shot(page, "06-fee-result")
    scroll_to(page, ".card.result")
    shot(page, "07-fee-cost")
    scroll_to(page, "#cost-body")
    shot(page, "08-fee-breakdown")

    # ── 5. 정보 페이지 ───────────────────────────────
    page.goto(f"{BASE}/about.html", wait_until="networkidle")
    check("about.h1", text(page, "h1"), "계산은 가볍게")
    shot(page, "09-about")
    page.goto(f"{BASE}/contact.html", wait_until="networkidle")
    check("contact.메일", text(page, "main"), "sik45404540@gmail.com")
    shot(page, "10-contact")
    page.goto(f"{BASE}/privacy.html", wait_until="networkidle")
    check("privacy.광고고지", text(page, "main"), "Google AdSense")

    # ── 6. 링크·구조 점검 ────────────────────────────
    page.goto(f"{BASE}/", wait_until="networkidle")
    for href, want in [
        ("a[href='dividend.html']", "dividend"),
        ("a[href='isa.html']", "isa"),
        ("a[href='fee.html']", "fee"),
        ("a[href='about.html']", "about"),
        ("a[href='contact.html']", "contact"),
        ("a[href='privacy.html']", "privacy"),
    ]:
        check(f"link {want}", page.get_attribute(href, "href"), want)

    browser.close()

print()
fails = [r for r in results if not r[0]]
if errors:
    print("콘솔 오류:", errors)
print(f"총 {len(results)}건 중 {len(results) - len(fails)}건 통과, 실패 {len(fails)}건")
sys.exit(1 if fails or errors else 0)
