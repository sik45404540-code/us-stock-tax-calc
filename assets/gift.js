import { giftTax, compareSpouseGift, RELATIONS } from '../src/gift.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('ko-KR');
const won = (n) => `${fmt(n)}원`;
const num = (value) => {
  const cleaned = String(value ?? '').replace(/[^0-9.]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
};

const state = {
  relation: 'parentAdult',
  amount: 100_000_000,
  unit: 'won',
  priorGift: 0,
  priorTax: 0,
  marriage: false,
  skip: false,
  minor: false,
  report: true,
  spouse: { value: 300_000_000, cost: 100_000_000, prior: 0, expenses: 0 },
};

/* ── 탭 ────────────────────────────────────────────── */
const tabs = Array.from(document.querySelectorAll('.tab'));
const panels = { gift: $('pg-gift'), spouse: $('pg-spouse') };

function showTab(name) {
  tabs.forEach((t) => {
    const on = t.dataset.tab === name;
    t.classList.toggle('is-active', on);
    t.setAttribute('aria-selected', String(on));
  });
  Object.entries(panels).forEach(([key, panel]) => {
    if (!panel) return;
    const on = key === name;
    panel.classList.toggle('is-active', on);
    panel.hidden = !on;
  });
}

tabs.forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));
document.querySelectorAll('[data-goto]').forEach((a) => {
  a.addEventListener('click', (e) => {
    e.preventDefault();
    showTab(a.dataset.goto);
    document.querySelector('.tabs').scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
});

/* ── 금액 입력 ─────────────────────────────────────── */
function bindMoney(id, get, set) {
  const el = $(id);
  if (!el) return;
  el.value = get() ? fmt(get()) : '';
  el.addEventListener('input', () => {
    const v = num(el.value);
    el.value = v ? fmt(v) : '';
    set(v);
    render();
  });
  el.addEventListener('blur', () => {
    const v = num(el.value);
    el.value = v ? fmt(v) : '';
  });
}

const amountEl = $('g-amount');
const amountUnit = $('g-unit');

function paintAmount() {
  const shown = state.unit === 'man' ? state.amount / 10_000 : state.amount;
  amountEl.value = shown ? fmt(shown) : '';
  amountUnit.textContent = state.unit === 'man' ? '만원' : '원';
}

amountEl.addEventListener('input', () => {
  const raw = num(amountEl.value);
  amountEl.value = raw ? fmt(raw) : '';
  state.amount = Math.max(0, Math.round(state.unit === 'man' ? raw * 10_000 : raw));
  render();
});
amountEl.addEventListener('blur', paintAmount);

document.querySelectorAll('.seg-xs button[data-unit]').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.unit = btn.dataset.unit;
    document.querySelectorAll('.seg-xs button[data-unit]').forEach((b) => {
      const on = b === btn;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    paintAmount();
  });
});

document.querySelectorAll('.preset[data-preset]').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.amount = Number(btn.dataset.preset) || 0;
    paintAmount();
    render();
  });
});

bindMoney('g-prior-gift', () => state.priorGift, (v) => { state.priorGift = v; });
bindMoney('g-prior-tax', () => state.priorTax, (v) => { state.priorTax = v; });

/* ── 체크박스·관계 ─────────────────────────────────── */
const relationEl = $('g-relation');
const marriageEl = $('g-marriage');
const marriageRow = $('g-marriage-row');

function syncMarriage() {
  const allowed = state.relation === 'parentAdult' || state.relation === 'parentMinor';
  marriageEl.disabled = !allowed;
  if (marriageRow) marriageRow.classList.toggle('is-off', !allowed);
  if (!allowed) {
    state.marriage = false;
    marriageEl.checked = false;
  }
}

relationEl.addEventListener('change', () => {
  state.relation = relationEl.value;
  syncMarriage();
  render();
});

$('g-marriage').addEventListener('change', () => {
  state.marriage = $('g-marriage').checked;
  render();
});

$('g-skip').addEventListener('change', () => {
  state.skip = $('g-skip').checked;
  $('g-minor-row').hidden = !state.skip;
  if (!state.skip) {
    state.minor = false;
    $('g-minor').checked = false;
  }
  render();
});

$('g-minor').addEventListener('change', () => {
  state.minor = $('g-minor').checked;
  render();
});

$('g-report').addEventListener('change', () => {
  state.report = $('g-report').checked;
  render();
});

/* ── 증여세 화면 ───────────────────────────────────── */
function receiptRow(label, note, value, cls = '') {
  return `<tr${cls ? ` class="${cls}"` : ''}><th>${label}${note ? `<em>${note}</em>` : ''}</th><td>${value}</td></tr>`;
}

function render() {
  const r = giftTax({
    amount: state.amount,
    relation: state.relation,
    priorGift: state.priorGift,
    priorTax: state.priorTax,
    marriageBirth: state.marriage,
    generationSkip: state.skip,
    minor: state.minor,
    reportDiscount: state.report,
  });

  $('g-total').textContent = fmt(r.total);

  const note = $('g-note');
  if (!r.amount) {
    note.textContent = '증여 금액을 입력하면 바로 계산됩니다.';
  } else if (r.belowDeduction) {
    note.innerHTML = `공제 <b>${won(r.deduction)}</b> 안이라 낼 증여세가 없습니다.`;
  } else if (r.belowMinimum) {
    note.innerHTML = `과세표준이 <b>${won(r.taxBase)}</b>로 50만 원 미만이라 부과하지 않습니다(과세최저한).`;
  } else {
    note.innerHTML = `과세표준 <b>${won(r.taxBase)}</b>에 ${r.bracket.percent}%를 적용하고 세액공제를 뺀 금액입니다.`;
    if (!r.reportDiscount) note.innerHTML += ' 신고세액공제 3%는 반영하지 않았습니다.';
  }

  $('g-taxable').textContent = won(r.taxableValue);
  $('g-deduction').textContent = won(r.deduction);
  $('g-deduction-note').textContent = r.deductionExtra
    ? `관계별 ${won(r.appliedBase)} + 혼인·출산 ${won(r.deductionExtra)}`
    : (r.deductionBase === 0 ? '10년 한도를 모두 사용' : `적용 ${won(r.appliedBase)} · 남은 ${won(r.remainingLimit)}`);
  $('g-base').textContent = won(r.taxBase);
  $('g-rate').textContent = r.taxBase > 0 ? `${r.bracket.percent}%` : '—';
  $('g-rate-note').textContent = r.taxBase > 0 && r.bracket.progressive
    ? `${r.bracket.label} · 누진공제 ${won(r.bracket.progressive)}`
    : (r.taxBase > 0 ? r.bracket.label : '과세표준 없음');
  $('g-computed').textContent = won(r.computedTax);

  $('g-surcharge-row').hidden = !r.generationSkip;
  $('g-surcharge').textContent = won(r.surcharge);
  $('g-surcharge-note').textContent = `+${Math.round(r.skipRate * 100)}%${r.minor ? ' (미성년)' : ''}`;

  $('g-prior-credit-row').hidden = r.priorTax <= 0;
  $('g-prior-credit').textContent = won(r.priorTax);

  $('g-report-credit').textContent = r.reportDiscount ? won(r.reportCredit) : '미적용';

  const zero = $('g-zero');
  if (r.belowMinimum) {
    zero.hidden = false;
    $('g-zero-title').textContent = '과세최저한 — 증여세 0원';
    $('g-zero-body').textContent = `과세표준이 50만 원 미만이면 증여세를 부과하지 않습니다(상증세법 제55조 제2항). 공제 한도가 ${won(r.remainingLimit)} 남아 있습니다.`;
  } else if (r.belowDeduction) {
    zero.hidden = false;
    $('g-zero-title').textContent = '공제 한도 안 — 증여세 0원';
    $('g-zero-body').textContent = `이번 증여 뒤 남는 10년 공제 한도는 ${won(r.remainingLimit)}입니다. 쓴 공제는 10년 동안 그대로 차감되므로, 같은 사람에게 다시 증여할 때는 남은 한도만 쓸 수 있습니다.`;
  } else {
    zero.hidden = true;
  }

  const rows = [];
  rows.push(receiptRow('증여재산가액', '', won(r.amount)));
  if (r.priorGift > 0) {
    rows.push(receiptRow(
      '10년 내 기증여 합산',
      r.aggregateSkipped ? '1천만 원 미만이라 합산 제외' : '같은 증여자 기준',
      r.aggregateSkipped ? '합산 제외' : `+ ${won(r.priorAggregated)}`,
    ));
  }
  rows.push(receiptRow('증여세 과세가액', '', won(r.taxableValue)));
  rows.push(receiptRow(
    '증여재산공제',
    r.deductionExtra ? `관계별 ${won(r.deductionBase)} + 혼인·출산 ${won(r.deductionExtra)}` : '관계별 10년 한도',
    r.deduction > 0 ? `− ${won(r.deduction)}` : '0원',
  ));
  rows.push(receiptRow('과세표준', r.belowMinimum ? '50만 원 미만 → 과세최저한' : '', won(r.taxBase)));
  rows.push(receiptRow(
    '적용 세율',
    r.bracket.progressive ? `누진공제 ${won(r.bracket.progressive)}` : '누진공제 없음',
    r.taxBase > 0 ? `${r.bracket.percent}%` : '—',
  ));
  rows.push(receiptRow('산출세액', '과세표준 × 세율 − 누진공제', won(r.computedTax)));
  if (r.generationSkip) {
    rows.push(receiptRow('세대생략 할증', `산출세액의 ${Math.round(r.skipRate * 100)}%${r.minor ? ' (미성년)' : ''}`, `+ ${won(r.surcharge)}`));
  }
  if (r.priorTax > 0) {
    rows.push(receiptRow('기납부세액 공제', '10년 내 이미 낸 증여세', `− ${won(r.priorTax)}`));
  }
  rows.push(receiptRow(
    '신고세액공제 3%',
    r.reportDiscount ? '기한 내 신고' : '미적용',
    !r.reportDiscount ? '—' : (r.reportCredit > 0 ? `− ${won(r.reportCredit)}` : '0원'),
  ));
  rows.push(receiptRow('납부할 증여세', `증여일이 속한 달의 말일부터 3개월 내 신고`, won(r.total), 'is-total'));
  $('g-receipt').innerHTML = rows.join('');

  // 네 가지 카드
  $('gc-normal-line').textContent = r.amount ? `이번 계산 ${won(r.total)}` : '—';
  $('gc-marriage').classList.toggle('is-on', r.marriageBirth);
  $('gc-marriage-line').textContent = r.marriageBirth ? `적용 중 · ${won(r.deductionExtra)} 공제` : '미적용';
  $('gc-skip').classList.toggle('is-on', r.generationSkip);
  $('gc-skip-line').textContent = r.generationSkip
    ? `적용 중 · +${won(r.surcharge)} (${Math.round(r.skipRate * 100)}%)`
    : '미적용';
  $('gc-carry-line').textContent = '1년 안에 팔면 효과 없음';

  // 관계별 한도 안내
  const rel = RELATIONS[state.relation];
  $('g-limit-hint').innerHTML = rel.limit
    ? `이 관계의 10년 공제 한도는 <b>${won(rel.limit)}</b>입니다.`
    : '이 관계는 증여재산공제가 없습니다.';
}

/* ── 배우자 증여 절세 화면 ─────────────────────────── */
bindMoney('s-value', () => state.spouse.value, (v) => { state.spouse.value = v; renderSpouse(); });
bindMoney('s-cost', () => state.spouse.cost, (v) => { state.spouse.cost = v; renderSpouse(); });
bindMoney('s-prior', () => state.spouse.prior, (v) => { state.spouse.prior = v; renderSpouse(); });
bindMoney('s-expenses', () => state.spouse.expenses, (v) => { state.spouse.expenses = v; renderSpouse(); });

function renderSpouse() {
  const c = compareSpouseGift({
    value: state.spouse.value,
    costBasis: state.spouse.cost,
    expenses: state.spouse.expenses,
    priorGift: state.spouse.prior,
  });

  const negative = c.saving < 0;
  $('s-saving').textContent = `${negative ? '−' : ''}${fmt(Math.abs(c.saving))}`;
  $('s-tax-a').textContent = won(c.taxA);
  $('s-tax-b').textContent = won(c.totalB);
  const diff = $('s-diff');
  diff.textContent = `${negative ? '−' : ''}${won(Math.abs(c.saving))}`;
  diff.className = negative ? 'neg' : 'good';

  const note = $('s-note');
  if (!c.hasValue) {
    note.textContent = '평가금액과 매수금액을 입력하면 두 방법을 비교합니다.';
  } else if (negative) {
    note.innerHTML = `B안이 <b>${won(-c.saving)}</b> 더 비쌉니다. 차익이 작아 증여세(${won(c.gift.total)})가 아끼는 양도세보다 큽니다.`;
  } else if (c.saving === 0) {
    note.textContent = '두 방법의 총 부담이 같습니다.';
  } else {
    note.innerHTML = `B안이 <b>${won(c.saving)}</b> 유리합니다. 증여세 ${won(c.gift.total)}을 내고 양도세 ${won(c.taxA)}를 아끼는 구조입니다.`;
  }

  $('s-duo-a').textContent = won(c.taxA);
  $('s-duo-note-a').textContent = `양도차익 ${won(c.gainA)} · 기본공제 250만`;
  $('s-duo-b').textContent = won(c.totalB);
  $('s-duo-note-b').textContent = `증여세 ${won(c.gift.total)} + 양도세 ${won(c.taxB)}`;
  $('s-cell-a').classList.toggle('is-best', !negative && c.saving > 0);
  $('s-cell-b').classList.toggle('is-best', negative || c.saving === 0);

  $('s-room-note').textContent = c.hasValue
    ? `배우자 10년 공제 6억 중 이번에 쓸 수 있는 금액은 ${won(c.spouseRoom)}입니다. 증여세 과세표준은 ${won(c.gift.taxBase)}입니다.`
    : '배우자 공제는 10년 누계 6억 원입니다.';

  const rows = [
    ['취득가액', won(c.costBasis), won(c.value)],
    ['양도차익', won(c.gainA), '0원'],
    ['기본공제', c.gainA > 2_500_000 ? '250만 원' : won(c.gainA), '—'],
    ['양도세 22%', won(c.taxA), won(c.taxB)],
    ['증여세', '—', won(c.gift.total)],
  ];
  $('s-body').innerHTML = rows
    .map(([label, a, b]) => `<tr><th>${label}</th><td>${a}</td><td>${b}</td></tr>`)
    .join('');
  $('s-foot-a').textContent = won(c.taxA);
  $('s-foot-b').textContent = won(c.totalB);
  $('s-foot-a').className = c.taxA <= c.totalB ? 'win' : '';
  $('s-foot-b').className = c.totalB < c.taxA ? 'win' : '';

  const early = $('s-early');
  const earlyText = $('s-early-text');
  if (!c.hasValue) {
    early.className = 'flag';
    earlyText.textContent = '1년을 못 채우면 어떻게 되는지 계산합니다.';
  } else {
    const over = c.totalEarly - c.taxA;
    early.className = over > 0 ? 'flag warn' : 'flag info';
    const tail = over > 0
      ? `${won(over)} 더 비쌉니다`
      : (over === 0
        ? `같습니다(증여세가 0원이라 1년을 채우지 않아도 손해가 없습니다)`
        : `${won(-over)} 적습니다`);
    earlyText.innerHTML = `1년을 못 채우고 팔면 이월과세로 취득가액이 <b>${won(c.costBasis)}</b>으로 되돌아갑니다. 증여세 ${won(c.gift.total)} + 양도세 ${won(c.taxEarly)} = <b>${won(c.totalEarly)}</b>으로, 바로 파는 것(${won(c.taxA)})보다 ${tail}.`;
  }
}

/* ── 상단 바 높이(탭이 가리지 않도록) ────────────────── */
function syncTopbarHeight() {
  const bar = document.querySelector('.topbar');
  if (!bar) return;
  const h = Math.round(bar.getBoundingClientRect().height);
  if (h > 0) document.documentElement.style.setProperty('--topbar-h', `${h}px`);
}
window.addEventListener('resize', syncTopbarHeight);

/* ── 시작 ──────────────────────────────────────────── */
syncMarriage();
paintAmount();
render();
renderSpouse();
syncTopbarHeight();
