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
  rosterEl.id = "roster";
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

// タブの定義。新しいタブを足すときはここに{id, label, render}を1つ追加するだけでよい
// （index.html側は触らなくてよい。タブボタンも中身も、この配列から自動で作られる）。
var TABS = [
  { id: "team", label: "自チーム", render: renderTeamTab },
  { id: "standings", label: "順位表", render: renderStandingsTab }
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

function init() {
  league = setupLeague();
  playSeason(league.teams); // 順位表・年俸(前年成績ベース)に使う結果を1シーズン分作っておく

  renderTabBar();
  renderActiveTab();
}

init();
