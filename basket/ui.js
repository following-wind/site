// 画面の表示だけを担当する。計算はgame.js側の関数を呼ぶだけで、
// ここには生成・成長・年俸などのロジックを書かない。

// プレイヤーのチーム。DESIGN.md「チームと性格の対応」どおり札幌ドリフト
// （TEAM_NAMESの4番目、戦力係数-9で最弱）に固定。弱いところから育てる
// 前提のゲームなので、あえて最強チームにはしていない。
var MY_TEAM_INDEX = 3;
var league; // setupLeague()で作った、この画面の間ずっと使い回すデータ

var ABILITY_ORDER = ["two", "three", "drib", "reb", "defe"];
var ABILITY_LABELS = { two: "2P", three: "3P", drib: "D", reb: "R", defe: "DF" };

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// 5項目のうち最も高い項目のキーを返す（同点なら先に見つかった方）
function topAbilityKey(player) {
  var top = ABILITY_ORDER[0];
  ABILITY_ORDER.forEach(function (key) {
    if (player[key] > player[top]) top = key;
  });
  return top;
}

// 伸びしろの表示。26歳以下は隠して「?」、27歳を過ぎたら
// 「止」か「↓」で衰えの向きだけ見せる（数字そのものは出さない）。
function growthHintLabel(player) {
  var bracket = ageBracket(player.age);
  if (bracket === "growth") return "?";
  if (bracket === "plateau") return "止";
  return "↓";
}

// バーの最大高さ(px)。能力40はここが0px、99はここが満タンになる。
// 以前は%指定でネストしたflexの中に置いていたため、ラベル分だけ実際の
// 高さが目減りして差が見えにくかった。pxで直接計算する方式に変えた。
var BAR_MAX_HEIGHT = 60;

function renderAbilityBars(player) {
  var top = topAbilityKey(player);
  var html = "";
  ABILITY_ORDER.forEach(function (key) {
    var value = player[key];
    var ratio = (value - 40) / (99 - 40); // 40を底、99を天井にする
    var heightPx = Math.round(ratio * BAR_MAX_HEIGHT);
    var fillClass = "bar-fill" + (key === top ? " bar-fill--top" : "");
    html +=
      '<div class="bar-col">' +
        '<div class="bar-track"><div class="' + fillClass + '" style="height:' + heightPx + 'px"></div></div>' +
        '<div class="bar-label">' + ABILITY_LABELS[key] + "</div>" +
      "</div>";
  });
  return html;
}

// 前シーズンの1試合平均成績。得点・リバウンド・アシスト・スティールを
// SEASON_GAMES(36試合)で割って1行にする。まだ一度もplaySeason()を
// 経験していない選手（新人としてFAにいる間、または初シーズン中）は
// player.statsが無いので、その旨を表示する。
function perGameStatsLine(player) {
  if (!player.stats) return "前シーズン成績なし（新人）";
  var games = SEASON_GAMES;
  var ppg = (player.stats.points / games).toFixed(1);
  var rpg = (player.stats.rebounds / games).toFixed(1);
  var apg = (player.stats.assists / games).toFixed(1);
  var spg = (player.stats.steals / games).toFixed(1);
  return ppg + "点 " + rpg + "R " + apg + "A " + spg + "S";
}

// 契約の残り年数の表示。0以下（契約更改タブでの判断待ち）は目立たせる。
function contractStatusLabel(player) {
  if (player.contractYears <= 0) return '<span class="stat-chip stat-chip--pending">契約更改待ち</span>';
  return '<span class="stat-chip">残り' + player.contractYears + '年</span>';
}

function renderPlayerCard(player) {
  var card = document.createElement("div");
  card.className = "player-card";
  card.innerHTML =
    '<div class="player-head">' +
      '<div class="player-name">' + escapeHtml(player.name) + "</div>" +
      '<div class="player-meta">' + escapeHtml(player.type) + "・" + player.age + "歳</div>" +
    "</div>" +
    '<div class="player-stats-line">' +
      '<span class="stat-chip">総合 ' + Math.round(overall(player)) + '</span>' +
      '<span class="stat-chip">年俸 ' + player.contractSalary + '万円</span>' +
      contractStatusLabel(player) +
    "</div>" +
    '<div class="stats-line">' + perGameStatsLine(player) + "</div>" +
    '<div class="ability-bars">' + renderAbilityBars(player) + "</div>" +
    '<div class="growth-hint">伸びしろ <span class="value">' + growthHintLabel(player) + "</span></div>";
  return card;
}

// 自チームタブ: ロースターを総合力の高い順に並べて、1人1カードで縦に積む
function renderTeamTab(container) {
  var team = league.teams[MY_TEAM_INDEX];

  var heading = document.createElement("p");
  heading.className = "team-name";
  heading.textContent = team.name;
  container.appendChild(heading);

  var rosterEl = document.createElement("div");
  rosterEl.className = "card-grid";
  container.appendChild(rosterEl);

  var sorted = team.roster.slice().sort(function (a, b) {
    return overall(b) - overall(a);
  });
  sorted.forEach(function (player) {
    rosterEl.appendChild(renderPlayerCard(player));
  });
}

// 順位表タブ: 4チームを勝ち数の多い順に並べ、自チームの行だけ強調する。
// 性格列はAIチームの癖を覚える手がかりなので毎回表示する。
// 自チームの行は性格名の代わりに「あなた」と表示する。
function renderStandingsTab(container) {
  var standings = league.teams.slice().sort(function (a, b) {
    return b.wins - a.wins;
  });

  var table = document.createElement("table");
  table.className = "standings";
  var rowsHtml = standings.map(function (team, index) {
    var games = team.wins + team.losses;
    var winRate = games > 0 ? (team.wins / games * 100).toFixed(1) : "0.0";
    var teamIndex = league.teams.indexOf(team);
    var isMine = teamIndex === MY_TEAM_INDEX;
    var personalityLabel = isMine ? "あなた" : PERSONALITY_LABELS[TEAM_PERSONALITIES[teamIndex]];
    return (
      '<tr class="' + (isMine ? "standings-row--mine" : "") + '">' +
        "<td>" + (index + 1) + "</td>" +
        "<td>" + escapeHtml(team.name) + "</td>" +
        "<td>" + escapeHtml(personalityLabel) + "</td>" +
        "<td>" + team.wins + "勝" + team.losses + "敗</td>" +
        "<td>" + winRate + "%</td>" +
      "</tr>"
    );
  }).join("");

  table.innerHTML =
    "<thead><tr><th>順位</th><th>チーム</th><th>性格</th><th>成績</th><th>勝率</th></tr></thead>" +
    "<tbody>" + rowsHtml + "</tbody>";

  container.appendChild(table);
}

// FA市場タブでのオフシーズン経過（週）。スライダーで動かして、
// 要求額が値下がりしていく様子をその場で見られるようにする。
var faOffseasonWeek = 0;

// 1人分のFA選手カード。獲得の契約年数(1年/3年)を選び、「獲得する」で
// 自チームに加える。シーズン中・ロースター上限・キャップ超過のいずれかに
// 当てはまる間はボタンを無効化し、理由を表示する（優先順位はこの順）。
function renderFaCard(player) {
  var card = document.createElement("div");
  card.className = "player-card";

  var baseSalary = playerSalary(player);
  var currentPrice = faAskingPrice(baseSalary, faOffseasonWeek);
  var discountLine =
    faOffseasonWeek > 0
      ? '<div class="fa-discount-line">当初 <span class="original">' + baseSalary + "万円</span> から値下がり中</div>"
      : "";

  card.innerHTML =
    '<div class="player-head">' +
      '<div class="player-name">' + escapeHtml(player.name) + "</div>" +
      '<div class="player-meta">' + escapeHtml(player.type) + "・" + player.age + "歳</div>" +
    "</div>" +
    '<div class="player-stats-line">' +
      '<span class="stat-chip">総合 ' + Math.round(overall(player)) + '</span>' +
      '<span class="stat-chip">要求額 ' + currentPrice + '万円</span>' +
    "</div>" +
    discountLine +
    '<div class="stats-line">' + perGameStatsLine(player) + "</div>" +
    '<div class="ability-bars">' + renderAbilityBars(player) + "</div>";

  var decision = document.createElement("div");
  decision.className = "contract-decision";

  var selectedYears = RESIGN_DURATION_OPTIONS[0];
  var durationRow = document.createElement("div");
  durationRow.className = "duration-choice";
  var durationButtons = [];
  RESIGN_DURATION_OPTIONS.forEach(function (years) {
    var btn = document.createElement("button");
    btn.className = "duration-btn" + (years === selectedYears ? " active" : "");
    btn.textContent = years + "年";
    btn.addEventListener("click", function () {
      selectedYears = years;
      durationButtons.forEach(function (entry) {
        entry.btn.className = "duration-btn" + (entry.years === selectedYears ? " active" : "");
      });
    });
    durationRow.appendChild(btn);
    durationButtons.push({ years: years, btn: btn });
  });
  decision.appendChild(durationRow);

  var blockReason = faSignBlockReason(player);

  var actionsRow = document.createElement("div");
  actionsRow.className = "contract-actions";

  var signBtn = document.createElement("button");
  signBtn.className = "resign-btn";
  signBtn.textContent = "獲得する";
  signBtn.disabled = !!blockReason;
  signBtn.addEventListener("click", function () {
    signFaPlayer(player, selectedYears);
  });
  actionsRow.appendChild(signBtn);
  decision.appendChild(actionsRow);

  if (blockReason) {
    var warn = document.createElement("p");
    warn.className = "cap-warning";
    warn.textContent = blockReason;
    decision.appendChild(warn);
  }

  card.appendChild(decision);
  return card;
}

function renderFaList(listEl) {
  listEl.innerHTML = "";
  var sorted = league.freeAgents.slice().sort(function (a, b) {
    return overall(b) - overall(a);
  });
  sorted.forEach(function (player) {
    listEl.appendChild(renderFaCard(player));
  });
}

// FA市場タブ: 獲得できる選手の一覧。オフシーズン経過スライダーを動かすと
// 要求額(faAskingPrice)が下がっていくのがその場で分かる。
// 獲得はオフシーズン中だけできる。今どちらの状態かを先頭に出しておく
// （シーズン中に見に来て「なぜ獲得できないか」で悩まないように）。
// スライダーと週数表示はcreateElementで組み立てて直接参照を持つ
// （innerHTML文字列に埋め込むとgetElementByIdでの取得に頼ることになり壊れやすいため）。
function renderFaMarketTab(container) {
  var statusLine = document.createElement("div");
  statusLine.className = "cap-summary";
  statusLine.textContent = inOffseason
    ? "オフシーズン中: 今なら獲得できます"
    : "シーズン中: 獲得は次のオフシーズンまでお待ちください";
  container.appendChild(statusLine);

  var controls = document.createElement("div");
  controls.className = "fa-controls";

  var label = document.createElement("label");
  label.className = "fa-week-label";
  label.setAttribute("for", "fa-week-slider");
  label.innerHTML = "オフシーズン経過: ";

  var weekValue = document.createElement("strong");
  weekValue.textContent = faOffseasonWeek + "週目";
  label.appendChild(weekValue);

  var slider = document.createElement("input");
  slider.type = "range";
  slider.id = "fa-week-slider";
  slider.className = "fa-week-slider";
  slider.min = "0";
  slider.max = "8";
  slider.step = "2";
  slider.value = String(faOffseasonWeek);

  controls.appendChild(label);
  controls.appendChild(slider);
  container.appendChild(controls);

  var listEl = document.createElement("div");
  listEl.className = "card-grid";
  container.appendChild(listEl);

  renderFaList(listEl);

  slider.addEventListener("input", function (e) {
    faOffseasonWeek = parseInt(e.target.value, 10);
    weekValue.textContent = faOffseasonWeek + "週目";
    renderFaList(listEl);
  });
}

// 自チームに契約更改の対象（contractYears<=0）がまだ残っているか
function hasPendingRenewals() {
  return league.teams[MY_TEAM_INDEX].roster.some(function (p) { return p.contractYears <= 0; });
}

// 1人分の契約更改カード。要求額・契約年数(1年/3年)の選択・
// 「再契約する」「解雇する」ボタンを持つ。キャップを超える契約は
// resignBtn自体を無効化して選べないようにする。
function renderContractCard(player) {
  var card = document.createElement("div");
  card.className = "player-card contract-card";
  card.innerHTML =
    '<div class="player-head">' +
      '<div class="player-name">' + escapeHtml(player.name) + "</div>" +
      '<div class="player-meta">' + escapeHtml(player.type) + "・" + player.age + "歳</div>" +
    "</div>" +
    '<div class="player-stats-line">' +
      '<span class="stat-chip">総合 ' + Math.round(overall(player)) + '</span>' +
      '<span class="stat-chip">要求額 ' + playerSalary(player) + '万円</span>' +
    "</div>" +
    '<div class="stats-line">' + perGameStatsLine(player) + "</div>" +
    '<div class="ability-bars">' + renderAbilityBars(player) + "</div>";

  var decision = document.createElement("div");
  decision.className = "contract-decision";

  var selectedYears = RESIGN_DURATION_OPTIONS[0];
  var durationRow = document.createElement("div");
  durationRow.className = "duration-choice";
  var durationButtons = [];
  RESIGN_DURATION_OPTIONS.forEach(function (years) {
    var btn = document.createElement("button");
    btn.className = "duration-btn" + (years === selectedYears ? " active" : "");
    btn.textContent = years + "年";
    btn.addEventListener("click", function () {
      selectedYears = years;
      durationButtons.forEach(function (entry) {
        entry.btn.className = "duration-btn" + (entry.years === selectedYears ? " active" : "");
      });
    });
    durationRow.appendChild(btn);
    durationButtons.push({ years: years, btn: btn });
  });
  decision.appendChild(durationRow);

  var askingPrice = playerSalary(player);
  var team = league.teams[MY_TEAM_INDEX];
  var canAfford = teamCommittedSalary(team) + askingPrice <= SALARY_CAP;

  var actionsRow = document.createElement("div");
  actionsRow.className = "contract-actions";

  var resignBtn = document.createElement("button");
  resignBtn.className = "resign-btn";
  resignBtn.textContent = "再契約する";
  resignBtn.disabled = !canAfford;
  resignBtn.addEventListener("click", function () {
    resolveContractDecision(player, "resign", selectedYears);
  });
  actionsRow.appendChild(resignBtn);

  var releaseBtn = document.createElement("button");
  releaseBtn.className = "release-btn";
  releaseBtn.textContent = "解雇する";
  releaseBtn.addEventListener("click", function () {
    resolveContractDecision(player, "release", null);
  });
  actionsRow.appendChild(releaseBtn);

  decision.appendChild(actionsRow);

  if (!canAfford) {
    var warn = document.createElement("p");
    warn.className = "cap-warning";
    warn.textContent = "キャップ超過のため契約できません";
    decision.appendChild(warn);
  }

  card.appendChild(decision);
  return card;
}

// 契約更改タブ: 契約が切れた（contractYears<=0）自チームの選手だけを一覧表示する。
// AIチーム3チーム分はgame.js側のrunContractDecisions()が自動で処理済み。
function renderContractsTab(container) {
  var team = league.teams[MY_TEAM_INDEX];

  var used = teamCommittedSalary(team);
  var capLine = document.createElement("div");
  capLine.className = "cap-summary";
  capLine.innerHTML =
    "キャップ使用中: <strong>" + used + "万円</strong> / " + SALARY_CAP + "万円" +
    "（残り<strong>" + (SALARY_CAP - used) + "万円</strong>）";
  container.appendChild(capLine);

  var pending = team.roster.filter(function (p) { return p.contractYears <= 0; });

  if (pending.length === 0) {
    var empty = document.createElement("p");
    empty.className = "contracts-empty";
    empty.textContent = "契約更改の対象選手はいません。次のシーズンに進むと対象が出てくることがあります。";
    container.appendChild(empty);
    return;
  }

  var listEl = document.createElement("div");
  listEl.className = "card-grid";
  container.appendChild(listEl);

  pending.forEach(function (player) {
    listEl.appendChild(renderContractCard(player));
  });
}

// タブの定義。新しいタブを足すときはここに{id, label, render}を1つ追加するだけでよい
// （index.html側は触らなくてよい。タブボタンも中身も、この配列から自動で作られる）。
var TABS = [
  { id: "team", label: "自チーム", render: renderTeamTab },
  { id: "standings", label: "順位表", render: renderStandingsTab },
  { id: "contracts", label: "契約更改", render: renderContractsTab },
  { id: "fa-market", label: "FA市場", render: renderFaMarketTab }
];

var currentTabId = TABS[0].id;

function renderTabBar() {
  var tabsEl = document.getElementById("tabs");
  tabsEl.innerHTML = "";
  TABS.forEach(function (tab) {
    var btn = document.createElement("button");
    btn.className = "tab-btn" + (tab.id === currentTabId ? " active" : "");
    btn.textContent = tab.label;
    btn.addEventListener("click", function () {
      currentTabId = tab.id;
      renderTabBar();
      renderActiveTab();
    });
    tabsEl.appendChild(btn);
  });
}

function renderActiveTab() {
  var tab = TABS.filter(function (t) { return t.id === currentTabId; })[0];
  var container = document.getElementById("tab-content");
  container.innerHTML = "";
  tab.render(container);
}

var currentSeason = 1;

// シーズンとシーズンの間（オフシーズン）かどうか。この間だけ契約更改・
// FA獲得ができる。試合中（オフシーズンでない間）はどちらもできない。
var inOffseason = false;

function renderSeasonLabel() {
  document.getElementById("season-label").textContent = "シーズン" + currentSeason;
}

// ボタンは3つの状態を行き来する:
//   シーズン中          → 「次のシーズンへ進む」（押すとオフシーズンに入る）
//   オフシーズン・対象あり → 「契約更改を終えてください」（押せない）
//   オフシーズン・対象なし → 「シーズン開始」（押すと試合が始まる）
function updateAdvanceButtonState() {
  var btn = document.getElementById("advance-season-btn");
  if (!inOffseason) {
    btn.disabled = false;
    btn.textContent = "次のシーズンへ進む";
    return;
  }
  var pending = hasPendingRenewals();
  btn.disabled = pending;
  btn.textContent = pending ? "契約更改を終えてください" : "シーズン開始";
}

// 現在の状態をlocalStorageに保存する。状態が変わる操作（シーズン進行・
// 契約更改・FA獲得・やり直し）の最後に必ず呼ぶ。
function persist() {
  saveGame(league, currentSeason, inOffseason);
}

// 「次のシーズンへ進む」（シーズン中に押したとき）。
// advanceSeason()は成長・衰退・引退・新人加入・FAの入れ替えを行い、
// runContractDecisions()はAIチームだけの契約更改（能力不足の非再契約・
// キャップ超過の解雇）を行う。ここではまだ試合をしない。オフシーズンに
// 入り、契約更改・FA獲得ができる状態にする。解雇された選手は直前の
// シーズンの成績(player.stats)を持ったままFA市場に残る。
function enterOffseason() {
  advanceSeason(league);
  runContractDecisions(league, MY_TEAM_INDEX);
  faOffseasonWeek = 0; // 新しいオフシーズンなので値下がりをリセット
  inOffseason = true;

  persist();
  renderTabBar();
  renderSeasonLabel();
  updateAdvanceButtonState();
  renderActiveTab();
}

// 「シーズン開始」（オフシーズン中、契約更改の対象が無いときに押したとき）。
// 今シーズン分の試合(playSeason)を回し、オフシーズンを終える。
function startSeason() {
  resetRecords(league.teams);
  playSeason(league.teams);
  currentSeason++;
  inOffseason = false;

  persist();
  renderSeasonLabel();
  updateAdvanceButtonState();
  renderActiveTab();
}

// 「次のシーズンへ進む」ボタンの実際のクリック処理。今どちらの状態かで
// enterOffseason/startSeasonのどちらを行うかを切り替える。
function handleAdvanceButtonClick() {
  if (!inOffseason) {
    enterOffseason();
  } else if (!hasPendingRenewals()) {
    startSeason();
  }
}

// 契約更改タブでの「再契約する」「解雇する」を実際に反映する。
// オフシーズン中はここでシーズンを開始しない（FA市場も見てから
// 「シーズン開始」を押してもらう）。
function resolveContractDecision(player, action, years) {
  var team = league.teams[MY_TEAM_INDEX];
  var idx = team.roster.indexOf(player);
  if (idx === -1) return;

  if (action === "release") {
    team.roster.splice(idx, 1);
    league.freeAgents.push(player);
  } else {
    var askingPrice = playerSalary(player);
    if (teamCommittedSalary(team) + askingPrice > SALARY_CAP) return; // ボタン無効化済みだが念のため
    player.contractSalary = askingPrice;
    player.contractYears = years;
  }

  persist();
  updateAdvanceButtonState();
  renderActiveTab();
}

// FA獲得ができない理由を返す（無ければnull）。ボタンの無効化と
// 理由表示の両方に使う。
function faSignBlockReason(player) {
  if (!inOffseason) return "シーズン中は獲得できません（次のオフシーズンをお待ちください）";
  var team = league.teams[MY_TEAM_INDEX];
  if (team.roster.length >= TEAM_ROSTER_CAP) return "ロースターが上限（" + TEAM_ROSTER_CAP + "人）です";
  var price = faAskingPrice(playerSalary(player), faOffseasonWeek);
  if (teamCommittedSalary(team) + price > SALARY_CAP) return "キャップ超過のため契約できません";
  return null;
}

// FA選手を実際に獲得する。価格は「オフシーズン経過」スライダーで
// 今表示されている額（値下がり後の額）で契約する。
function signFaPlayer(player, years) {
  if (faSignBlockReason(player)) return; // ボタン無効化済みだが念のため

  var team = league.teams[MY_TEAM_INDEX];
  var price = faAskingPrice(playerSalary(player), faOffseasonWeek);

  var idx = league.freeAgents.indexOf(player);
  if (idx === -1) return;
  league.freeAgents.splice(idx, 1);

  player.contractSalary = price;
  player.contractYears = years;
  team.roster.push(player);

  persist();
  renderActiveTab();
}

// 「最初からやり直す」。保存を消し、新しいリーグを一から作り直す。
function startNewGame() {
  clearSave();

  league = setupLeague();
  playSeason(league.teams);
  currentSeason = 1;
  inOffseason = false;
  faOffseasonWeek = 0;
  currentTabId = TABS[0].id;

  persist();
  renderTabBar();
  renderSeasonLabel();
  updateAdvanceButtonState();
  renderActiveTab();
}

function init() {
  var saved = loadGame();
  if (saved) {
    league = saved.league;
    currentSeason = saved.currentSeason;
    inOffseason = !!saved.inOffseason;
  } else {
    league = setupLeague();
    playSeason(league.teams); // 順位表・年俸(前年成績ベース)に使う結果を1シーズン分作っておく
    persist();
  }

  renderTabBar();
  renderSeasonLabel();
  renderActiveTab();

  document.getElementById("advance-season-btn").addEventListener("click", handleAdvanceButtonClick);
  document.getElementById("restart-btn").addEventListener("click", function () {
    if (window.confirm("最初からやり直しますか？今のセーブデータは消えます。")) {
      startNewGame();
    }
  });
  updateAdvanceButtonState();
}

init();
