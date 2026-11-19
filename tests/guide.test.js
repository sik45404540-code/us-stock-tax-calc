import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * 「증권사별 CSV 받는 법」 가이드(index.html) 마크업 회귀 검사.
 *  - CSV 탭 파일 업로드 영역 위에 접히는 토글이 있는지 (초기 상태 닫힘)
 *  - 6개 증권사 탭/패널이 짝을 맞추는지
 *  - 증권사별 메뉴 경로·HTS 번호 같은 핵심 안내가 빠지지 않았는지
 */

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const guide = html.slice(
  html.indexOf('<details class="csv-help"'),
  html.indexOf('</details>', html.indexOf('<details class="csv-help"'))
);

const BROKERS = [
  { id: 'kiwoom', name: '키움증권' },
  { id: 'shinhan', name: '신한투자증권' },
  { id: 'samsung', name: '삼성증권' },
  { id: 'nh', name: 'NH투자증권' },
  { id: 'toss', name: '토스증권' },
  { id: 'mirae', name: '미래에셋증권' },
];

test('가이드 토글이 CSV 파일 업로드 영역 위에 있고 처음엔 닫혀 있다', () => {
  const guideAt = html.indexOf('<details class="csv-help"');
  const dropAt = html.indexOf('id="csv-drop"');
  assert.ok(guideAt > -1, 'csv-help details가 없다');
  assert.ok(dropAt > -1, 'csv-drop이 없다');
  assert.ok(guideAt < dropAt, '가이드가 업로드 영역 위에 있지 않다');

  const openTag = html.slice(guideAt, html.indexOf('>', guideAt) + 1);
  assert.ok(!/\bopen\b/.test(openTag), 'details가 열린 채로 시작한다');
  assert.match(html, /<summary class="csv-help-btn">/);
  assert.match(html, /<span class="ch-label">증권사별 CSV 받는 법<\/span>/);
});

test('증권사 6개 탭과 패널이 1:1로 짝을 이룬다', () => {
  assert.equal((html.match(/<button class="broker-tab[ "]/g) ?? []).length, 6);
  assert.equal((html.match(/class="broker-panel"/g) ?? []).length, 6);

  for (const { id, name } of BROKERS) {
    const tab = new RegExp(`id="btab-${id}"[^>]*aria-controls="bpanel-${id}"`);
    assert.match(html, tab, `${name} 탭 없음`);
    assert.match(html, new RegExp(`>${name}</button>`), `${name} 탭 이름 없음`);
    const panel = new RegExp(
      `role="tabpanel" id="bpanel-${id}" aria-labelledby="btab-${id}"`
    );
    assert.match(html, panel, `${name} 패널 없음`);
  }

  const selected = guide.match(/aria-selected="true"/g) ?? [];
  assert.equal(selected.length, 1, '처음 선택된 증권사 탭은 하나여야 한다');
  assert.match(guide, /id="btab-kiwoom"[^>]*aria-selected="true"/);
});

test('처음에는 첫 증권사 패널만 보인다', () => {
  const panels = html.match(/<div class="broker-panel"[^>]*>/g) ?? [];
  assert.equal(panels.length, 6);
  assert.ok(!/\bhidden\b/.test(panels[0]), '키움 패널이 숨겨져 있다');
  for (const p of panels.slice(1)) {
    assert.ok(/\bhidden\b/.test(p), '첫 패널 뒤의 패널이 보이는 상태다');
  }
});

test('증권사별 핵심 메뉴 경로·HTS 번호가 남아 있다', () => {
  const must = [
    '[3141]',
    '[7880]',
    '뱅킹/업무 › 서류발급/조회 › 해외주식 양도세 계산내역',
    '세금안내/신고대행 서비스 신청 › 신고관련 보조자료',
    '취득일자별 내역',
    '해외주식양도세조회',
    '양도일자별 세부내역',
    '[6067]',
    '뱅킹/계좌정보 › 서비스신청 › 증명서 발급신청 › 해외주식 양도소득세',
    '해외주식 양도소득세 증명서',
    '[9467]',
    '[9468]',
    '서비스 신청/관리 › 증명서 발급/조회 › 해외주식 양도소득세',
  ];
  for (const text of must) {
    assert.ok(html.includes(text), `안내 문구 누락: ${text}`);
  }
  assert.equal((html.match(/CSV\(쉼표로 분리\)/g) ?? []).length >= 7, true);
});

test('가이드 탭 전환이 app.js에서 연결된다', () => {
  const app = readFileSync(new URL('../assets/app.js', import.meta.url), 'utf8');
  assert.match(app, /import \{ mountCsvGuide \} from '\.\/guide\.js';/);
  assert.match(app, /mountCsvGuide\(\);/);
});
