#!/usr/bin/env python3
"""연말정산 환급금 시뮬레이터(/yearend) 점검 — Playwright headless.

사용법:
    python3 tools/yearend-check.py http://127.0.0.1:4173 local
    python3 tools/yearend-check.py https://taxmoa.com live

모바일 390×844에서 실제 값을 입력해 화면 숫자를 확인하고, 데스크톱 1440×900과
모바일 스크린샷을 /workspace/downloads/taxping/에 저장한다.
콘솔 오류·실패한 네트워크 요청·가로 넘침도 함께 확인한다.
"""
import os
import sys

from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:4173").rstrip("/")
TAG = sys.argv[2] if len(sys.argv) > 2 else "local"
OUT = "/workspace/downloads/taxping"
os.makedirs(OUT, exist_ok=True)

results = []
console_errors = []
failed_requests = []


def check(name, got, want):
    ok = want in got
    results.append((ok, name, got, want))
    print(("PASS " if ok else "FAIL ") + name + f" — 화면: {got!r} / 기대 포함: {want!r}")


def ok(name, condition, detail=""):
    results.append((bool(condition), name, detail, "true"))
    print(("PASS " if condition else "FAIL ") + name + (f" — {detail}" if detail else ""))


def text(page, sel):
    return page.inner_text(sel).strip()


def set_money(page, sel, value):
    page.fill(sel, str(value))
    page.wait_for_timeout(160)


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        page.on("requestfailed", lambda r: failed_requests.append(f"{r.url} {r.failure}"))

        page.goto(f"{BASE}/yearend", wait_until="networkidle")
        page.wait_for_timeout(400)

        check("제목", page.title(), "연말정산 환급금 시뮬레이터")
        check("H1", text(page, "h1"), "연말정산 환급금 시뮬레이터")
        check("연말정산 내비 현재 페이지", text(page, '.hubnav a[aria-current="page"]'), "연말정산")

        # 예시 값 (총급여 5,000만 · 부양가족 3 · 카드 · 연금저축 400만+IRP 200만 · 기납부 120만)
        check("예시 결정세액", text(page, "#rc-decided"), "833,196원")
        check("예시 소득세 환급", text(page, "#out-delta2"), "+366,804원")
        check("예시 환급 합계(지방세 포함)", text(page, "#out-delta"), "+403,485")
        check("예시 과세표준", text(page, "#out-base"), "26,021,309원")
        check("예시 4대보험 추정", text(page, "#rc-insurance"), "4,858,691원")
        check("예시 카드 소득공제", text(page, "#rc-card"), "2,370,000원")
        check("예시 연금계좌 공제", text(page, "#rc-pension"), "−900,000원")
        check("예시 자녀세액공제", text(page, "#rc-child"), "−250,000원")
        check("근로소득공제 안내", text(page, "#income-read"), "12,250,000")
        check("신용카드 안내", text(page, "#card-read"), "12,500,000")

        # 30,000,000원으로 바꾸면 결정세액 0원, 기납부 전액 환급
        set_money(page, "#in-salary", "30000000")
        check("3,000만 결정세액", text(page, "#rc-decided"), "0원")
        check("3,000만 환급 합계", text(page, "#out-delta"), "+1,320,000")
        check("3,000만 세액공제 초과 안내", text(page, "#flags"), "세액공제 합계가 산출세액보다")

        # 1억 원: 카드 사용액이 25% 문턱에 못 미쳐 카드 공제 0원
        set_money(page, "#in-salary", "100000000")
        check("1억 카드 공제", text(page, "#rc-card"), "0원")
        check("1억 카드 문턱 안내", text(page, "#flags"), "최저사용금액")
        check("1억 추가 납부 표시", text(page, "#out-delta"), "−9,758,500")
        check("추가 납부 라벨", text(page, "#out-label"), "추가 납부")

        # 총급여 프리셋
        page.click('.preset[data-salary="50000000"]')
        page.wait_for_timeout(250)
        check("프리셋 5,000만 반영", page.input_value("#in-salary"), "50,000,000")
        check("프리셋 후 결정세액", text(page, "#rc-decided"), "833,196원")

        # 월세 입력
        set_money(page, "#in-rent", "6000000")
        check("월세 공제", text(page, "#rc-rent"), "−1,020,000원")
        check("월세 안내", text(page, "#rent-read"), "17%")

        # 총급여 8,000만 원 초과면 월세 공제 제외
        set_money(page, "#in-salary", "90000000")
        check("9,000만 월세 제외", text(page, "#rent-read"), "월세를 입력하고")
        check("월세 제외 안내", text(page, "#flags"), "월세 세액공제 대상이 아닙니다")

        # 출산·입양 세그먼트
        set_money(page, "#in-salary", "50000000")
        set_money(page, "#in-rent", "")
        page.click('.seg button[data-birth="second"]')
        page.wait_for_timeout(220)
        check("출산 둘째 공제", text(page, "#birth-read"), "500,000원")
        check("출산 반영 계산서", text(page, "#rc-family"), "−500,000원")

        # 고정 요약 바가 스크롤 중 하단에 붙는지
        page.evaluate("window.scrollTo({top: 900, behavior: 'instant'})")
        page.wait_for_timeout(300)
        box = page.evaluate(
            """() => {
                const el = document.querySelector('.stick-sum');
                const r = el.getBoundingClientRect();
                return { top: r.top, bottom: r.bottom, height: r.height, vh: window.innerHeight };
            }"""
        )
        ok("고정 요약 바 하단 고정", abs(box["bottom"] - box["vh"]) <= 2, f"{box}")

        # 가로 넘침
        overflow = page.evaluate("() => document.documentElement.scrollWidth - window.innerWidth")
        ok("모바일 가로 넘침 없음", overflow <= 1, f"overflow={overflow}px")

        # 주요 링크 응답
        for path in ["/", "/dividend", "/isa", "/pension", "/yearend", "/fee", "/gift", "/about"]:
            resp = page.request.get(f"{BASE}{path}")
            ok(f"링크 {path}", resp.status in (200, 308), f"status={resp.status}")

        # 내비게이션에 8개 항목
        nav_items = page.eval_on_selector_all(".hubnav a", "els => els.map(e => e.textContent.trim())")
        ok("내비 8개", len(nav_items) == 8, str(nav_items))

        page.screenshot(path=f"{OUT}/yearend-{TAG}-mobile.png", full_page=True)

        # 데스크톱
        desktop = browser.new_page(viewport={"width": 1440, "height": 900})
        desktop.on("console", lambda m: console_errors.append("desktop: " + m.text) if m.type == "error" else None)
        desktop.goto(f"{BASE}/yearend", wait_until="networkidle")
        desktop.wait_for_timeout(400)
        ok("데스크톱 결정세액", text(desktop, "#rc-decided") == "833,196원", text(desktop, "#rc-decided"))
        dover = desktop.evaluate("() => document.documentElement.scrollWidth - window.innerWidth")
        ok("데스크톱 가로 넘침 없음", dover <= 1, f"overflow={dover}px")
        desktop.screenshot(path=f"{OUT}/yearend-{TAG}-desktop.png", full_page=True)

        browser.close()

    ok("콘솔 오류 0건", len(console_errors) == 0, str(console_errors[:3]))
    ok("실패한 요청 0건", len(failed_requests) == 0, str(failed_requests[:3]))

    total = len(results)
    passed = sum(1 for r in results if r[0])
    print(f"\n{passed}/{total} 확인 통과 · 스크린샷 {OUT}/yearend-{TAG}-mobile.png, yearend-{TAG}-desktop.png")
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(run())
