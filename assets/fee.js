import { compareBrokers } from '../src/fee.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('ko-KR');
const won = (n) => `${fmt(n)}원`;
const pct = (n, digits = 2) => `${(Number(n) * 100).toFixed(digits)}%`;
const num = (value) => {
  const cleaned = String(value ?? '').replace(/[^0-9.]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
};

const state = {
  amount: 10_000_000,
  returnRate: 0.1,
  spread: 0.01,
  a: { label: 'A', feeRate: 0.0007, fxDiscount: 1 },
  b: { label: 'B', feeRate: 0.0025, fxDiscount: 0.9 },
};

function moneyField(id, get, set) {
  const el = $(id);
  if (!el) return;
  el.value = fmt(get());
  el.addEventListener('input', () => {
    const v = num(el.value);
    el.value = v ? fmt(v) : '';
    set(v);
    render();
  });
  el.addEventListener('blur', () => {
    el.value = fmt(get());
  });
}

function rateField(id, get, set, digits = 2) {
  const el = $(id);
  if (!el) return;
  el.value = (Number(get()) * 100).toFixed(digits);
  el.addEventListener('input', () => {
    const v = num(el.value);
    set(v / 100);
    render();
  });
  el.addEventListener('blur', () => {
    el.value = (Number(get()) * 100).toFixed(digits);
  });
}

moneyField('in-amount', () => state.amount, (v) => { state.amount = v; });
rateField('in-return', () => state.returnRate, (v) => { state.returnRate = v; }, 1);
rateField('in-spread', () => state.spread, (v) => { state.spread = v; }, 2);
rateField('in-fee-a', () => state.a.feeRate, (v) => { state.a.feeRate = v; });
rateField('in-fx-a', () => state.a.fxDiscount, (v) => { state.a.fxDiscount = v; }, 0);
rateField('in-fee-b', () => state.b.feeRate, (v) => { state.b.feeRate = v; });
rateField('in-fx-b', () => state.b.fxDiscount, (v) => { state.b.fxDiscount = v; }, 0);

const nameA = $('name-a');
const nameB = $('name-b');
[nameA, nameB].forEach((el) => {
  if (!el) return;
  el.addEventListener('input', () => {
    state.a.label = nameA.value || 'A';
    state.b.label = nameB.value || 'B';
    render();
  });
});

function render() {
  const r = compareBrokers({
    amount: state.amount,
    spread: state.spread,
    returnRate: state.returnRate,
    a: state.a,
    b: state.b,
  });

  const hasAmount = r.hasAmount;
  const diffAbs = Math.abs(r.diff);

  $('out-diff').textContent = hasAmount ? fmt(diffAbs) : '0';
  $('out-a').textContent = won(r.a.receipt);
  $('out-b').textContent = won(r.b.receipt);
  $('out-a-cost').textContent = won(r.a.totalCost);
  $('out-b-cost').textContent = won(r.b.totalCost);
  $('out-a-rate').textContent = pct(r.a.costRate);
  $('out-b-rate').textContent = pct(r.b.costRate);
  $('out-be-a').textContent = pct(r.a.breakEvenRate);
  $('out-be-b').textContent = pct(r.b.breakEvenRate);

  const note = $('out-note');
  if (!hasAmount) {
    note.textContent = '투자금을 입력하면 두 계좌의 실수령을 비교합니다.';
  } else if (r.cheaper === 'same') {
    note.textContent = '두 계좌의 왕복 비용이 같아 실수령도 같습니다.';
  } else {
    const win = r.cheaper === 'a' ? r.a : r.b;
    note.innerHTML = `<b>${win.label}</b> 계좌가 <b>${won(diffAbs)}</b> 더 받습니다. 같은 투자금·같은 수익률이라면 비용 차이가 그대로 손익이 됩니다.`;
  }

  // 비용 내역 표
  const rows = [
    ['매수 환전', r.a.buyFx, r.b.buyFx],
    ['매수 수수료', r.a.buyFee, r.b.buyFee],
    ['매도 수수료', r.a.sellFee, r.b.sellFee],
    ['매도 환전', r.a.sellFx, r.b.sellFx],
  ];
  const tbody = $('cost-body');
  tbody.innerHTML = rows.map(([label, a, b]) => {
    const aWin = a < b ? ' class="win"' : '';
    const bWin = b < a ? ' class="win"' : '';
    return `<tr><th>${label}</th><td${aWin}>${won(a)}</td><td${bWin}>${won(b)}</td></tr>`;
  }).join('');
  $('cost-a').textContent = won(r.a.totalCost);
  $('cost-b').textContent = won(r.b.totalCost);
  $('cost-a').className = r.a.totalCost <= r.b.totalCost ? 'win' : '';
  $('cost-b').className = r.b.totalCost < r.a.totalCost ? 'win' : '';

  $('net-a').textContent = won(r.a.receipt);
  $('net-b').textContent = won(r.b.receipt);
  $('net-a').className = r.a.receipt >= r.b.receipt ? 'win' : '';
  $('net-b').className = r.b.receipt > r.a.receipt ? 'win' : '';

  $('dt-a').textContent = `${r.a.label} 실수령`;
  $('dt-b').textContent = `${r.b.label} 실수령`;
  $('dt-a-cost').textContent = `${r.a.label} 왕복 비용`;
  $('dt-b-cost').textContent = `${r.b.label} 왕복 비용`;
  $('col-a').textContent = r.a.label;
  $('col-b').textContent = r.b.label;

  $('cmp-note').textContent = `A 유효 스프레드 ${(r.a.effectiveSpread * 100).toFixed(2)}%, B ${(r.b.effectiveSpread * 100).toFixed(2)}%. 기준 스프레드 ${(r.spread * 100).toFixed(2)}% × (1 − 우대율)로 계산했습니다.`;
  $('break-even-note').textContent = `이 조건에서 원금을 지키려면 A는 ${pct(r.a.breakEvenRate)}, B는 ${pct(r.b.breakEvenRate)}의 수익률이 필요합니다.`;
}

render();
