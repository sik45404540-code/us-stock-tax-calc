import {
  calcTax,
  harvestPlan,
  requiredLossForZero,
  calcLedger,
  yearEndDeadline,
  daysBetween,
  DEDUCTION,
} from '../src/tax.js';
/* requiredLossForZero는 화면에서 직접 쓰지 않고 harvestPlan 안에서 쓰인다 */

const STORE_KEY = 'stocktax.v1';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('ko-KR');
const won = (n) => `${fmt(n)}원`;
const signedWon = (n) => {
  const v = Math.round(Number(n) || 0);
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v))}원`;
};
const num = (value) => {
  const cleaned = String(value ?? '').replace(/[^0-9.]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
};

/* ── state ─────────────────────────────────────────── */
const blankPosition = () => ({ name: '', avg: '', price: '', qty: '', fx: '' });
const blankLedger = () => ({ name: '', mode: 'pnl', pnl: '', avg: '', sell: '', qty: '', fx: '', fee: '' });

let state = {
  inputs: { profit: 0, loss: 0, expenses: 0 },
  positions: [blankPosition()],
  ledger: [],
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved && typeof saved === 'object') {
      state.inputs = { ...state.inputs, ...(saved.inputs || {}) };
      if (Array.isArray(saved.positions) && saved.positions.length) {
        state.positions = saved.positions.map((p) => ({ ...blankPosition(), ...p }));
      }
      if (Array.isArray(saved.ledger)) {
        state.ledger = saved.ledger.map((r) => ({ ...blankLedger(), ...r }));
      }
    }
  } catch (err) {
    /* 저장값이 깨져 있으면 기본값으로 시작한다 */
  }
}

let saveTimer = null;
function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (err) {
      /* 저장 공간이 없으면 조용히 넘어간다 */
    }
  }, 250);
}

/* ── 탭 ────────────────────────────────────────────── */
const tabs = Array.from(document.querySelectorAll('.tab'));
const panels = {
  calc: $('panel-calc'),
  plan: $('panel-plan'),
  ledger: $('panel-ledger'),
};

function showTab(name) {
  tabs.forEach((t) => {
    const on = t.dataset.tab === name;
    t.classList.toggle('is-active', on);
    t.setAttribute('aria-selected', String(on));
  });
  Object.entries(panels).forEach(([key, panel]) => {
    const on = key === name;
    panel.classList.toggle('is-active', on);
    panel.hidden = !on;
  });
  if (name === 'plan') renderPlan();
  if (name === 'ledger') renderLedger();
}

tabs.forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));
document.querySelectorAll('[data-goto]').forEach((a) => {
  a.addEventListener('click', (e) => {
    e.preventDefault();
    showTab(a.dataset.goto);
    document.querySelector('.tabs').scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
});

/* ── 입력 바인딩 ───────────────────────────────────── */
function bindMoney(el, onChange) {
  if (!el) return;
  el.addEventListener('input', () => {
    const value = num(el.value);
    el.value = value ? fmt(value) : '';
    onChange(value);
  });
  el.addEventListener('blur', () => {
    el.value = num(el.value) ? fmt(num(el.value)) : '';
  });
}

function syncInputs(source, value) {
  const pair = {
    profit: ['in-profit', 'plan-profit'],
    loss: ['in-loss', 'plan-loss'],
    expenses: ['in-expenses'],
  }[source] || [];
  pair.forEach((id) => {
    const el = $(id);
    if (el && document.activeElement !== el) el.value = value ? fmt(value) : '';
  });
}

function setInput(key, value) {
  state.inputs[key] = value;
  syncInputs(key, value);
  saveState();
  renderResults();
}

bindMoney($('in-profit'), (v) => setInput('profit', v));
bindMoney($('in-loss'), (v) => setInput('loss', v));
bindMoney($('in-expenses'), (v) => setInput('expenses', v));
bindMoney($('plan-profit'), (v) => setInput('profit', v));
bindMoney($('plan-loss'), (v) => setInput('loss', v));

/* ── ① 세액 계산 렌더 ───────────────────────────────── */
function renderResults() {
  const snapshot = {
    profit: state.inputs.profit || 0,
    loss: state.inputs.loss || 0,
    expenses: state.inputs.expenses || 0,
  };
  const r = calcTax(snapshot);

  $('out-total').textContent = fmt(r.totalTax);
  $('out-net').textContent = won(r.netGain);
  $('out-deduction').textContent = `-${won(r.deduction)}`;
  $('out-base').textContent = won(r.taxableBase);
  $('out-income').textContent = won(r.incomeTax);
  $('out-local').textContent = won(r.localTax);
  $('out-room').textContent = won(r.deductionLeft);

  const usedPct = Math.min(100, Math.round((Math.max(0, r.netGain) / DEDUCTION) * 100));
  $('meter-fill').style.width = `${usedPct}%`;
  $('out-used').textContent = `${usedPct}%`;

  const note = $('out-note');
  const zeroBox = $('zero-box');
  const zeroTitle = $('zero-title');
  const zeroBody = $('zero-body');

  if (r.totalTax > 0) {
    note.innerHTML = `과세표준 <b>${won(r.taxableBase)}</b>에 22%(소득세 20% + 지방세 2%)를 적용한 금액입니다.`;
    zeroBox.hidden = true;
  } else {
    note.innerHTML = '기본공제 이내로 <b>납부 세액 0원</b>입니다.';
    zeroBox.hidden = false;
    if (r.netGain <= 0) {
      zeroTitle.textContent = '올해는 낼 세금이 없습니다';
      zeroBody.textContent = `양도소득금액이 ${signedWon(r.netGain)}입니다. 남은 손실은 다음 해로 넘어가지 않으니, 그해 이익과 통산되지 않으면 사라집니다.`;
    } else {
      zeroTitle.textContent = '기본공제 이내로 납부 세액 0원';
      zeroBody.textContent = `공제 여력이 ${won(r.deductionLeft)} 남아 있습니다. 이만큼 더 이익을 실현해도 세금은 0원입니다.`;
    }
  }

  renderPlan();
}

/* ── ② 절세 역산 ───────────────────────────────────── */
const posList = $('pos-list');

function renderPositions() {
  posList.innerHTML = '';
  state.positions.forEach((pos, i) => posList.appendChild(positionRow(pos, i)));
}

function positionRow(pos, index) {
  const row = document.createElement('div');
  row.className = 'pos-row';
  row.innerHTML = `
    <div class="pos-top">
      <input class="pos-name" type="text" placeholder="종목명 (예: TSLA)" value="" autocomplete="off" aria-label="종목명" />
      <button class="pos-del" type="button" aria-label="이 종목 삭제">×</button>
    </div>
    <div class="pos-grid">
      <div class="pos-cell"><label>평단가($)</label><input data-k="avg" type="text" inputmode="decimal" placeholder="0" autocomplete="off" /></div>
      <div class="pos-cell"><label>현재가($)</label><input data-k="price" type="text" inputmode="decimal" placeholder="0" autocomplete="off" /></div>
      <div class="pos-cell"><label>보유 수량</label><input data-k="qty" type="text" inputmode="numeric" placeholder="0" autocomplete="off" /></div>
      <div class="pos-cell"><label>환율(원/$)</label><input data-k="fx" type="text" inputmode="numeric" placeholder="1,380" autocomplete="off" /></div>
    </div>
    <p class="pos-foot"></p>
  `;

  const nameInput = row.querySelector('.pos-name');
  nameInput.value = pos.name || '';
  nameInput.addEventListener('input', () => {
    state.positions[index].name = nameInput.value;
    saveState();
    renderPlan();
  });

  row.querySelectorAll('[data-k]').forEach((input) => {
    const key = input.dataset.k;
    input.value = pos[key] === '' || pos[key] === undefined ? '' : String(pos[key]);
    input.addEventListener('input', () => {
      const value = num(input.value);
      state.positions[index][key] = value;
      if (key === 'qty' || key === 'fx') input.value = value ? fmt(value) : '';
      saveState();
      updatePositionFoot(row, index);
      renderPlan();
    });
  });

  row.querySelector('.pos-del').addEventListener('click', () => {
    state.positions.splice(index, 1);
    if (!state.positions.length) state.positions.push(blankPosition());
    saveState();
    renderPositions();
    renderPlan();
  });

  updatePositionFoot(row, index);
  return row;
}

function updatePositionFoot(row, index) {
  const p = state.positions[index] || {};
  const foot = row.querySelector('.pos-foot');
  const avg = num(p.avg);
  const price = num(p.price);
  const qty = num(p.qty);
  const fx = num(p.fx);
  if (!avg || !price || !qty || !fx) {
    foot.textContent = '';
    return;
  }
  const perShare = (avg - price) * fx;
  if (perShare < 0) {
    foot.innerHTML = `평가이익 ${fmt(Math.abs(perShare) * qty)}원 — 손실 상계 대상이 아닙니다`;
    return;
  }
  foot.innerHTML = `주당 손실 <b>${fmt(perShare)}원</b> · 최대 <b>${fmt(perShare * qty)}원</b> 상계 가능`;
}

$('add-pos').addEventListener('click', () => {
  state.positions.push(blankPosition());
  saveState();
  renderPositions();
  const rows = posList.querySelectorAll('.pos-row');
  const last = rows[rows.length - 1];
  if (last) last.querySelector('.pos-name').focus();
});

function renderPlan() {
  const snapshot = {
    profit: state.inputs.profit || 0,
    loss: state.inputs.loss || 0,
    expenses: state.inputs.expenses || 0,
  };
  const res = harvestPlan(snapshot, state.positions);
  const need = $('out-need');
  const note = $('need-note');
  const table = $('plan-table');

  need.textContent = fmt(res.need);
  table.innerHTML = '';

  $('out-before').textContent = won(res.before.totalTax);
  $('out-after').textContent = won(res.after.totalTax);
  $('out-saving').textContent = won(Math.max(0, res.savings));

  if (res.before.totalTax === 0) {
    note.innerHTML = '이미 납부 세액이 <b>0원</b>입니다. 지금은 추가 손실을 확정해도 줄어들 세금이 없습니다.';
    return;
  }

  const sold = res.plan.items.filter((it) => it.shares > 0);

  if (!sold.length) {
    note.innerHTML = '평가손실 종목을 입력하면 <b>몇 주를 팔아야 하는지</b> 계산합니다.';
    return;
  }

  note.innerHTML = `손실 <b>${won(res.plan.harvestedLoss)}</b>을 확정하면 세금이 <b>${won(res.after.totalTax)}</b>이 됩니다.${res.plan.shortfall > 0 ? ` 보유 손실로는 <b>${won(res.plan.shortfall)}</b>이 부족합니다.` : ''}`;

  sold.forEach((it) => {
    const div = document.createElement('div');
    div.className = 'pt-row';
    div.innerHTML = `
      <span class="pt-name">${escapeHtml(it.name)}
        <span>${fmt(it.shares)}주 매도 · 평단 $${it.avg} → $${it.price}</span>
      </span>
      <span class="pt-val"><b>${won(it.saleAmount)}</b><br />손실 ${won(it.harvestedLoss)}</span>
    `;
    table.appendChild(div);
  });

  const sum = document.createElement('div');
  sum.className = 'pt-row';
  sum.innerHTML = `<span class="pt-name">매도 합계<span>회수 자금 (환율 반영)</span></span><span class="pt-val"><b>${won(res.plan.saleTotal)}</b></span>`;
  table.appendChild(sum);
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

/* ── ③ 종목 장부 ───────────────────────────────────── */
const ledgerList = $('ledger-list');

function renderLedger() {
  ledgerList.innerHTML = '';
  if (!state.ledger.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = '아직 종목이 없습니다. [+ 종목 추가]로 손익을 한 줄씩 적어 보세요.';
    ledgerList.appendChild(empty);
  }
  state.ledger.forEach((row, i) => ledgerList.appendChild(ledgerRow(row, i)));
  renderLedgerSummary();
}

function ledgerRow(row, index) {
  const el = document.createElement('div');
  el.className = 'ledger-row';
  el.innerHTML = `
    <div class="led-top">
      <input class="led-name" type="text" placeholder="종목명 (예: NVDA)" aria-label="종목명" autocomplete="off" />
      <select class="led-mode" aria-label="입력 방식">
        <option value="pnl">손익 직접 입력</option>
        <option value="trade">매수·매도</option>
      </select>
      <button class="pos-del" type="button" aria-label="이 종목 삭제">×</button>
    </div>
    <div class="pos-grid" data-fields></div>
    <p class="led-pnl"></p>
  `;

  const nameInput = el.querySelector('.led-name');
  const modeSelect = el.querySelector('.led-mode');
  const fields = el.querySelector('[data-fields]');
  const pnlLine = el.querySelector('.led-pnl');

  nameInput.value = row.name || '';
  modeSelect.value = row.mode === 'trade' ? 'trade' : 'pnl';

  nameInput.addEventListener('input', () => {
    state.ledger[index].name = nameInput.value;
    saveState();
    renderLedgerSummary();
  });

  function drawFields() {
    const mode = modeSelect.value;
    state.ledger[index].mode = mode;
    fields.innerHTML = mode === 'pnl'
      ? `<div class="pos-cell" style="grid-column:1/-1"><label>실현손익(원)</label><input data-k="pnl" type="text" inputmode="text" placeholder="-1,000,000" autocomplete="off" /></div>`
      : `
        <div class="pos-cell"><label>평단가($)</label><input data-k="avg" type="text" inputmode="decimal" placeholder="0" autocomplete="off" /></div>
        <div class="pos-cell"><label>매도가($)</label><input data-k="sell" type="text" inputmode="decimal" placeholder="0" autocomplete="off" /></div>
        <div class="pos-cell"><label>수량</label><input data-k="qty" type="text" inputmode="numeric" placeholder="0" autocomplete="off" /></div>
        <div class="pos-cell"><label>환율(원/$)</label><input data-k="fx" type="text" inputmode="numeric" placeholder="1,380" autocomplete="off" /></div>
        <div class="pos-cell" style="grid-column:1/-1"><label>수수료(원, 선택)</label><input data-k="fee" type="text" inputmode="numeric" placeholder="0" autocomplete="off" /></div>
      `;

    fields.querySelectorAll('[data-k]').forEach((input) => {
      const key = input.dataset.k;
      const current = state.ledger[index][key];
      input.value = current === '' || current === undefined ? '' : String(current);
      input.addEventListener('input', () => {
        const value = num(input.value);
        state.ledger[index][key] = value;
        if (key !== 'avg' && key !== 'sell' && key !== 'pnl') input.value = value ? fmt(value) : '';
        saveState();
        renderLedgerSummary();
      });
    });
  }

  modeSelect.addEventListener('change', () => {
    drawFields();
    saveState();
    renderLedgerSummary();
  });

  el.querySelector('.pos-del').addEventListener('click', () => {
    state.ledger.splice(index, 1);
    saveState();
    renderLedger();
  });

  drawFields();
  pnlLine.dataset.role = 'pnl';
  return el;
}

function renderLedgerSummary() {
  const result = calcLedger(state.ledger);
  $('led-total').textContent = fmt(result.totalTax);
  $('led-profit').textContent = won(result.profit);
  $('led-loss').textContent = won(result.loss);
  $('led-base').textContent = won(result.taxableBase);

  ledgerList.querySelectorAll('.ledger-row').forEach((row, i) => {
    const item = result.items[i];
    const line = row.querySelector('.led-pnl');
    if (!line) return;
    if (!item || (!item.pnl && !state.ledger[i]?.name)) {
      line.textContent = '';
      return;
    }
    line.textContent = `${signedWon(item.pnl)}${item.pnl > 0 ? ' 수익' : item.pnl < 0 ? ' 손실' : ''}`;
    line.classList.toggle('plus', item.pnl > 0);
    line.classList.toggle('minus', item.pnl < 0);
  });
}

$('add-ledger').addEventListener('click', () => {
  state.ledger.push(blankLedger());
  saveState();
  renderLedger();
  const rows = ledgerList.querySelectorAll('.ledger-row');
  const last = rows[rows.length - 1];
  if (last) last.querySelector('.led-name').focus();
});

$('led-reset').addEventListener('click', () => {
  if (!state.ledger.length) {
    setMsg('지울 종목이 없습니다.');
    return;
  }
  if (!window.confirm('장부 종목을 모두 지울까요? 이 기기에 저장된 값도 함께 지워집니다.')) return;
  state.ledger = [];
  saveState();
  renderLedger();
  setMsg('장부를 모두 지웠습니다.');
});

$('led-send').addEventListener('click', () => {
  const result = calcLedger(state.ledger);
  if (!result.profit && !result.loss) {
    setMsg('먼저 종목을 추가해 주세요.');
    return;
  }
  setInput('profit', result.profit);
  setInput('loss', result.loss);
  showTab('calc');
  setMsg('장부 합계를 계산기로 보냈습니다.');
});

$('led-copy').addEventListener('click', async () => {
  const result = calcLedger(state.ledger);
  const lines = [
    '[미국주식 양도세 계산 · 2026년 귀속]',
    `이익 합계: ${won(result.profit)}`,
    `손실 합계: ${won(result.loss)}`,
    `양도소득금액: ${won(result.netGain)}`,
    `기본공제: ${won(result.deduction)}`,
    `과세표준: ${won(result.taxableBase)}`,
    `예상 세액: ${won(result.totalTax)} (소득세 ${won(result.incomeTax)} + 지방소득세 ${won(result.localTax)})`,
  ];
  const items = result.items.filter((it) => it.pnl || it.name);
  if (items.length) {
    lines.push('— 종목별 —');
    items.forEach((it) => lines.push(`${it.name}: ${signedWon(it.pnl)}`));
  }
  const text = lines.join('\n');

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setMsg('결과를 복사했습니다. 카톡·메모에 붙여 넣으세요.');
  } catch (err) {
    setMsg('복사가 막혔습니다. 화면의 숫자를 직접 옮겨 주세요.');
  }
});

function setMsg(text) {
  const el = $('led-msg');
  el.textContent = text;
  clearTimeout(setMsg.timer);
  setMsg.timer = setTimeout(() => { el.textContent = ''; }, 4000);
}

/* ── D-day ─────────────────────────────────────────── */
function renderDday() {
  const deadline = yearEndDeadline(2026);
  const el = $('dday');
  if (!deadline || !el) return;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
  const left = daysBetween(today, deadline.safeSellDate);
  if (left === null) return;
  if (left > 0) el.textContent = `D-${left}`;
  else if (left === 0) el.textContent = '오늘';
  else el.textContent = '마감 지남';
}

/* ── 시작 ──────────────────────────────────────────── */
function hydrateInputs() {
  const map = { 'in-profit': 'profit', 'in-loss': 'loss', 'in-expenses': 'expenses', 'plan-profit': 'profit', 'plan-loss': 'loss' };
  Object.entries(map).forEach(([id, key]) => {
    const el = $(id);
    if (el) el.value = state.inputs[key] ? fmt(state.inputs[key]) : '';
  });
}

loadState();
hydrateInputs();
renderPositions();
renderResults();
renderLedger();
renderDday();
