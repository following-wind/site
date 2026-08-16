// 画面の表示だけを担当する。計算はgame.js側の関数を呼ぶだけで、
// ここには生成・成長・年俸などのロジックを書かない。

var MY_TEAM_INDEX = 0; // プレイヤーのチーム。チーム選択の仕組みはまだ無いので先頭固定
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
      '<span class="stat-chip">年俸 ' + playerSalary(player) + '万円</span>' +
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

// 順位表タブ: 4チームを勝ち数の多い順に並べ、自チームの行だけ強調する
function renderStandingsTab(container) {
  var standings = league.teams.slice().sort(function (a, b) {
    return b.wins - a.wins;
  });

  var table = document.createElement("table");
  table.className = "standings";
  var rowsHtml = standings.map(function (team, index) {
    var games = team.wins + team.losses;
    var winRate = games > 0 ? (team.wins / games * 100).toFixed(1) : "0.0";
    var isMine = league.teams.indexOf(team) === MY_TEAM_INDEX;
    return (
      '<tr class="' + (isMine ? "standings-row--mine" : "") + '">' +
        "<td>" + (index + 1) + "</td>" +
        "<td>" + escapeHtml(team.name) + "</td>" +
        "<td>" + team.wins + "勝" + team.losses + "敗</td>" +
        "<td>" + winRate + "%</td>" +
      "</tr>"
    );
  }).join("");

  table.innerHTML =
    "<thead><tr><th>順位</th><th>チーム</th><th>成績</th><th>勝率</th></tr></thead>" +
    "<tbody>" + rowsHtml + "</tbody>";

  container.appendChild(table);
}

// FA市場タブでのオフシーズン経過（週）。スライダーで動かして、
// 要求額が値下がりしていく様子をその場で見られるようにする。
var faOffseasonWeek = 0;

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
    '<div class="ability-bars">' + renderAbilityBars(player) + "</div>" +
    '<div class="growth-hint">伸びしろ <span class="value">' + growthHintLabel(player) + "</span></div>";
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
// スライダーと週数表示はcreateElementで組み立てて直接参照を持つ
// （innerHTML文字列に埋め込むとgetElementByIdでの取得に頼ることになり壊れやすいため）。
function renderFaMarketTab(container) {
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

// タブの定義。新しいタブを足すときはここに{id, label, render}を1つ追加するだけでよい
// （index.html側は触らなくてよい。タブボタンも中身も、この配列から自動で作られる）。
var TABS = [
  { id: "team", label: "自チーム", render: renderTeamTab },
  { id: "standings", label: "順位表", render: renderStandingsTab },
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

function renderSeasonLabel() {
  document.getElementById("season-label").textContent = "シーズン" + currentSeason;
}

// 「次のシーズンへ進む」を押したときの処理。
// advanceSeason()は成長・衰退・引退・新人加入・FAの入れ替えだけを行うので、
// 続けて今シーズン分の試合(playSeason)も回して順位表・個人成績・年俸を更新する。
function advanceToNextSeason() {
  advanceSeason(league);
  resetRecords(league.teams);
  playSeason(league.teams);
  currentSeason++;
  faOffseasonWeek = 0; // 新しいシーズンのオフシーズンなので値下がりをリセット

  renderSeasonLabel();
  renderActiveTab();
}

function init() {
  league = setupLeague();
  playSeason(league.teams); // 順位表・年俸(前年成績ベース)に使う結果を1シーズン分作っておく

  renderTabBar();
  renderSeasonLabel();
  renderActiveTab();

  document.getElementById("advance-season-btn").addEventListener("click", advanceToNextSeason);
}

init();
