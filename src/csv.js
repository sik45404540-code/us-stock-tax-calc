/**
 * 증권사 거래내역·실현손익 CSV 파서 (브라우저·Node 공용)
 *
 * 한국 증권사(키움·삼성·NH·미래에셋·한국투자·토스 등)에서 내려받는 파일은
 *  - 인코딩이 EUC-KR/CP949 이거나 UTF-8(BOM 포함)이고,
 *  - 머리글 이름이 회사마다 다르며,
 *  - 파일 맨 위에 조회기간 같은 안내 줄이 붙거나 맨 아래에 합계 줄이 붙는다.
 * 이 모듈은 그 세 가지를 모두 흡수해서 "실현이익 / 실현손실 / 필요경비"로 집계한다.
 *
 * 파일 내용은 절대 밖으로 나가지 않는다. 모든 계산은 브라우저 안에서 끝난다.
 */

export const DEFAULT_FX = 1380;

export const FIELD_LABELS = {
  name: '종목명',
  pnl: '실현손익',
  sell: '매도금액',
  buy: '매수금액',
  fee: '수수료·제비용',
  qty: '수량',
  date: '거래일',
  fx: '행별 환율',
};

/** 매핑 우선순위 — 종목명 → 손익 → 매도/매수 → 수수료 → 나머지 */
export const FIELD_ORDER = ['name', 'pnl', 'sell', 'buy', 'fee', 'qty', 'date', 'fx'];

const ALIASES = {
  name: [
    '종목명', '종목', '종목이름', '티커', '종목코드', '상품명', '자산명', '종목명한글',
    '종목상품명', '종목/상품명', 'symbol', 'ticker', 'name', 'security', 'securityname',
    'stock', 'stockname', 'symbolname', 'issuer', 'etf명',
  ],
  pnl: [
    '실현손익', '실현손익금액', '실현손익계', '실현손익합계', '원화실현손익', '실현손익원화',
    '양도손익', '양도손익금액', '양도차익', '매매손익', '매매손익금액', '매도손익', '처분손익',
    '손익금액', '손익', '총손익', '순손익', '해외주식양도소득', '양도소득',
    'realizedpnl', 'realizedpl', 'realizedgainloss', 'realizedgain', 'pnl', 'pl',
    'profit', 'profitloss', 'gainloss', 'grossprofit',
  ],
  sell: [
    '매도금액', '매도금액합계', '매도총액', '매도정산금액', '매도대금', '매도대금합계',
    '양도가액', '양도금액', '처분금액', '처분가액', '매도금액원',
    'sellamount', 'selltotal', 'proceeds', 'saleproceeds', 'saleamount', 'disposalamount',
  ],
  buy: [
    '매수금액', '매수금액합계', '매수총액', '매수정산금액', '매수대금',
    '취득가액', '취득금액', '매입가액', '매입금액', '취득원가',
    'buyamount', 'buytotal', 'cost', 'costbasis', 'acquisitioncost', 'purchaseamount',
  ],
  fee: [
    '수수료', '수수료합계', '수수료계', '총수수료', '매매수수료', '거래수수료', '수수료및제비용',
    '제비용', '제비용합계', '비용', '거래비용', '필요경비', '세금및수수료',
    'fee', 'fees', 'commission', 'commissions', 'total fee', 'expense', 'expenses',
  ],
  qty: [
    '수량', '매도수량', '매매수량', '체결수량', '주수', '매도주수', '보유수량', '수량주',
    'quantity', 'qty', 'shares', 'share', 'volume', 'units',
  ],
  date: [
    '매도일', '매도일자', '양도일', '양도일자', '거래일', '거래일자', '체결일', '체결일자',
    '매매일', '매수일', 'date', 'tradedate', 'settledate', 'transactiondate',
  ],
  fx: ['환율', '적용환율', '기준환율', '거래환율', '환율원', 'exchangerate', 'fx', 'rate'],
};

/** 머리글로 쓰면 안 되는 컬럼(손익·금액 열에 섞여 있으면 헷갈리므로 제외) */
const EXCLUDE = {
  pnl: /평가|잔고|보유|현재가|단가|환율|수량|비율|세율/,
  sell: /단가|평단|가격|주가|수량|비율/,
  buy: /단가|평단|가격|주가|수량|비율/,
  fee: /세율|비율|요율|단가/,
  qty: /금액|원|단가|가격/,
  fx: /금액|변동/,
};

/* ── 숫자·헤더 정규화 ─────────────────────────────── */

/** 머리글 비교용 정규화: 공백·괄호·통화표기를 떼고 소문자로 */
export function normalizeHeader(value) {
  return String(value ?? '')
    .replace(/\uFEFF/g, '')
    .toLowerCase()
    .replace(/[\s_\-./\\:·'"`]/g, '')
    .replace(/[()[\]{}]/g, '')
    .replace(/\$/g, '')
    .replace(/원|krw|usd|달러|₩/g, '');
}

/**
 * 금액 문자열 → 숫자. 쉼표, 원/달러 기호, 괄호 음수, 앞뒤 부호, △(마이너스)를 처리한다.
 * 숫자로 읽을 수 없으면 null.
 */
export function parseAmount(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value === null || value === undefined) return null;

  let s = String(value).trim();
  if (!s) return null;
  if (/^(합계|총계|소계|총합계|total|sum|n\/?a|—|–|-)$/i.test(s)) return null;

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  if (/^[-−–—△▽▼]/.test(s)) {
    negative = !negative;
    s = s.slice(1).trim();
  } else if (/^[+▲]/.test(s)) {
    s = s.slice(1).trim();
  }
  if (/[-−]$/.test(s)) {
    negative = !negative;
    s = s.slice(0, -1).trim();
  }

  s = s.replace(/[,\s]/g, '').replace(/[₩$원]/g, '').replace(/usd|krw/gi, '');
  if (!s) return null;
  if (!/^\d*\.?\d+$/.test(s)) return null;

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/** 금액 열의 통화 추정 — 머리글 표기를 우선하고, 없으면 값의 $ 표기를 본다 */
export function detectCurrency(header, values = []) {
  const h = String(header ?? '');
  if (/[$]|usd|달러/i.test(h)) return 'USD';
  if (/원|krw|₩/i.test(h)) return 'KRW';

  let usd = 0;
  let krw = 0;
  for (const v of values) {
    const s = String(v ?? '');
    if (!s) continue;
    if (/\$/.test(s)) usd += 1;
    else if (/원/.test(s)) krw += 1;
  }
  return usd > krw ? 'USD' : 'KRW';
}

/* ── 인코딩 ───────────────────────────────────────── */

function toUint8(input) {
  if (!input) return null;
  if (input instanceof Uint8Array) return input;
  if (typeof ArrayBuffer !== 'undefined' && input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  if (typeof input === 'string') {
    if (typeof TextEncoder === 'function') return new TextEncoder().encode(input);
    return new Uint8Array(Array.from(input, (c) => c.charCodeAt(0) & 0xff));
  }
  return null;
}

function tryDecode(bytes, label, fatal) {
  try {
    return new TextDecoder(label, { fatal }).decode(bytes);
  } catch (err) {
    return null;
  }
}

/**
 * 바이트 → 문자열. UTF-8(BOM 포함)을 먼저 시도하고, 깨지면 EUC-KR/CP949로 다시 읽는다.
 * 반환: { text, encoding } — encoding 은 'utf-8' | 'utf-8-bom' | 'euc-kr' | 'utf-16le' | 'utf-16be'
 */
export function decodeBytes(input) {
  const bytes = toUint8(input);
  if (!bytes) return { text: '', encoding: 'empty' };
  if (!bytes.length) return { text: '', encoding: 'empty' };

  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: new TextDecoder('utf-8').decode(bytes.subarray(3)), encoding: 'utf-8-bom' };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    const text = tryDecode(bytes.subarray(2), 'utf-16le', false);
    if (text !== null) return { text, encoding: 'utf-16le' };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    const text = tryDecode(bytes.subarray(2), 'utf-16be', false);
    if (text !== null) return { text, encoding: 'utf-16be' };
  }

  const utf8 = tryDecode(bytes, 'utf-8', true);
  if (utf8 !== null && utf8.indexOf('\uFFFD') === -1) return { text: utf8, encoding: 'utf-8' };

  const euckr = tryDecode(bytes, 'euc-kr', false) ?? tryDecode(bytes, 'windows-949', false);
  if (euckr !== null && euckr.indexOf('\uFFFD') === -1) return { text: euckr, encoding: 'euc-kr' };

  return { text: new TextDecoder('utf-8').decode(bytes), encoding: 'utf-8-lossy' };
}

/* ── 구분자·표 파싱 ───────────────────────────────── */

/**
 * 따옴표 안을 제외한 구분자 개수를 줄마다 세어, "모든 줄에서 같은 개수"가 나오는
 * 구분자를 고른다. 탭 파일에 쉼표 섞인 금액(1,234,567)이 있어도 탭을 고르기 위해서다.
 */
export function detectDelimiter(text) {
  const sample = String(text ?? '').slice(0, 8000);
  const lines = sample.split(/\r\n|\n|\r/).filter((line) => line.trim() !== '').slice(0, 30);
  if (!lines.length) return ',';

  const countOutsideQuotes = (line, delimiter) => {
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (!inQuotes && ch === delimiter) count += 1;
    }
    return count;
  };

  let best = ',';
  let bestScore = 0;
  let bestMax = 0;
  for (const delimiter of [',', '\t', ';', '|']) {
    const counts = lines.map((line) => countOutsideQuotes(line, delimiter));
    const max = Math.max(...counts);
    if (max === 0) continue;
    const consistent = counts.filter((count) => count === max).length;
    const score = consistent * 1000 + max;
    if (score > bestScore || (score === bestScore && max > bestMax)) {
      best = delimiter;
      bestScore = score;
      bestMax = max;
    }
  }
  return bestScore ? best : ',';
}

/** 따옴표·줄바꿈·CRLF를 처리하는 표 파서 */
export function parseDelimited(text, delimiter) {
  const src = String(text ?? '').replace(/^\uFEFF/, '');
  const delim = delimiter || detectDelimiter(src);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else if (ch === '\r') {
      if (src[i + 1] !== '\n') {
        row.push(field);
        field = '';
        rows.push(row);
        row = [];
      }
    } else {
      field += ch;
    }
  }

  row.push(field);
  if (row.length > 1 || String(row[0] ?? '').trim() !== '') rows.push(row);

  return rows
    .map((cells) => cells.map((cell) => String(cell ?? '').trim()))
    .filter((cells) => cells.some((cell) => cell !== ''));
}

/* ── 머리글 찾기·컬럼 매핑 ────────────────────────── */

export function scoreHeaderRow(cells = []) {
  const normalized = new Set(cells.map(normalizeHeader).filter(Boolean));
  let score = 0;
  for (const field of FIELD_ORDER) {
    if ((ALIASES[field] || []).some((alias) => normalized.has(normalizeHeader(alias)))) score += 1;
  }
  return score;
}

/** 조회기간·계좌번호 같은 안내 줄을 건너뛰고 진짜 머리글 줄을 찾는다 */
export function findHeaderRow(rows = []) {
  let best = { index: -1, score: 0 };
  const limit = Math.min(rows.length, 25);
  for (let i = 0; i < limit; i += 1) {
    const score = scoreHeaderRow(rows[i]);
    if (score > best.score) best = { index: i, score };
  }
  return best;
}

/** 머리글 배열 → 필드별 컬럼 인덱스(없으면 -1) */
export function mapColumns(headers = []) {
  const cells = headers.map(normalizeHeader);
  const used = new Set();
  const mapping = {};
  const auto = {};

  for (const field of FIELD_ORDER) {
    const aliases = (ALIASES[field] || []).map(normalizeHeader).filter(Boolean);
    const exclude = EXCLUDE[field];
    let hit = -1;
    let how = '';

    for (let i = 0; i < cells.length; i += 1) {
      if (used.has(i) || !cells[i]) continue;
      if (exclude && exclude.test(cells[i])) continue;
      if (aliases.includes(cells[i])) {
        hit = i;
        how = 'exact';
        break;
      }
    }

    if (hit < 0) {
      let bestLen = 0;
      for (let i = 0; i < cells.length; i += 1) {
        if (used.has(i) || !cells[i]) continue;
        if (exclude && exclude.test(cells[i])) continue;
        for (const alias of aliases) {
          if (alias.length >= 2 && cells[i].includes(alias) && alias.length > bestLen) {
            hit = i;
            bestLen = alias.length;
            how = 'contains';
          }
        }
      }
    }

    if (hit >= 0) {
      used.add(hit);
      mapping[field] = hit;
      auto[field] = how;
    } else {
      mapping[field] = -1;
    }
  }

  return { mapping, auto };
}

/** 맨 아래 합계·소계 줄은 데이터가 아니므로 집계에서 뺀다 */
export function isTotalRow(cells = []) {
  return cells.some((cell) => {
    const s = String(cell ?? '').trim();
    if (!s) return false;
    return /^(합계|총계|소계|총합계|합산|total|sum|grandtotal)$/i.test(s)
      || /^(합계|총계|소계|total)\s*[:：]/i.test(s);
  });
}

function normalizeMapping(mapping = {}) {
  const out = {};
  for (const field of FIELD_ORDER) {
    const value = mapping[field];
    out[field] = Number.isInteger(value) && value >= 0 ? value : -1;
  }
  return out;
}

/** 표 전체를 읽어 문자열·머리글·데이터 줄로 나눈다 */
export function parseTable(bytes, options = {}) {
  const warnings = [];
  const { text, encoding } = decodeBytes(bytes);
  if (encoding === 'utf-8-lossy') {
    warnings.push('인코딩을 확실히 알아내지 못했습니다. 글자가 깨져 보이면 엑셀에서 “CSV UTF-8”로 다시 저장해 주세요.');
  }

  const delimiter = options.delimiter || detectDelimiter(text);
  const allRows = parseDelimited(text, delimiter);
  const header = findHeaderRow(allRows);
  const headerIndex = header.index >= 0 ? header.index : 0;
  const headers = (allRows[headerIndex] || []).map((cell) => String(cell ?? '').trim());
  const rows = allRows.slice(headerIndex + 1);

  if (header.index < 0) warnings.push('머리글 줄을 찾지 못했습니다. 아래 컬럼 매핑에서 직접 지정해 주세요.');
  if (!rows.length) warnings.push('파일에 데이터 줄이 없습니다.');

  return {
    text,
    encoding,
    delimiter,
    allRows,
    headerIndex,
    headerScore: header.score,
    headers,
    rows,
    warnings,
  };
}

/**
 * 데이터 줄 + 매핑 → 이익·손실·필요경비·종목별 요약
 * options: { headers, fx, feeAsExpense }
 */
export function analyzeRows(rows = [], mapping = {}, options = {}) {
  const headers = options.headers || [];
  const fxInput = Number(options.fx);
  const fxFallback = Number.isFinite(fxInput) && fxInput > 0 ? fxInput : DEFAULT_FX;
  const feeAsExpense = options.feeAsExpense !== false;
  const map = normalizeMapping(mapping);

  const sampleOf = (idx) => {
    const out = [];
    for (let i = 0; i < Math.min(rows.length, 20); i += 1) out.push(rows[i] ? rows[i][idx] : '');
    return out;
  };
  const currency = {};
  for (const field of ['pnl', 'sell', 'buy', 'fee']) {
    currency[field] = map[field] >= 0 ? detectCurrency(headers[map[field]], sampleOf(map[field])) : 'KRW';
  }

  const items = [];
  const symbols = new Map();
  let profit = 0;
  let loss = 0;
  let expenses = 0;
  let skipped = 0;
  let totalRows = 0;
  let usedUsd = false;

  rows.forEach((cells, index) => {
    if (!Array.isArray(cells)) return;
    if (!cells.some((cell) => String(cell ?? '').trim() !== '')) return;
    if (isTotalRow(cells)) {
      totalRows += 1;
      return;
    }

    const name = map.name >= 0 ? String(cells[map.name] ?? '').trim() : '';
    let value = null;
    let unit = 'KRW';

    if (map.pnl >= 0) {
      const parsed = parseAmount(cells[map.pnl]);
      if (parsed !== null) {
        value = parsed;
        unit = currency.pnl;
      }
    }
    if (value === null && map.sell >= 0 && map.buy >= 0) {
      const sell = parseAmount(cells[map.sell]);
      const buy = parseAmount(cells[map.buy]);
      if (sell !== null && buy !== null) {
        value = sell - buy;
        unit = currency.sell === 'USD' || currency.buy === 'USD' ? 'USD' : 'KRW';
      }
    }
    if (value === null) {
      skipped += 1;
      return;
    }

    let fx = fxFallback;
    if (map.fx >= 0) {
      const rowFx = parseAmount(cells[map.fx]);
      if (rowFx !== null && rowFx > 0) fx = rowFx;
    }
    if (unit === 'USD') usedUsd = true;
    const krw = unit === 'USD' ? Math.round(value * fx) : Math.round(value);

    let feeKrw = 0;
    if (feeAsExpense && map.fee >= 0) {
      const fee = parseAmount(cells[map.fee]);
      if (fee !== null && fee !== 0) {
        feeKrw = Math.round(Math.abs(currency.fee === 'USD' ? fee * fx : fee));
      }
    }

    if (krw > 0) profit += krw;
    else if (krw < 0) loss += -krw;
    expenses += feeKrw;

    const label = name || `(이름 없음 ${index + 1})`;
    const bucket = symbols.get(label) || { name: label, count: 0, profit: 0, loss: 0, net: 0 };
    bucket.count += 1;
    bucket.net += krw;
    if (krw > 0) bucket.profit += krw;
    else if (krw < 0) bucket.loss += -krw;
    symbols.set(label, bucket);

    items.push({ index, name: label, currency: unit, raw: value, value: krw, fee: feeKrw });
  });

  const perSymbol = Array.from(symbols.values()).sort((a, b) => b.net - a.net);
  const net = profit - loss - expenses;

  return {
    items,
    perSymbol,
    currency: usedUsd ? 'USD' : 'KRW',
    needsFx: usedUsd,
    usedFx: fxFallback,
    feeAsExpense,
    totals: {
      profit,
      loss,
      expenses,
      net,
      count: items.length,
      skipped,
      totalRows,
    },
  };
}

/** 파일 바이트 → 표 + 자동 매핑 + 집계 (화면이 쓰는 한 번짜리 진입점) */
export function parseCsv(bytes, options = {}) {
  const table = parseTable(bytes, options);
  const { mapping, auto } = mapColumns(table.headers);
  const analysis = analyzeRows(table.rows, mapping, { ...options, headers: table.headers });
  table.warnings.push(...mappingWarnings(mapping, analysis));
  return { ...table, mapping, autoMapping: auto, analysis };
}

/** 매핑·집계 상태를 보고 경고 문구를 만든다 (매핑을 바꿀 때마다 다시 계산) */
export function mappingWarnings(mapping = {}, analysis = null) {
  const warnings = [];
  const has = (field) => Number.isInteger(mapping[field]) && mapping[field] >= 0;

  if (!has('pnl') && !(has('sell') && has('buy'))) {
    warnings.push('실현손익(또는 매도금액·매수금액) 컬럼을 찾지 못했습니다. 아래 컬럼 매핑에서 직접 지정해 주세요.');
  }
  if (analysis && analysis.totals && !analysis.totals.count) {
    warnings.push('금액으로 읽을 수 있는 줄이 없습니다. 컬럼 매핑을 확인해 주세요.');
  }
  return warnings;
}
