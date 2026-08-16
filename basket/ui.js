// 画面の表示だけを担当する。計算はgame.js側の関数を呼ぶだけで、
// ここには生成・成長・年俸などのロジックを書かない。

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
    '<div class="ability-bars">' + renderAbilityBars(player) + "</div>" +
    '<div class="growth-hint">伸びしろ <span class="value">' + growthHintLabel(player) + "</span></div>";
  return card;
}

// ロースターを総合力の高い順に並べて、1人1カードで縦に積む
function renderRoster(team) {
  document.getElementById("team-name").textContent = team.name;

  var rosterEl = document.getElementById("roster");
  rosterEl.innerHTML = "";

  var sorted = team.roster.slice().sort(function (a, b) {
    return overall(b) - overall(a);
  });
  sorted.forEach(function (player) {
    rosterEl.appendChild(renderPlayerCard(player));
  });
}

function init() {
  var league = setupLeague();
  var myTeam = league.teams[0]; // プレイヤーのチーム。チーム選択の仕組みはまだ無いので先頭固定
  renderRoster(myTeam);
}

init();
