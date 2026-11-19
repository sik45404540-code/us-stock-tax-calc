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


def val(page, sel):
    return page.input_value(sel).strip()


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
            const tabbar = document.querySelector('.tabs');
            const offset = (bar ? bar.offsetHeight : 0) + (tabbar ? tabbar.offsetHeight : 0);
            const top = el.getBoundingClientRect().top + window.scrollY - offset - 12;
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
    check("index.필요경비힌트", text(page, "#hint-expenses"), "중복 입력")
    shot(page, "01-index-top")
    scroll_to(page, "#panel-calc .result")
    shot(page, "02-index-result")

    # RIA(국내시장 복귀계좌) 과세특례
    page.click("#ria-box > summary")
    page.wait_for_timeout(200)
    type_money(page, "#in-ria-gain", 20_000_000)
    page.click(".ria-chip[data-ria='may']")
    page.wait_for_timeout(200)
    check("ria.공제액", text(page, "#out-ria"), "9,000,000")
    check("ria.세액0원", text(page, "#out-total"), "0")
    check("ria.요약", text(page, "#ria-summary"), "9,000,000원 공제")
    scroll_to(page, "#ria-box")
    shot(page, "index-ria")
    page.click(".ria-chip[data-ria='none']")
    type_money(page, "#in-ria-gain", 0)
    page.wait_for_timeout(150)
    check("ria.해제후세액", text(page, "#out-total"), "1,430,000")

    # 절세 역산 탭
    page.click("#tab-plan")
    page.wait_for_timeout(200)
    check("index.역산탭", text(page, "#out-need"), "6,500,000")
    page.click("#tab-calc")

    # ── 2. 배당소득세 ────────────────────────────────
    page.goto(f"{BASE}/dividend", wait_until="networkidle")
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
    page.goto(f"{BASE}/dividend", wait_until="networkidle")
    type_money(page, "#in-domestic", 10_000_000)
    check("dividend.분리과세", text(page, "#out-total"), "1,540,000")
    check("dividend.종결안내", text(page, "#out-note"), "원천징수로 종결")

    # 배당 Gross-up 예시: 국내 배당 3,000만 + 근로소득금액 5,000만
    page.goto(f"{BASE}/dividend", wait_until="networkidle")
    type_money(page, "#in-domestic", 30_000_000)
    type_money(page, "#in-other", 50_000_000)
    check("dividend.가산액", text(page, "#cmp-grossup"), "1,000,000")
    check("dividend.배당세액공제", text(page, "#cmp-div-credit"), "1,000,000")
    check("dividend.국내납부", text(page, "#cmp-national"), "11,748,000")
    check("dividend.추가납부", text(page, "#out-extra"), "7,128,000")
    scroll_to(page, "#cmp-card")
    shot(page, "dividend-fixed")

    # ── 3. ISA ───────────────────────────────────────
    page.goto(f"{BASE}/isa", wait_until="networkidle")
    check("isa.h1", text(page, "h1"), "ISA 절세 계산기")
    check("isa.예시기본값", val(page, "#in-profit"), "5,000,000")
    check("isa.예시계산", text(page, "#out-saving"), "1,023,000")
    check("isa.비교표", text(page, "#cmp-net"), "15,000,000")
    page.click("button[data-type='lowIncome']")
    page.wait_for_timeout(200)
    check("isa.서민형절세", text(page, "#out-saving"), "1,221,000")
    check("isa.비과세한도", text(page, ".meter-cap"), "4,000,000원")
    scroll_to(page, "#panel-isa .result, .card.result")
    shot(page, "05-isa-result")

    # ── 4. 수수료 ────────────────────────────────────
    page.goto(f"{BASE}/fee", wait_until="networkidle")
    check("fee.h1", text(page, "h1"), "수수료·환전우대 비교기")
    check("fee.차이", text(page, "#out-diff"), "61,415")
    check("fee.A실수령", text(page, "#out-a"), "10,984,605")
    check("fee.B실수령", text(page, "#out-b"), "10,923,190")
    shot(page, "06-fee-result")
    scroll_to(page, ".card.result")
    shot(page, "07-fee-cost")
    scroll_to(page, "#cost-body")
    shot(page, "08-fee-breakdown")

    # ── 5. 증여세 ────────────────────────────────────
    page.goto(f"{BASE}/gift", wait_until="networkidle")
    check("gift.h1", text(page, "h1"), "증여세 계산기")
    check("gift.기본세액", text(page, "#g-total"), "4,850,000")
    check("gift.과세표준", text(page, "#g-base"), "50,000,000")
    check("gift.영수증마지막", text(page, "#g-receipt tr.is-total th"), "납부할 증여세")

    page.select_option("#g-relation", "spouse")
    page.wait_for_timeout(150)
    type_money(page, "#g-amount", 600_000_000)
    check("gift.배우자6억", text(page, "#g-total"), "0")
    check("gift.공제안내", text(page, "#g-zero-title"), "공제 한도 안")

    type_money(page, "#g-amount", 1_000_000_000)
    check("gift.배우자10억", text(page, "#g-total"), "67,900,000")
    check("gift.적용세율", text(page, "#g-rate"), "20%")
    scroll_to(page, "#pg-gift .result")
    shot(page, "gift")

    page.select_option("#g-relation", "parentAdult")
    page.wait_for_timeout(150)
    type_money(page, "#g-amount", 300_000_000)
    check("gift.성인자녀3억", text(page, "#g-total"), "38,800,000")
    check("gift.혼인공제가능", str(page.is_enabled("#g-marriage")), "True")
    page.check("#g-marriage")
    page.wait_for_timeout(150)
    check("gift.혼인공제", text(page, "#g-total"), "19,400,000")
    page.uncheck("#g-marriage")
    page.check("#g-skip")
    page.wait_for_timeout(150)
    check("gift.세대생략30", text(page, "#g-total"), "50,440,000")
    check("gift.미성년토글", str(page.is_visible("#g-minor-row")), "True")
    page.uncheck("#g-skip")

    page.click(".seg-xs button[data-unit='man']")
    type_money(page, "#g-amount", 5)
    check("gift.만원입력", val(page, "#g-amount"), "5")
    check("gift.만원계산", text(page, "#g-total"), "0")
    page.click(".seg-xs button[data-unit='won']")
    page.click(".preset[data-preset='100000000']")
    page.wait_for_timeout(120)
    check("gift.프리셋", val(page, "#g-amount"), "100,000,000")

    # 배우자 증여 절세
    page.click("#tab-spouse")
    page.wait_for_timeout(250)
    check("spouse.h2", text(page, "#pg-spouse h2"), "지금 팔까")
    check("spouse.절세액", text(page, "#s-saving"), "43,450,000")
    check("spouse.A안", text(page, "#s-tax-a"), "43,450,000")
    check("spouse.B안", text(page, "#s-tax-b"), "0")
    type_money(page, "#s-value", 800_000_000)
    type_money(page, "#s-cost", 200_000_000)
    check("spouse.8억절세", text(page, "#s-saving"), "102,350,000")
    check("spouse.8억증여세", text(page, "#s-tax-b"), "29,100,000")
    check("spouse.1년내매도", text(page, "#s-early-text"), "154,148,000")
    scroll_to(page, "#pg-spouse .result")
    shot(page, "15-gift-spouse")
    page.click("#tab-gift")

    # 증여세 안내 문구
    page.goto(f"{BASE}/gift", wait_until="networkidle")
    guide = text(page, "#guide")
    check("gift.기타친족현행", guide, "4촌 이내 혈족 · 3촌 이내 인척")
    check("gift.기타친족종전", guide, "6촌 이내 혈족·4촌 이내 인척")
    faq_all = page.evaluate("() => document.querySelector('#faq').textContent")
    check("gift.1억FAQ", faq_all, "485만 원")

    # 양도세 연말 12/30 표기
    page.goto(f"{BASE}/", wait_until="networkidle")
    check("index.12월30일", text(page, "#guide"), "2027년 귀속 가능성 높음 · 비권장")

    # ── 6. 상단 내비게이션(6개) ───────────────────────
    page.goto(f"{BASE}/gift", wait_until="networkidle")
    nav = page.evaluate(
        """() => {
            const n = document.querySelector('.hubnav');
            const links = [...n.querySelectorAll('a')];
            return {
                items: links.map(a => a.textContent.trim()).join(','),
                sw: n.scrollWidth, cw: n.clientWidth,
                rows: new Set(links.map(a => Math.round(a.getBoundingClientRect().top))).size,
                doc: document.documentElement.scrollWidth, win: window.innerWidth,
            };
        }"""
    )
    check("nav.6개항목", nav["items"], "양도세,배당세,ISA,수수료,증여세,소개")
    check("nav.가로스크롤없음", str(nav["sw"] <= nav["cw"] + 1), "True")
    check("nav.한줄", str(nav["rows"] == 1), "True")
    check("nav.본문넘침없음", str(nav["doc"] <= nav["win"] + 1), "True")
    shot(page, "16-gift-nav")

    # ── 7. 정보 페이지 ───────────────────────────────
    page.goto(f"{BASE}/about", wait_until="networkidle")
    check("about.h1", text(page, "h1"), "계산은 가볍게")
    shot(page, "09-about")
    page.goto(f"{BASE}/contact", wait_until="networkidle")
    check("contact.메일", text(page, "main"), "sik45404540@gmail.com")
    shot(page, "10-contact")
    page.goto(f"{BASE}/privacy", wait_until="networkidle")
    check("privacy.광고고지", text(page, "main"), "Google AdSense")

    # ── 8. 링크·구조 점검 ────────────────────────────
    page.goto(f"{BASE}/", wait_until="networkidle")
    for href, want in [
        ("a[href='dividend']", "dividend"),
        ("a[href='isa']", "isa"),
        ("a[href='fee']", "fee"),
        ("a[href='gift']", "gift"),
        ("a[href='about']", "about"),
        ("a[href='contact']", "contact"),
        ("a[href='privacy']", "privacy"),
    ]:
        check(f"link {want}", page.get_attribute(href, "href"), want)

    browser.close()

print()
fails = [r for r in results if not r[0]]
if errors:
    print("콘솔 오류:", errors)
print(f"총 {len(results)}건 중 {len(results) - len(fails)}건 통과, 실패 {len(fails)}건")
sys.exit(1 if fails or errors else 0)
