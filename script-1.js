/* =====================================================================
   플랫폼 노동 정책 시뮬레이터 - 로직 (script.js)
   ---------------------------------------------------------------
   이 파일은 크게 7개 부분으로 구성됩니다.
     [A] 데이터 모델  : 지표(METRICS), 정책(POLICIES), 프리셋(PRESETS)
     [B] 상태 관리    : state (현재 정책 ON/OFF, 강도)
     [C] 계산 엔진    : computeMetrics() — 정책 → 지표값 변환의 핵심
     [D] 화면 렌더링  : 정책카드/지표/차트/반응 그리기
     [E] 정책 분석    : 규칙 기반(rule-based) 분석 텍스트 생성
     [F] 메모/기록    : localStorage 저장
     [G] 초기화/이벤트: 화면 전환, 버튼 연결

   [수정 포인트]
     * 정책 효과를 바꾸려면 → [A]의 POLICIES 안 effects 값 수정
     * 새 정책 추가하려면   → POLICIES 배열에 객체 하나 더 추가
     * 분석 멘트 바꾸려면   → [E]의 문장 템플릿 수정
===================================================================== */

"use strict";

/* =====================================================================
   [A] 데이터 모델
===================================================================== */

/* ---- A-1. 8개 사회 지표 정의 ----
   - key      : 내부 식별자
   - label    : 화면에 보일 이름
   - base     : 정책이 하나도 없을 때의 기준값(0~100)
   - good     : true면 "높을수록 좋은 지표"(만족도 등),
                false면 "낮을수록 좋은 지표"(비용·실업률·갈등 등)
   왜 이렇게 설계했나?
   → 사회 현상은 한 방향으로만 좋아지지 않습니다. '좋은 지표'와
     '나쁜 지표'를 구분해야 정책의 '트레이드오프(상충관계)'를
     학생이 직관적으로 이해할 수 있습니다.                          */
const METRICS = [
  { key: "workerSat",  label: "노동자 만족도", base: 45, good: true },
  { key: "firmProfit", label: "기업 수익",     base: 62, good: true },
  { key: "consumerCost", label: "소비자 비용", base: 40, good: false },
  { key: "jobs",       label: "플랫폼 일자리", base: 58, good: true },
  { key: "stability",  label: "사회 안정성",   base: 50, good: true },
  { key: "govSpend",   label: "정부 지출",     base: 30, good: false },
  { key: "unemploy",   label: "실업률",        base: 35, good: false },
  { key: "conflict",   label: "사회 갈등 지수", base: 45, good: false },
];

/* ---- A-2. 정책 정의 ----
   effects: 강도 1단계당 각 지표에 더해지는 값(계수).
            실제 적용 시 = 계수 × 강도(level).
   왜 '계수 × 강도' 구조인가?
   → 정책의 '세기'를 학생이 조절하며 한계효용/부작용을 실험하도록
     하기 위함입니다. 강한 보호정책은 노동자에겐 좋지만 기업·비용
     쪽에 더 큰 음(-)의 효과를 주도록 설계했습니다.                 */
const POLICIES = [
  {
    id: "minIncome",
    emoji: "💰",
    name: "최저수입 보장제",
    tagline: "건당 단가/시간당 최저 보상 하한선 설정",
    effects: {
      workerSat: +6, firmProfit: -4, consumerCost: +2.5,
      jobs: -2, stability: +3.5, govSpend: +2, unemploy: +1, conflict: -2.5,
    },
    detail: {
      desc: "플랫폼 노동자가 일정 수준 이상의 수입을 얻도록 시간당·건당 최저 보상을 보장하는 제도.",
      example: "미국 시애틀·뉴욕시는 배달 노동자 최저보수 기준을 도입했습니다.",
      country: "EU는 '플랫폼노동 지침'으로 적정 보수·고용추정 원칙을 논의했습니다.",
      pros: ["소득 안정으로 생계 보장", "과로 유발 저단가 경쟁 완화"],
      cons: ["기업 비용 증가→일자리 축소 우려", "단가 상승이 소비자 가격 전가"],
    },
  },
  {
    id: "injury",
    emoji: "🩹",
    name: "산재보험 의무화",
    tagline: "업무 중 사고에 대한 산업재해 보험 가입 의무",
    effects: {
      workerSat: +5.5, firmProfit: -3.5, consumerCost: +1.5,
      jobs: -1, stability: +4, govSpend: +1.5, unemploy: +0.5, conflict: -3,
    },
    detail: {
      desc: "배달·운송 등 사고 위험이 큰 노동에 대해 산재보험 가입을 의무화하여 사고 시 보상받도록 함.",
      example: "한국은 특수형태근로종사자(특고) 산재보험 적용을 점차 확대해 왔습니다.",
      country: "독일·프랑스 등은 사회보험 적용 범위를 노동 형태에 맞게 확장 중입니다.",
      pros: ["사고 시 치료·생계 보장", "안전망 사각지대 축소"],
      cons: ["보험료 부담 주체 논쟁", "영세 사업자 부담 증가"],
    },
  },
  {
    id: "algorithm",
    emoji: "🔍",
    name: "알고리즘 투명성 강화",
    tagline: "배차·평점·노출 기준의 공개 및 이의제기 보장",
    effects: {
      workerSat: +4.5, firmProfit: -2, consumerCost: +0.5,
      jobs: 0, stability: +2.5, govSpend: +0.5, unemploy: 0, conflict: -4,
    },
    detail: {
      desc: "노동자에게 영향을 주는 알고리즘(배차·평점·계정정지) 기준을 공개하고 설명·이의제기 권리를 보장.",
      example: "EU 플랫폼노동 지침은 '알고리즘 관리'의 투명성과 인간의 감독을 요구합니다.",
      country: "스페인 '라이더법'은 배달 알고리즘 정보 공개 의무를 도입했습니다.",
      pros: ["불투명한 통제·차별 완화", "노동자 신뢰·예측가능성 향상"],
      cons: ["영업비밀 논란", "시스템 개편 비용"],
    },
  },
  {
    id: "worktime",
    emoji: "⏰",
    name: "노동시간 제한",
    tagline: "연속·일일 최대 가동시간 상한 설정",
    effects: {
      workerSat: +3, firmProfit: -3, consumerCost: +2,
      jobs: +2, stability: +3, govSpend: +0.5, unemploy: -2, conflict: -2,
    },
    detail: {
      desc: "장시간 노동·과로를 막기 위해 하루/연속 가동시간에 상한을 두는 제도.",
      example: "운수 분야는 안전을 위해 연속운전시간·휴게시간 규정을 두는 경우가 많습니다.",
      country: "EU는 근로시간지침으로 최대 노동시간·휴식을 규율합니다.",
      pros: ["과로·사고 예방", "일자리 나눔 효과(고용 분산)"],
      cons: ["고소득 희망 노동자의 소득 제약", "공급 감소로 대기시간 증가"],
    },
  },
  {
    id: "tax",
    emoji: "🏛️",
    name: "플랫폼 기업 세금 강화",
    tagline: "플랫폼 매출·수수료 수익에 대한 과세 강화",
    effects: {
      workerSat: +1, firmProfit: -6, consumerCost: +1.5,
      jobs: -2, stability: +1.5, govSpend: -3, unemploy: +1, conflict: +1,
    },
    detail: {
      desc: "대형 플랫폼의 수익에 과세를 강화하고, 그 재원을 사회안전망 등에 활용.",
      example: "여러 국가가 '디지털세' 형태로 플랫폼 매출 과세를 시도했습니다.",
      country: "프랑스 등은 디지털서비스세(DST)를 도입한 바 있습니다.",
      pros: ["복지 재원 확보(정부 지출 부담 완화)", "독과점 이익 환수"],
      cons: ["기업 투자·고용 위축 가능", "세 부담의 소비자·노동자 전가"],
    },
  },
  {
    id: "feeCap",
    emoji: "📉",
    name: "수수료 상한제",
    tagline: "플랫폼이 가맹점·노동자에게 부과하는 수수료 상한",
    effects: {
      workerSat: +3.5, firmProfit: -5, consumerCost: -1.5,
      jobs: -1, stability: +2, govSpend: +1, unemploy: +0.5, conflict: -1.5,
    },
    detail: {
      desc: "플랫폼이 가맹점·노동자에게 부과하는 중개수수료의 상한선을 설정.",
      example: "미국 일부 도시는 코로나 시기 음식배달 수수료 상한(약 15%)을 한시 시행했습니다.",
      country: "여러 지자체가 소상공인 보호를 위해 수수료 규제를 논의했습니다.",
      pros: ["가맹점·노동자 몫 증가", "가격 인하 여지(소비자 일부 이득)"],
      cons: ["플랫폼 수익성 악화", "서비스 투자 축소 우려"],
    },
  },
];

/* ---- A-3. 시나리오 프리셋 ----
   각 정책의 [켜짐 여부, 강도] 값을 미리 지정.
   왜 프리셋을 두나?
   → '노동자 중심 vs 기업 중심 vs 균형형'을 한 번에 비교하며
     가치 판단(어느 집단을 우선할 것인가)을 탐구하게 하기 위함.    */
const PRESETS = {
  worker: { // 노동자 보호 강하게
    minIncome: 5, injury: 5, algorithm: 4, worktime: 3, tax: 3, feeCap: 4,
  },
  company: { // 기업 부담 최소화 (대부분 끔)
    minIncome: 0, injury: 1, algorithm: 1, worktime: 0, tax: 0, feeCap: 0,
  },
  balanced: { // 균형
    minIncome: 3, injury: 4, algorithm: 3, worktime: 2, tax: 1, feeCap: 2,
  },
  reset: { // 전부 끔
    minIncome: 0, injury: 0, algorithm: 0, worktime: 0, tax: 0, feeCap: 0,
  },
};

/* =====================================================================
   [B] 상태(state) 관리
   - 각 정책의 현재 강도(level)를 저장. 0이면 OFF, 1~5면 ON+강도.
===================================================================== */
const state = {};
POLICIES.forEach((p) => (state[p.id] = 0)); // 처음엔 모두 OFF

/* 차트 객체를 담아둘 변수 (재렌더링 시 갱신용) */
let barChart, radarChart, lineChart, doughnutChart;
let lineHistory = []; // 선그래프 누적용 (정책 변경 시점마다 사회안정성 기록)

/* =====================================================================
   [C] 계산 엔진 — 정책 조합을 8개 지표값으로 변환
   핵심 아이디어:
     최종값 = 기준값(base) + Σ( 정책효과계수 × 강도 )
   그 뒤 0~100 범위로 자릅니다(clamp).
   ※ 단순 선형 모델: 고등학생이 인과를 추적하기 쉽게 한 의도적 단순화.
===================================================================== */
function computeMetrics() {
  const result = {};
  // 1) 기준값으로 시작
  METRICS.forEach((m) => (result[m.key] = m.base));
  // 2) 켜진 정책의 효과를 강도만큼 누적
  POLICIES.forEach((p) => {
    const level = state[p.id];
    if (level > 0) {
      for (const key in p.effects) {
        result[key] += p.effects[key] * level;
      }
    }
  });
  // 3) 0~100 사이로 제한
  for (const key in result) {
    result[key] = Math.max(0, Math.min(100, Math.round(result[key] * 10) / 10));
  }
  return result;
}

/* 기준값(정책 0개) 한 번 계산해 두기 — '적용 전' 비교용 */
const BASELINE = (() => {
  const r = {};
  METRICS.forEach((m) => (r[m.key] = m.base));
  return r;
})();

/* =====================================================================
   [D] 화면 렌더링
===================================================================== */

/* ---- D-1. 정책 카드 생성 ---- */
function renderPolicyCards() {
  const list = document.getElementById("policyList");
  list.innerHTML = "";

  POLICIES.forEach((p) => {
    const level = state[p.id];
    const card = document.createElement("div");
    card.className = "policy-card" + (level > 0 ? " on" : "");
    card.dataset.id = p.id;

    // 카드 내부 HTML (정책명/토글/강도 슬라이더/상세설명)
    card.innerHTML = `
      <div class="policy-card-top">
        <span class="policy-emoji">${p.emoji}</span>
        <div class="policy-info">
          <div class="policy-name">${p.name}</div>
          <div class="policy-tagline">${p.tagline}</div>
        </div>
        <div class="toggle" role="switch" aria-label="${p.name} 켜기/끄기"></div>
      </div>
      <div class="policy-strength">
        <span class="strength-label">강도</span>
        <input type="range" min="1" max="5" step="1" value="${level || 1}" />
        <span class="strength-val">Lv.${level || 1}</span>
      </div>
      <button class="policy-detail-toggle">ⓘ 설명 · 사례 · 장단점 보기</button>
      <div class="policy-detail">
        <dt>정책 설명</dt><dd>${p.detail.desc}</dd>
        <dt>실제 사례</dt><dd>${p.detail.example}</dd>
        <dt>국가 사례</dt><dd>${p.detail.country}</dd>
        <div class="pros-cons">
          <div class="pc-col pc-pro">
            <h5>장점</h5>
            <ul>${p.detail.pros.map((x) => `<li>${x}</li>`).join("")}</ul>
          </div>
          <div class="pc-col pc-con">
            <h5>단점</h5>
            <ul>${p.detail.cons.map((x) => `<li>${x}</li>`).join("")}</ul>
          </div>
        </div>
      </div>
    `;

    // (1) 토글 클릭 → ON/OFF
    card.querySelector(".toggle").addEventListener("click", () => {
      if (state[p.id] > 0) {
        state[p.id] = 0; // 끄기
      } else {
        // 켜기: 슬라이더의 현재 값으로 강도 설정
        const slider = card.querySelector('input[type="range"]');
        state[p.id] = parseInt(slider.value, 10) || 1;
      }
      clearPresetActive(); // 수동 변경 시 프리셋 강조 해제
      renderPolicyCards();
      updateAll();
    });

    // (2) 강도 슬라이더 → 강도 변경 (켜져 있을 때만 반영)
    const slider = card.querySelector('input[type="range"]');
    const valLabel = card.querySelector(".strength-val");
    slider.addEventListener("input", () => {
      valLabel.textContent = "Lv." + slider.value;
      if (state[p.id] > 0) {
        state[p.id] = parseInt(slider.value, 10);
        clearPresetActive();
        updateAll();
      }
    });

    // (3) 상세설명 토글
    const detailBtn = card.querySelector(".policy-detail-toggle");
    const detailBox = card.querySelector(".policy-detail");
    detailBtn.addEventListener("click", () => {
      detailBox.classList.toggle("open");
      detailBtn.textContent = detailBox.classList.contains("open")
        ? "ⓧ 설명 접기"
        : "ⓘ 설명 · 사례 · 장단점 보기";
    });

    list.appendChild(card);
  });
}

/* ---- D-2. 지표 게이지 렌더링 ---- */
function renderMetrics(values) {
  const grid = document.getElementById("metricGrid");
  grid.innerHTML = "";

  METRICS.forEach((m) => {
    const val = values[m.key];
    const baseVal = BASELINE[m.key];
    const diff = Math.round((val - baseVal) * 10) / 10;

    // 변화 방향(↑/↓) 및 '좋음/나쁨' 판정
    // good 지표는 오르면 초록, bad 지표는 오르면 빨강
    let deltaClass = "flat", deltaTxt = "변화 없음";
    if (diff > 0) {
      deltaTxt = "▲ " + diff;
      deltaClass = m.good ? "up" : "down";
    } else if (diff < 0) {
      deltaTxt = "▼ " + Math.abs(diff);
      deltaClass = m.good ? "down" : "up";
    }

    // 막대 색: 현재 상태가 사회적으로 '좋은' 방향이면 초록, 아니면 앰버/빨강
    const isGoodState = m.good ? val >= 55 : val <= 45;
    const barColor = isGoodState ? "var(--good)" : (val > (m.good ? 40 : 60) ? "var(--warn)" : "var(--bad)");

    const card = document.createElement("div");
    card.className = "metric-card";
    card.innerHTML = `
      <div class="metric-top">
        <span class="metric-name">${m.label}</span>
        <span class="metric-delta ${deltaClass}">${deltaTxt}</span>
      </div>
      <div class="metric-value">${val}<span style="font-size:13px;color:var(--txt-3)"> /100</span></div>
      <div class="metric-bar"><span style="width:${val}%; background:${barColor}"></span></div>
    `;
    grid.appendChild(card);
  });
}

/* ---- D-3. 차트 렌더링 (Chart.js) ---- */

// 차트 공통 색/옵션 (Chart.js가 로드된 경우에만 전역 기본값 설정)
const CHART_FONT = { family: "'IBM Plex Mono', monospace", size: 11 };
if (typeof Chart !== "undefined") {
  Chart.defaults.color = "#8595b0";
  Chart.defaults.borderColor = "#26334a";
  Chart.defaults.font.family = "'Noto Sans KR', sans-serif";
}

function renderCharts(values) {
  // Chart.js(CDN)가 로드되지 않은 경우(오프라인 등) 차트는 건너뜀.
  // → 나머지 기능(지표/분석/메모)은 정상 동작하도록 방어.
  if (typeof Chart === "undefined") {
    document.querySelectorAll(".chart-card canvas").forEach((c) => {
      const parent = c.parentElement;
      if (!parent.querySelector(".chart-fallback")) {
        const note = document.createElement("div");
        note.className = "chart-fallback";
        note.style.cssText =
          "padding:24px;text-align:center;color:var(--txt-3);font-size:13px;";
        note.textContent = "그래프 라이브러리를 불러오지 못했습니다 (인터넷 연결 필요).";
        parent.appendChild(note);
      }
    });
    return;
  }

  const labels = METRICS.map((m) => m.label);
  const beforeData = METRICS.map((m) => BASELINE[m.key]);
  const afterData = METRICS.map((m) => values[m.key]);

  /* (1) 막대그래프: 적용 전/후 비교 */
  if (barChart) barChart.destroy();
  barChart = new Chart(document.getElementById("barChart"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "적용 전", data: beforeData, backgroundColor: "rgba(133,149,176,0.45)", borderRadius: 4 },
        { label: "적용 후", data: afterData, backgroundColor: "rgba(159,232,112,0.85)", borderRadius: 4 },
      ],
    },
    options: baseBarOptions(),
  });

  /* (2) 레이더(원형 균형) 차트: 이해관계자 4축 균형
     - 노동자/기업/소비자/사회 4개 축으로 압축해 균형을 시각화 */
  const stakeholder = computeStakeholderScores(values);
  if (radarChart) radarChart.destroy();
  radarChart = new Chart(document.getElementById("radarChart"), {
    type: "radar",
    data: {
      labels: ["노동자", "기업", "소비자", "정부재정", "사회안정"],
      datasets: [{
        label: "현재 정책",
        data: stakeholder,
        backgroundColor: "rgba(79,209,217,0.18)",
        borderColor: "#4fd1d9",
        borderWidth: 2,
        pointBackgroundColor: "#9fe870",
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        r: {
          min: 0, max: 100,
          ticks: { display: false, stepSize: 25 },
          grid: { color: "#26334a" },
          angleLines: { color: "#26334a" },
          pointLabels: { font: { size: 12 }, color: "#c2cde0" },
        },
      },
    },
  });

  /* (3) 선그래프: 정책을 바꿀 때마다 '사회 안정성'을 누적 기록 */
  if (lineChart) lineChart.destroy();
  lineChart = new Chart(document.getElementById("lineChart"), {
    type: "line",
    data: {
      labels: lineHistory.map((_, i) => "실험 " + (i + 1)),
      datasets: [{
        label: "사회 안정성",
        data: lineHistory,
        borderColor: "#9fe870",
        backgroundColor: "rgba(159,232,112,0.12)",
        fill: true,
        tension: 0.35,
        pointRadius: 3,
        pointBackgroundColor: "#9fe870",
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { min: 0, max: 100, grid: { color: "#1c2636" } },
        x: { grid: { display: false } },
      },
    },
  });

  /* (4) 도넛 차트: 사회적 비용·편익 구성
     - 편익(노동자만족+사회안정+일자리) vs 비용(소비자비용+정부지출+갈등) */
  const benefit = values.workerSat + values.stability + values.jobs;
  const cost = values.consumerCost + values.govSpend + values.conflict;
  const firm = values.firmProfit;
  if (doughnutChart) doughnutChart.destroy();
  doughnutChart = new Chart(document.getElementById("doughnutChart"), {
    type: "doughnut",
    data: {
      labels: ["사회적 편익", "사회적 비용", "기업 수익"],
      datasets: [{
        data: [benefit, cost, firm],
        backgroundColor: ["#9fe870", "#ff6b6b", "#4fd1d9"],
        borderColor: "#141b27",
        borderWidth: 3,
      }],
    },
    options: {
      responsive: true,
      cutout: "62%",
      plugins: {
        legend: { position: "bottom", labels: { padding: 14, font: { size: 12 } } },
      },
    },
  });
}

// 막대 차트 옵션 (가독성 위해 분리)
function baseBarOptions() {
  return {
    responsive: true,
    plugins: {
      legend: { position: "top", labels: { font: { size: 12 }, padding: 16 } },
      tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y}` } },
    },
    scales: {
      y: { min: 0, max: 100, grid: { color: "#1c2636" }, ticks: { stepSize: 25 } },
      x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 45, minRotation: 30 } },
    },
  };
}

/* 이해관계자 5축 점수로 압축 (레이더용)
   - 비용/실업/갈등 등 '낮을수록 좋은' 지표는 (100-값)으로 뒤집어
     "높을수록 좋다"는 공통 축으로 통일. */
function computeStakeholderScores(v) {
  const worker = (v.workerSat + (100 - v.unemploy)) / 2;
  const firm = v.firmProfit;
  const consumer = 100 - v.consumerCost;
  const gov = 100 - v.govSpend;
  const social = (v.stability + (100 - v.conflict)) / 2;
  return [worker, firm, consumer, gov, social].map((x) => Math.round(x));
}

/* =====================================================================
   [E] 정책 분석 (규칙 기반 — 실제 AI API 없이 동작)
   - 현재 지표를 보고 장점/단점/부작용/균형방향 문장을 조립합니다.
   - "규칙 기반"이라고 명시하는 이유: 보고서에서 '데이터 기반 추론'과
     '실제 생성형 AI'를 구분해 서술하면 탐구의 정확성이 높아집니다.
===================================================================== */
function runAnalysis() {
  const v = computeMetrics();
  const active = POLICIES.filter((p) => state[p.id] > 0);
  const box = document.getElementById("analysisResult");

  // 정책이 하나도 없을 때
  if (active.length === 0) {
    box.innerHTML = `<div class="analysis-empty">현재 활성화된 정책이 없습니다. 정책을 켠 뒤 다시 분석해 보세요.</div>`;
    return;
  }

  // 종합 점수 3종 계산
  const stake = computeStakeholderScores(v);
  const workerScore = stake[0];
  const firmScore = stake[1];
  const socialScore = stake[4];
  const balance = 100 - (Math.max(workerScore, firmScore) - Math.min(workerScore, firmScore)); // 균형도

  // 장점 문장 모으기
  const pros = [];
  if (v.workerSat >= 60) pros.push("노동자 만족도가 뚜렷하게 개선되어 생계·근로 안정성이 높아집니다.");
  if (v.stability >= 60) pros.push("사회 안정성이 상승해 노동 분쟁·이탈 위험이 줄어듭니다.");
  if (v.conflict <= 35) pros.push("사회 갈등 지수가 낮아 정책 수용성이 비교적 높습니다.");
  if (v.unemploy <= 30) pros.push("실업률이 안정적으로 유지되어 고용 충격이 작습니다.");
  if (pros.length === 0) pros.push("개별 지표 개선 폭은 작지만, 제도적 안전망의 토대를 마련합니다.");

  // 단점/부작용 문장 모으기
  const cons = [];
  if (v.firmProfit <= 45) cons.push("기업 수익이 크게 줄어 투자·서비스 축소로 이어질 수 있습니다.");
  if (v.consumerCost >= 55) cons.push("소비자 비용이 올라 가격 인상·이용 감소가 우려됩니다.");
  if (v.jobs <= 50) cons.push("플랫폼 일자리가 감소해 진입 기회가 줄 수 있습니다.");
  if (v.govSpend >= 45) cons.push("정부 지출 부담이 커져 재원 마련 방안이 필요합니다.");
  if (cons.length === 0) cons.push("현재 조합에서 큰 부작용은 두드러지지 않으나, 강도 상향 시 비용이 급증할 수 있습니다.");

  // 예상 부작용(상충관계 강조)
  const risks = [];
  if (v.firmProfit <= 40 && v.jobs <= 50)
    risks.push("기업 부담 급증 → 일자리 축소의 '연쇄 효과'가 나타날 수 있습니다.");
  if (v.consumerCost >= 60)
    risks.push("비용 상승분이 소비자에게 전가되면 정책의 사회적 지지가 약화될 수 있습니다.");
  if (workerScore - firmScore >= 30)
    risks.push("노동자에 치우친 설계로 기업·투자자의 반발(서비스 철수 등)이 커질 수 있습니다.");
  if (firmScore - workerScore >= 30)
    risks.push("기업 친화적 설계로 노동자 보호가 약해 노동조합·여론의 반발이 예상됩니다.");
  if (risks.length === 0)
    risks.push("뚜렷한 단일 부작용은 적지만, 정책 간 상호작용으로 예측이 어려운 영역이 존재합니다.");

  // 균형 방향 제안
  const advice = [];
  if (workerScore - firmScore >= 20)
    advice.push("기업 부담 완화책(예: 보험료 분담·세제 지원)을 함께 설계해 일자리 충격을 줄이세요.");
  else if (firmScore - workerScore >= 20)
    advice.push("최소한의 안전망(산재·알고리즘 투명성)을 보강해 노동자 보호 공백을 메우세요.");
  else
    advice.push("현재 조합은 비교적 균형적입니다. 강도를 미세 조정하며 비용 대비 효과를 점검하세요.");
  if (v.govSpend >= 45)
    advice.push("정부 지출이 큰 만큼, 세금 강화 등 재원 조달 정책과 묶어 지속가능성을 확보하세요.");

  // 화면에 출력
  box.innerHTML = `
    <div class="analysis-score">
      <div class="score-item"><span class="lbl">노동자 점수</span><span class="val" style="color:var(--good)">${workerScore}</span></div>
      <div class="score-item"><span class="lbl">기업 점수</span><span class="val" style="color:var(--info)">${firmScore}</span></div>
      <div class="score-item"><span class="lbl">사회 점수</span><span class="val" style="color:var(--acc)">${socialScore}</span></div>
      <div class="score-item"><span class="lbl">균형도</span><span class="val" style="color:var(--warn)">${balance}</span></div>
    </div>
    ${analysisBlock("정책의 장점", "tag-pro", "PROS", pros)}
    ${analysisBlock("단점 · 한계", "tag-con", "CONS", cons)}
    ${analysisBlock("예상 부작용", "tag-risk", "RISK", risks)}
    ${analysisBlock("균형적 정책 방향 제안", "tag-balance", "BALANCE", advice)}
  `;
  showToast("정책 분석을 완료했습니다");
}

// 분석 블록 HTML 생성 헬퍼
function analysisBlock(title, tagClass, tagText, items) {
  return `
    <div class="analysis-block">
      <h4>${title} <span class="tag ${tagClass}">${tagText}</span></h4>
      <ul>${items.map((x) => `<li>${x}</li>`).join("")}</ul>
    </div>`;
}

/* =====================================================================
   [E-2] 사회 반응 시뮬레이션
   - 지표값에 따라 4개 주체(시민/기업/노조/언론)의 '톤'과 멘트 결정
===================================================================== */
function renderReactions(v) {
  const grid = document.getElementById("reactionGrid");

  // 시민(소비자) — 비용에 민감
  const citizen = v.consumerCost >= 58
    ? { mood: "negative", txt: "“서비스 가격이 너무 올랐다”는 불만이 늘고 있습니다." }
    : v.consumerCost <= 38
    ? { mood: "positive", txt: "“가격 부담이 줄어 만족스럽다”는 반응이 많습니다." }
    : { mood: "neutral", txt: "체감 변화는 크지 않다는 의견이 다수입니다." };

  // 기업 — 수익에 민감
  const firm = v.firmProfit <= 42
    ? { mood: "negative", txt: "“규제 부담으로 사업 지속이 어렵다”며 우려를 표합니다." }
    : v.firmProfit >= 62
    ? { mood: "positive", txt: "“안정적 수익 환경”이라며 투자 의향을 밝힙니다." }
    : { mood: "mixed", txt: "“부담은 있지만 감내 가능한 수준”이라 평가합니다." };

  // 노동조합 — 노동자 만족도·안전망에 민감
  const union = v.workerSat >= 60
    ? { mood: "positive", txt: "“노동자 권익이 실질적으로 개선됐다”며 환영합니다." }
    : v.workerSat <= 42
    ? { mood: "negative", txt: "“보호 장치가 여전히 부족하다”며 추가 대책을 촉구합니다." }
    : { mood: "mixed", txt: "“방향은 맞지만 속도가 더디다”는 입장입니다." };

  // 언론 — 갈등·균형에 민감
  const media = v.conflict >= 55
    ? { mood: "negative", txt: "“이해관계 충돌 격화”를 비중 있게 보도합니다." }
    : v.conflict <= 35
    ? { mood: "positive", txt: "“사회적 합의 모범 사례”로 긍정 평가합니다." }
    : { mood: "neutral", txt: "정책의 명암을 균형 있게 다룹니다." };

  const data = [
    { emoji: "🧑‍🤝‍🧑", who: "시민·소비자", ...citizen },
    { emoji: "🏢", who: "플랫폼 기업", ...firm },
    { emoji: "✊", who: "노동조합", ...union },
    { emoji: "📰", who: "언론", ...media },
  ];

  const moodLabel = { positive: "긍정적", negative: "부정적", mixed: "복합적", neutral: "중립적" };

  grid.innerHTML = data
    .map(
      (d) => `
    <div class="reaction-card">
      <div class="reaction-head">
        <span class="reaction-emoji">${d.emoji}</span>
        <div>
          <div class="reaction-who">${d.who}</div>
          <div class="reaction-mood mood-${d.mood}">● ${moodLabel[d.mood]}</div>
        </div>
      </div>
      <div class="reaction-text">${d.txt}</div>
    </div>`
    )
    .join("");
}

/* =====================================================================
   [통합 업데이트] 정책이 바뀔 때마다 호출되는 메인 함수
===================================================================== */
function updateAll() {
  const values = computeMetrics();

  // 선그래프 누적: 정책이 1개라도 켜져 있을 때만 기록 (최대 12개 유지)
  const activeCount = POLICIES.filter((p) => state[p.id] > 0).length;
  if (activeCount > 0) {
    lineHistory.push(values.stability);
    if (lineHistory.length > 12) lineHistory.shift();
  }

  renderMetrics(values);
  renderCharts(values);
  renderReactions(values);
  updateNavStatus(activeCount);
}

// 헤더 상태 표시 갱신
function updateNavStatus(count) {
  const el = document.getElementById("navStatus");
  el.textContent = count === 0 ? "정책 0개 적용" : `정책 ${count}개 적용 중`;
  el.style.color = count > 0 ? "var(--acc)" : "var(--txt-3)";
}

/* =====================================================================
   [F] 메모 / 탐구 기록 (localStorage 사용)
===================================================================== */
const MEMO_KEY = "platformLaborMemos";

function loadMemos() {
  try {
    return JSON.parse(localStorage.getItem(MEMO_KEY)) || [];
  } catch {
    return [];
  }
}
function saveMemos(memos) {
  localStorage.setItem(MEMO_KEY, JSON.stringify(memos));
}
function renderMemos() {
  const list = document.getElementById("memoList");
  const memos = loadMemos();
  if (memos.length === 0) {
    list.innerHTML = `<p style="color:var(--txt-3); font-size:13px;">아직 저장된 탐구 기록이 없습니다.</p>`;
    return;
  }
  list.innerHTML = memos
    .map(
      (m, i) => `
    <div class="memo-item">
      <button class="memo-del" data-idx="${i}" title="삭제">×</button>
      <span class="memo-time">${m.time}</span>
      <h5>선택 정책</h5><p>${escapeHtml(m.policy) || "—"}</p>
      <h5>결과 요약</h5><p>${escapeHtml(m.result) || "—"}</p>
      <h5>해석 / 느낀 점</h5><p>${escapeHtml(m.thought) || "—"}</p>
    </div>`
    )
    .join("");

  // 삭제 버튼 연결
  list.querySelectorAll(".memo-del").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.idx, 10);
      const memos = loadMemos();
      memos.splice(idx, 1);
      saveMemos(memos);
      renderMemos();
      showToast("기록을 삭제했습니다");
    });
  });
}

// XSS 방지용 간단 이스케이프
function escapeHtml(str) {
  return (str || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// '현재 결과 자동 채우기' — 활성 정책과 핵심 결과를 텍스트로 요약
function autoFillMemo() {
  const v = computeMetrics();
  const active = POLICIES.filter((p) => state[p.id] > 0);
  const policyText = active.length
    ? active.map((p) => `${p.name}(Lv.${state[p.id]})`).join(" + ")
    : "선택된 정책 없음";
  const resultText =
    `노동자 만족도 ${v.workerSat}, 기업 수익 ${v.firmProfit}, ` +
    `소비자 비용 ${v.consumerCost}, 사회 안정성 ${v.stability}, 사회 갈등 ${v.conflict}`;

  document.getElementById("memoPolicy").value = policyText;
  document.getElementById("memoResult").value = resultText;
  showToast("현재 결과를 메모에 채웠습니다");
}

/* =====================================================================
   [G] 프리셋 / 화면전환 / 이벤트 연결
===================================================================== */

// 프리셋 적용
function applyPreset(name) {
  const preset = PRESETS[name];
  if (!preset) return;
  POLICIES.forEach((p) => {
    state[p.id] = preset[p.id] || 0;
  });
  // 프리셋 버튼 강조
  document.querySelectorAll(".preset-btn").forEach((b) => b.classList.remove("active"));
  if (name !== "reset") {
    const btn = document.querySelector(`.preset-btn[data-preset="${name}"]`);
    if (btn) btn.classList.add("active");
  }
  renderPolicyCards();
  updateAll();
  showToast(presetLabel(name) + " 시나리오를 적용했습니다");
}
function presetLabel(name) {
  return { worker: "노동자 중심", company: "기업 중심", balanced: "균형형", reset: "초기화" }[name] || name;
}
function clearPresetActive() {
  document.querySelectorAll(".preset-btn").forEach((b) => b.classList.remove("active"));
}

// 화면(view) 전환
function switchView(view) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.getElementById("view-" + view).classList.add("active");
  document.querySelectorAll(".nav-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.view === view)
  );
  window.scrollTo({ top: 0, behavior: "smooth" });
  // 실험실로 들어올 때 차트 크기 재조정(숨겨진 상태에서 그려지면 깨질 수 있어 갱신)
  if (view === "lab") setTimeout(updateAll, 60);
}

// 통계 카운트업 애니메이션 (시작 화면)
function animateCounts() {
  document.querySelectorAll(".count").forEach((el) => {
    const target = parseFloat(el.dataset.target);
    const suffix = el.dataset.suffix || "";
    const decimal = parseInt(el.dataset.decimal || "0", 10);
    const duration = 1200;
    const start = performance.now();
    function step(now) {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out
      const val = target * eased;
      el.textContent = (decimal ? val.toFixed(decimal) : Math.round(val)) + suffix;
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  });
}

// 토스트 알림
let toastTimer;
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

/* ---- 초기화 (DOM 준비되면 실행) ---- */
document.addEventListener("DOMContentLoaded", () => {
  renderPolicyCards();
  updateAll();
  renderMemos();
  animateCounts();

  // 시작 버튼
  document.getElementById("startBtn").addEventListener("click", () => switchView("lab"));

  // 네비/뷰 전환 버튼 (data-view 속성을 가진 모든 버튼)
  document.querySelectorAll("[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  // 프리셋 버튼
  document.querySelectorAll(".preset-btn").forEach((btn) => {
    btn.addEventListener("click", () => applyPreset(btn.dataset.preset));
  });

  // 분석 버튼
  document.getElementById("analyzeBtn").addEventListener("click", runAnalysis);

  // 메모 버튼들
  document.getElementById("memoAutoFill").addEventListener("click", autoFillMemo);
  document.getElementById("memoSave").addEventListener("click", () => {
    const policy = document.getElementById("memoPolicy").value.trim();
    const result = document.getElementById("memoResult").value.trim();
    const thought = document.getElementById("memoThought").value.trim();
    if (!policy && !result && !thought) {
      showToast("내용을 입력한 뒤 저장하세요");
      return;
    }
    const memos = loadMemos();
    const now = new Date();
    const time = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(
      now.getDate()
    ).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    memos.unshift({ policy, result, thought, time });
    saveMemos(memos);
    renderMemos();
    // 입력창 비우기
    document.getElementById("memoPolicy").value = "";
    document.getElementById("memoResult").value = "";
    document.getElementById("memoThought").value = "";
    showToast("탐구 기록을 저장했습니다");
  });

  // 텍스트 내보내기
  document.getElementById("memoExport").addEventListener("click", () => {
    const memos = loadMemos();
    if (memos.length === 0) {
      showToast("내보낼 기록이 없습니다");
      return;
    }
    let txt = "===== 플랫폼 노동 정책 시뮬레이터 · 탐구 기록 =====\n\n";
    memos.forEach((m, i) => {
      txt += `[기록 ${i + 1}] ${m.time}\n`;
      txt += `· 선택 정책: ${m.policy || "—"}\n`;
      txt += `· 결과 요약: ${m.result || "—"}\n`;
      txt += `· 해석/느낀점: ${m.thought || "—"}\n\n`;
    });
    // 파일로 다운로드
    const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "탐구기록_플랫폼노동정책.txt";
    a.click();
    URL.revokeObjectURL(a.href);
    showToast("탐구 기록을 텍스트로 내보냈습니다");
  });
});
