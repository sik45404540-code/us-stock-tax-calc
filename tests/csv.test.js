import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseAmount,
  normalizeHeader,
  detectCurrency,
  decodeBytes,
  detectDelimiter,
  parseDelimited,
  findHeaderRow,
  mapColumns,
  isTotalRow,
  analyzeRows,
  parseCsv,
  DEFAULT_FX,
} from '../src/csv.js';
import { sampleCsvBytes } from '../src/csv-sample.js';
import { calcTax } from '../src/tax.js';

const bytesOf = (text, encoding = 'utf-8') => {
  if (encoding === 'utf-8') return new TextEncoder().encode(text);
  if (encoding === 'utf-16le') {
    const body = Buffer.from(text, 'utf16le');
    return new Uint8Array(Buffer.concat([Buffer.from([0xff, 0xfe]), body]));
  }
  throw new Error(`지원하지 않는 테스트 인코딩: ${encoding}`);
};

/* ── 숫자 파싱 ─────────────────────────────────────── */

test('숫자 파싱: 쉼표·원·달러 기호를 걷어낸다', () => {
  assert.equal(parseAmount('1,234,567'), 1234567);
  assert.equal(parseAmount('1,234,567원'), 1234567);
  assert.equal(parseAmount('₩1,234,567'), 1234567);
  assert.equal(parseAmount('$1,200.50'), 1200.5);
  assert.equal(parseAmount('1 234 567'), 1234567);
  assert.equal(parseAmount(45000), 45000);
});

test('숫자 파싱: 음수 표기 세 가지를 모두 처리', () => {
  assert.equal(parseAmount('-500,000'), -500000);
  assert.equal(parseAmount('(500,000)'), -500000);
  assert.equal(parseAmount('(1,200원)'), -1200);
  assert.equal(parseAmount('△500,000'), -500000);
  assert.equal(parseAmount('−500,000'), -500000);
  assert.equal(parseAmount('500,000-'), -500000);
});

test('숫자 파싱: 금액이 아닌 값은 null', () => {
  for (const value of ['', '   ', '-', '합계', 'N/A', 'abc', null, undefined, '1,2,3a']) {
    assert.equal(parseAmount(value), null, `${String(value)} 는 null 이어야 한다`);
  }
  assert.equal(parseAmount('0'), 0);
});

test('머리글 정규화: 괄호·공백·통화 표기를 떼고 비교한다', () => {
  assert.equal(normalizeHeader('실현손익(원)'), '실현손익');
  assert.equal(normalizeHeader('실현 손익 [KRW]'), '실현손익');
  assert.equal(normalizeHeader('Realized P/L (USD)'), 'realizedpl');
});

test('통화 추정: 머리글 표기 → 값 표기 순서', () => {
  assert.equal(detectCurrency('실현손익(원)'), 'KRW');
  assert.equal(detectCurrency('실현손익($)'), 'USD');
  assert.equal(detectCurrency('평가금액', ['$1,200', '$300']), 'USD');
  assert.equal(detectCurrency('평가금액', ['1,200', '300']), 'KRW');
});

/* ── 인코딩 ───────────────────────────────────────── */

test('인코딩: UTF-8과 UTF-8 BOM을 그대로 읽는다', () => {
  const text = '종목명,실현손익\n엔비디아,1000\n';
  assert.equal(decodeBytes(bytesOf(text)).encoding, 'utf-8');
  assert.equal(decodeBytes(bytesOf(text)).text.includes('엔비디아'), true);

  const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...bytesOf(text)]);
  const decoded = decodeBytes(withBom);
  assert.equal(decoded.encoding, 'utf-8-bom');
  assert.equal(decoded.text.startsWith('종목명'), true);
});

test('인코딩: CP949(EUC-KR) 파일을 자동으로 다시 읽는다', () => {
  const text = '종목명,실현손익\n삼성전자,1,000\n';
  // '종목명,실현손익\n삼성전자,1000\n' 를 CP949로 인코딩한 바이트 (Node는 euc-kr 인코딩을 지원하지 않는다)
  const cp949 = new Uint8Array([
    0xc1, 0xbe, 0xb8, 0xf1, 0xb8, 0xed, 0x2c, 0xbd, 0xc7, 0xc7, 0xf6, 0xbc, 0xd5, 0xc0, 0xcd, 0x0a,
    0xbb, 0xef, 0xbc, 0xba, 0xc0, 0xfc, 0xc0, 0xda, 0x2c, 0x31, 0x30, 0x30, 0x30, 0x0a,
  ]);
  const decoded = decodeBytes(cp949);
  assert.equal(decoded.encoding, 'euc-kr');
  assert.equal(decoded.text.includes('삼성전자'), true);
  assert.equal(decoded.text.includes('\uFFFD'), false);
});

test('인코딩: 엑셀이 저장한 UTF-16LE 파일도 읽는다', () => {
  const text = '종목명,실현손익\r\n테슬라,-500\r\n';
  const decoded = decodeBytes(bytesOf(text, 'utf-16le'));
  assert.equal(decoded.encoding, 'utf-16le');
  assert.equal(decoded.text.includes('테슬라'), true);
});

test('인코딩: 빈 파일은 안전하게 빈 문자열', () => {
  assert.deepEqual(decodeBytes(new Uint8Array([])), { text: '', encoding: 'empty' });
  assert.deepEqual(decodeBytes(null), { text: '', encoding: 'empty' });
});

/* ── 구분자·표 파싱 ───────────────────────────────── */

test('구분자: 탭 파일은 탭, 쉼표 파일은 쉼표를 고른다', () => {
  assert.equal(detectDelimiter('종목명\t실현손익\nNVDA\t1,000\n'), '\t');
  assert.equal(detectDelimiter('종목명,실현손익\nNVDA,"1,000"\n'), ',');
  assert.equal(detectDelimiter('a;b;c\n1;2;3\n'), ';');
});

test('표 파싱: 따옴표 안 쉼표·줄바꿈·CRLF를 지킨다', () => {
  const rows = parseDelimited('종목명,금액,비고\r\n"NVDA, Inc.","1,000","줄\n바꿈"\r\nTSLA,(500),""\r\n');
  assert.deepEqual(rows[0], ['종목명', '금액', '비고']);
  assert.deepEqual(rows[1], ['NVDA, Inc.', '1,000', '줄\n바꿈']);
  assert.deepEqual(rows[2], ['TSLA', '(500)', '']);
});

test('표 파싱: 따옴표 두 개는 따옴표 한 글자', () => {
  const rows = parseDelimited('a,b\n"그는 ""좋다""라고 했다",1\n');
  assert.equal(rows[1][0], '그는 "좋다"라고 했다');
});

test('표 파싱: 빈 줄은 버린다', () => {
  const rows = parseDelimited('a,b\n\n1,2\n\n');
  assert.equal(rows.length, 2);
});

/* ── 머리글 찾기 ──────────────────────────────────── */

test('머리글 찾기: 위쪽 조회기간 안내 줄을 건너뛴다', () => {
  const rows = parseDelimited(
    '조회기간,2026-01-01 ~ 2026-11-18,계좌,해외주식\n종목명,매도일,수량,매도금액,매수금액,수수료,실현손익\nNVDA,2026-03-12,10,100,80,1,19\n',
  );
  const header = findHeaderRow(rows);
  assert.equal(header.index, 1);
  assert.ok(header.score >= 5);
});

test('머리글 찾기: 머리글이 없으면 index -1', () => {
  const rows = parseDelimited('1,2,3\n4,5,6\n');
  assert.equal(findHeaderRow(rows).index, -1);
});

/* ── 컬럼 자동 매핑 ───────────────────────────────── */

test('컬럼 매핑: 증권사별 한글 머리글을 모두 알아본다', () => {
  const cases = [
    ['종목명', '실현손익', '매도금액', '매수금액', '수수료', '수량'],
    ['종목', '양도손익', '양도가액', '취득가액', '제비용', '매도수량'],
    ['티커', '매매손익', '매도총액', '매수총액', '거래비용', '체결수량'],
    ['종목명', '손익금액', '매도금액(원)', '매수금액(원)', '수수료합계', '총수량'],
  ];
  for (const headers of cases) {
    const { mapping } = mapColumns(headers);
    assert.equal(mapping.name, 0, headers.join(' / '));
    assert.equal(mapping.pnl, 1, headers.join(' / '));
    assert.equal(mapping.sell, 2, headers.join(' / '));
    assert.equal(mapping.buy, 3, headers.join(' / '));
    assert.equal(mapping.fee, 4, headers.join(' / '));
    assert.equal(mapping.qty, 5, headers.join(' / '));
  }
});

test('컬럼 매핑: 영문 머리글도 알아본다', () => {
  const { mapping } = mapColumns(['Symbol', 'Realized P/L', 'Proceeds', 'Cost Basis', 'Commission', 'Quantity', 'Trade Date']);
  assert.equal(mapping.name, 0);
  assert.equal(mapping.pnl, 1);
  assert.equal(mapping.sell, 2);
  assert.equal(mapping.buy, 3);
  assert.equal(mapping.fee, 4);
  assert.equal(mapping.qty, 5);
  assert.equal(mapping.date, 6);
});

test('컬럼 매핑: 매도수량을 매도금액으로 착각하지 않는다', () => {
  const { mapping } = mapColumns(['종목명', '매도수량', '실현손익']);
  assert.equal(mapping.qty, 1);
  assert.equal(mapping.sell, -1);
  assert.equal(mapping.pnl, 2);
});

test('컬럼 매핑: 평가손익·현재가는 실현손익으로 쓰지 않는다', () => {
  const { mapping } = mapColumns(['종목명', '평가손익', '현재가', '실현손익']);
  assert.equal(mapping.pnl, 3);
});

test('컬럼 매핑: 한 컬럼을 두 필드가 함께 쓰지 않는다', () => {
  const { mapping } = mapColumns(['종목명', '실현손익']);
  const used = Object.values(mapping).filter((v) => v >= 0);
  assert.equal(new Set(used).size, used.length);
});

test('합계 줄 판별', () => {
  assert.equal(isTotalRow(['합계', '', '', '3,750,000']), true);
  assert.equal(isTotalRow(['총계', '1,000']), true);
  assert.equal(isTotalRow(['Total', '100']), true);
  assert.equal(isTotalRow(['엔비디아', '670,000']), false);
});

/* ── 집계 ─────────────────────────────────────────── */

const HEADERS = ['종목명', '매도일', '수량', '매도금액', '매수금액', '수수료', '실현손익'];
const ROWS = [
  ['엔비디아', '2026-03-12', '10', '2,150,000', '1,480,000', '3,000', '670,000'],
  ['테슬라', '2026-05-08', '5', '1,320,000', '1,650,000', '2,500', '-330,000'],
  ['애플', '2026-06-21', '20', '5,480,000', '4,610,000', '4,200', '870,000'],
];
const MAPPING = { name: 0, pnl: 6, sell: 3, buy: 4, fee: 5, qty: 2, date: 1, fx: -1 };

test('집계: 이익·손실·필요경비를 나눠 더한다', () => {
  const r = analyzeRows(ROWS, MAPPING, { headers: HEADERS });
  assert.equal(r.totals.profit, 670_000 + 870_000);
  assert.equal(r.totals.loss, 330_000);
  assert.equal(r.totals.expenses, 9_700);
  assert.equal(r.totals.net, 670_000 + 870_000 - 330_000 - 9_700);
  assert.equal(r.totals.count, 3);
  assert.equal(r.currency, 'KRW');
  assert.equal(r.needsFx, false);
});

test('집계: 종목별 요약은 순손익 큰 순서', () => {
  const r = analyzeRows(ROWS, MAPPING, { headers: HEADERS });
  assert.deepEqual(r.perSymbol.map((s) => s.name), ['애플', '엔비디아', '테슬라']);
  assert.equal(r.perSymbol[2].net, -330_000);
  assert.equal(r.perSymbol[2].count, 1);
});

test('집계: 합계 줄은 두 번 세지 않는다', () => {
  const rows = [...ROWS, ['합계', '', '', '', '', '', '1,210,000']];
  const r = analyzeRows(rows, MAPPING, { headers: HEADERS });
  assert.equal(r.totals.count, 3);
  assert.equal(r.totals.totalRows, 1);
  assert.equal(r.totals.profit, 1_540_000);
});

test('집계: 실현손익이 비면 매도−매수로 계산한다', () => {
  const headers = ['종목명', '매도금액', '매수금액'];
  const rows = [
    ['NVDA', '2,150,000', '1,480,000'],
    ['TSLA', '1,320,000', '1,650,000'],
  ];
  const r = analyzeRows(rows, { name: 0, pnl: -1, sell: 1, buy: 2 }, { headers });
  assert.equal(r.totals.profit, 670_000);
  assert.equal(r.totals.loss, 330_000);
  assert.equal(r.totals.count, 2);
});

test('집계: 수수료를 필요경비로 더하지 않을 수 있다', () => {
  const withFee = analyzeRows(ROWS, MAPPING, { headers: HEADERS, feeAsExpense: true });
  const withoutFee = analyzeRows(ROWS, MAPPING, { headers: HEADERS, feeAsExpense: false });
  assert.equal(withFee.totals.expenses, 9_700);
  assert.equal(withoutFee.totals.expenses, 0);
  assert.equal(withoutFee.totals.net - withFee.totals.net, 9_700);
});

test('집계: 달러 금액은 환율 입력값으로 원화 환산', () => {
  const headers = ['종목명', '실현손익($)', '수수료($)'];
  const rows = [
    ['NVDA', '500.00', '2.00'],
    ['TSLA', '-100.00', '1.00'],
  ];
  const r = analyzeRows(rows, { name: 0, pnl: 1, fee: 2 }, { headers, fx: 1_400 });
  assert.equal(r.currency, 'USD');
  assert.equal(r.needsFx, true);
  assert.equal(r.totals.profit, 700_000);
  assert.equal(r.totals.loss, 140_000);
  assert.equal(r.totals.expenses, 4_200);
});

test('집계: 행마다 환율 컬럼이 있으면 그 값을 먼저 쓴다', () => {
  const headers = ['종목명', '실현손익($)', '환율'];
  const rows = [
    ['NVDA', '100', '1,300'],
    ['TSLA', '100', '1,400'],
  ];
  const r = analyzeRows(rows, { name: 0, pnl: 1, fx: 2 }, { headers, fx: 1_500 });
  assert.equal(r.totals.profit, 270_000);
});

test('집계: 금액을 못 읽은 줄은 skipped로 세고 결과에서 뺀다', () => {
  const rows = [...ROWS, ['안내', '', '', '', '', '', '']];
  const r = analyzeRows(rows, MAPPING, { headers: HEADERS });
  assert.equal(r.totals.count, 3);
  assert.equal(r.totals.skipped, 1);
});

test('집계: 빈 표는 0원', () => {
  const r = analyzeRows([], MAPPING, { headers: HEADERS });
  assert.deepEqual(
    { profit: r.totals.profit, loss: r.totals.loss, expenses: r.totals.expenses, count: r.totals.count },
    { profit: 0, loss: 0, expenses: 0, count: 0 },
  );
});

/* ── 끝에서 끝까지 ─────────────────────────────────── */

test('샘플 CSV: CP949 인코딩을 자동으로 알아보고 8건을 집계한다', () => {
  const r = parseCsv(sampleCsvBytes());
  assert.equal(r.encoding, 'euc-kr');
  assert.equal(r.delimiter, ',');
  assert.equal(r.headerIndex, 1); // 첫 줄 조회기간 안내는 건너뛴다
  assert.deepEqual(r.headers, ['종목명', '매도일', '수량', '매도금액', '매수금액', '수수료', '실현손익']);
  assert.equal(r.autoMapping.pnl, 'exact');
  assert.equal(r.analysis.totals.count, 8);
  assert.equal(r.analysis.totals.profit, 4_500_000);
  assert.equal(r.analysis.totals.loss, 750_000);
  assert.equal(r.analysis.totals.expenses, 24_400);
  assert.equal(r.analysis.totals.net, 3_725_600);
  assert.equal(r.analysis.totals.totalRows, 1);
  assert.deepEqual(r.warnings, []);
});

test('샘플 CSV 집계값을 세액 계산기에 그대로 넣으면 269,632원', () => {
  const r = parseCsv(sampleCsvBytes());
  const tax = calcTax({
    profit: r.analysis.totals.profit,
    loss: r.analysis.totals.loss,
    expenses: r.analysis.totals.expenses,
  });
  assert.equal(tax.taxableBase, 1_225_600);
  assert.equal(tax.totalTax, 269_632);
});

test('끝에서 끝까지: UTF-8 BOM · 탭 · 영문 머리글 파일', () => {
  const text = [
    'Symbol\tProceeds\tCost Basis\tCommission',
    'NVDA\t2,150,000\t1,480,000\t3,000',
    'TSLA\t1,320,000\t1,650,000\t2,500',
  ].join('\r\n');
  const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(text)]);
  const r = parseCsv(bytes);
  assert.equal(r.encoding, 'utf-8-bom');
  assert.equal(r.delimiter, '\t');
  assert.equal(r.analysis.totals.profit, 670_000);
  assert.equal(r.analysis.totals.loss, 330_000);
  assert.equal(r.analysis.totals.expenses, 5_500);
});

test('끝에서 끝까지: 알아보지 못한 머리글은 경고를 남긴다', () => {
  const text = '항목,값\nA,1\nB,2\n';
  const r = parseCsv(new TextEncoder().encode(text));
  assert.ok(r.warnings.some((w) => w.includes('컬럼을 찾지 못했습니다')));
  assert.equal(r.analysis.totals.count, 0);
  assert.equal(r.analysis.usedFx, DEFAULT_FX);
});
