/**
 * 'CSV 불러오기' 탭 화면 — 파일 읽기·자동 매핑·집계 표시·세액 계산기 연결.
 *
 * 파일은 FileReader(arrayBuffer)로 이 기기 안에서만 읽는다. 어디로도 보내지 않는다.
 */

import {
  parseTable,
  mapColumns,
  analyzeRows,
  mappingWarnings,
  detectCurrency,
  DEFAULT_FX,
  FIELD_LABELS,
  FIELD_ORDER,
} from '../src/csv.js';
import { sampleCsvBytes } from '../src/csv-sample.js';
import { calcTax, DEDUCTION } from '../src/tax.js';

const ENCODING_LABEL = {
  'utf-8': 'UTF-8',
  'utf-8-bom': 'UTF-8(BOM)',
  'euc-kr': 'EUC-KR(CP949)',
  'utf-16le': 'UTF-16LE',
  'utf-16be': 'UTF-16BE',
  'utf-8-lossy': 'UTF-8 추정',
  empty: '빈 파일',
};

const DELIM_LABEL = { ',': '쉼표', '\t': '탭', ';': '세미콜론', '|': '파이프' };

const DEFAULT_STATUS = '증권사 앱 → 해외주식 실현손익 → 엑셀(CSV) 저장 → 위에 올리기 순서입니다.';

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('ko-KR');
const won = (n) => `${fmt(n)}원`;
const signed = (n) => {
  const v = Math.round(Number(n) || 0);
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v))}원`;
};
const digits = (value) => {
  const cleaned = String(value ?? '').replace(/[^0-9]/g, '');
  return cleaned ? Number(cleaned) : 0;
};

export function mountCsvTab({ setInput, showTab }) {
  const drop = document.getElementById('csv-drop');
  const fileInput = document.getElementById('csv-file');
  const sampleBtn = document.getElementById('csv-sample');
  const statusEl = document.getElementById('csv-status');
  const resultEl = document.getElementById('csv-result');
  const mapEl = document.getElementById('csv-map');
  const warningEl = document.getElementById('csv-warnings');
  const feeToggle = document.getElementById('csv-fee-toggle');
  const fxField = document.getElementById('csv-fx-field');
  const fxInput = document.getElementById('csv-fx');
  const applyBtn = document.getElementById('csv-apply');
  const resetBtn = document.getElementById('csv-reset');

  if (!drop || !fileInput || !resultEl) return;

  let table = null;
  let mapping = {};
  let analysis = null;
  let baseWarnings = [];
  const options = { fx: DEFAULT_FX, feeAsExpense: true };

  function setStatus(text, ok = false) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.classList.toggle('is-ok', Boolean(ok));
  }

  function usdColumns() {
    if (!table) return [];
    return ['pnl', 'sell', 'buy', 'fee'].filter((field) => {
      const idx = mapping[field];
      if (!Number.isInteger(idx) || idx < 0) return false;
      const samples = table.rows.slice(0, 20).map((row) => (row ? row[idx] : ''));
      return detectCurrency(table.headers[idx], samples) === 'USD';
    });
  }

  function analyze() {
    if (!table) return;
    analysis = analyzeRows(table.rows, mapping, { ...options, headers: table.headers });
    table.warnings = [...baseWarnings, ...mappingWarnings(mapping, analysis)];
  }

  /* ── 파일 읽기 ───────────────────────────────────── */

  function loadBytes(bytes, label) {
    const parsed = parseTable(bytes);
    table = parsed;
    mapping = { ...mapColumns(parsed.headers).mapping };
    baseWarnings = parsed.warnings.slice();
    analyze();
    resultEl.hidden = false;
    renderMapping();
    renderResult();

    const t = analysis.totals;
    if (t.count) {
      setStatus(
        `“${label}” ${t.count}건을 읽었습니다 · ${ENCODING_LABEL[parsed.encoding] || parsed.encoding} · ${DELIM_LABEL[parsed.delimiter] || '구분자'} 구분`,
        true,
      );
    } else {
      setStatus(`“${label}”에서 금액을 읽지 못했습니다. 아래 컬럼 매핑을 직접 지정해 주세요.`);
    }
  }

  async function readFile(file) {
    if (!file) return;
    const name = String(file.name || 'CSV 파일');
    if (/\.(xlsx?|numbers|ods)$/i.test(name)) {
      setStatus('엑셀 파일은 그대로 읽지 못합니다. 엑셀에서 “다른 이름으로 저장 → CSV(쉼표로 분리)”한 뒤 올려 주세요.');
      return;
    }
    try {
      const buffer = await file.arrayBuffer();
      loadBytes(new Uint8Array(buffer), name);
    } catch (err) {
      setStatus('파일을 읽지 못했습니다. 다시 시도해 주세요.');
    }
  }

  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    if (file) readFile(file);
  });

  drop.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInput.click();
    }
  });

  ['dragenter', 'dragover'].forEach((type) => {
    drop.addEventListener(type, (event) => {
      event.preventDefault();
      drop.classList.add('is-over');
    });
  });
  ['dragleave', 'dragend'].forEach((type) => {
    drop.addEventListener(type, () => drop.classList.remove('is-over'));
  });
  drop.addEventListener('drop', (event) => {
    event.preventDefault();
    drop.classList.remove('is-over');
    const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
    if (file) readFile(file);
  });

  if (sampleBtn) {
    sampleBtn.addEventListener('click', () => {
      loadBytes(sampleCsvBytes(), '샘플_실현손익_2026.csv');
    });
  }

  /* ── 표시 ────────────────────────────────────────── */

  function renderResult() {
    if (!analysis) return;
    const t = analysis.totals;
    const tax = calcTax({ profit: t.profit, loss: t.loss, expenses: t.expenses });

    document.getElementById('csv-total').textContent = fmt(tax.totalTax);
    document.getElementById('csv-profit').textContent = won(t.profit);
    document.getElementById('csv-loss').textContent = won(t.loss);
    document.getElementById('csv-fee').textContent = won(t.expenses);
    document.getElementById('csv-base').textContent = won(tax.taxableBase);
    document.getElementById('csv-rows').textContent = `${t.count}건`;

    const noteBits = [];
    if (t.count) noteBits.push(`<b>${t.count}건</b>을 반영했습니다`);
    if (t.totalRows) noteBits.push(`합계 줄 ${t.totalRows}개는 제외`);
    if (t.skipped) noteBits.push(`금액이 없는 줄 ${t.skipped}개 제외`);
    if (analysis.needsFx) noteBits.push(`달러 금액은 환율 <b>${fmt(analysis.usedFx)}원</b>으로 환산`);

    let note = noteBits.join(' · ');
    if (t.count) {
      note += tax.totalTax > 0
        ? ` · 손익 합계 <b>${won(t.net)}</b>에서 기본공제 ${won(DEDUCTION)}을 뺀 금액에 22%를 적용했습니다.`
        : ` · 손익 합계 <b>${won(t.net)}</b>이 기본공제 ${won(DEDUCTION)} 이내라 납부 세액은 0원입니다.`;
    }
    document.getElementById('csv-note').innerHTML = note || '파일을 올리면 바로 계산됩니다.';

    const body = document.getElementById('csv-symbols');
    body.innerHTML = '';
    if (!analysis.perSymbol.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 3;
      td.className = 'csv-empty';
      td.textContent = '집계된 종목이 없습니다.';
      tr.appendChild(td);
      body.appendChild(tr);
    } else {
      analysis.perSymbol.forEach((symbol) => {
        const tr = document.createElement('tr');
        const name = document.createElement('th');
        name.scope = 'row';
        name.textContent = symbol.name;
        const count = document.createElement('td');
        count.textContent = `${symbol.count}건`;
        const net = document.createElement('td');
        net.textContent = signed(symbol.net);
        net.className = symbol.net > 0 ? 'win' : symbol.net < 0 ? 'neg' : '';
        tr.append(name, count, net);
        body.appendChild(tr);
      });
    }

    if (warningEl) {
      warningEl.innerHTML = '';
      (table.warnings || []).forEach((text) => {
        const flag = document.createElement('p');
        flag.className = 'flag';
        flag.innerHTML = `<span class="flag-ico" aria-hidden="true">⚠️</span><span>${text}</span>`;
        warningEl.appendChild(flag);
      });
    }

    if (feeToggle) feeToggle.checked = options.feeAsExpense;
    renderFxField();
  }

  function renderFxField() {
    if (!fxField || !fxInput) return;
    const needs = usdColumns().length > 0;
    fxField.hidden = !needs;
    if (needs && document.activeElement !== fxInput) {
      fxInput.value = fmt(options.fx);
    }
  }

  function renderMapping() {
    if (!mapEl || !table) return;
    mapEl.innerHTML = '';
    FIELD_ORDER.forEach((field) => {
      const row = document.createElement('label');
      row.className = 'map-row';

      const label = document.createElement('span');
      label.className = 'map-label';
      label.textContent = FIELD_LABELS[field] || field;

      const select = document.createElement('select');
      select.className = 'map-select';
      select.setAttribute('aria-label', `${FIELD_LABELS[field] || field} 컬럼`);

      const none = document.createElement('option');
      none.value = '-1';
      none.textContent = '사용 안 함';
      select.appendChild(none);

      table.headers.forEach((header, index) => {
        const option = document.createElement('option');
        option.value = String(index);
        option.textContent = header || `컬럼 ${index + 1}`;
        select.appendChild(option);
      });

      select.value = String(Number.isInteger(mapping[field]) ? mapping[field] : -1);
      select.addEventListener('change', () => {
        mapping[field] = Number(select.value);
        analyze();
        renderResult();
      });

      row.append(label, select);
      mapEl.appendChild(row);
    });
  }

  if (feeToggle) {
    feeToggle.addEventListener('change', () => {
      options.feeAsExpense = feeToggle.checked;
      analyze();
      renderResult();
    });
  }

  if (fxInput) {
    fxInput.addEventListener('input', () => {
      const value = digits(fxInput.value);
      fxInput.value = value ? fmt(value) : '';
    });
    fxInput.addEventListener('change', () => {
      const value = digits(fxInput.value);
      options.fx = value > 0 ? value : DEFAULT_FX;
      fxInput.value = fmt(options.fx);
      analyze();
      renderResult();
    });
  }

  if (applyBtn) {
    applyBtn.addEventListener('click', () => {
      if (!analysis || !analysis.totals.count) {
        setStatus('먼저 CSV 파일을 불러와 주세요.');
        return;
      }
      const t = analysis.totals;
      setInput('profit', t.profit);
      setInput('loss', t.loss);
      setInput('expenses', t.expenses);
      showTab('calc');
      const panel = document.getElementById('panel-calc');
      if (panel && panel.scrollIntoView) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setStatus(`세액 계산 탭에 반영했습니다 · 이익 ${won(t.profit)} · 손실 ${won(t.loss)} · 필요경비 ${won(t.expenses)}`, true);
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      table = null;
      mapping = {};
      analysis = null;
      fileInput.value = '';
      resultEl.hidden = true;
      setStatus(DEFAULT_STATUS);
    });
  }
}
