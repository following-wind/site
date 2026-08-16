// 育成バスケゲーム: 選手生成・シーズン消化（第1段階）
//
// 第1段階では「勝敗計算がまともに動くか」だけを確認する。
// チーム力 = 全選手の5項目の単純合計（出場時間も型も考えない超シンプル版）。
// 成長・引退・年俸・個人成績・画面は、この段階ではまだ作らない。
//
// 実在の選手・チーム名は使わない。名前は姓リスト×名リストの組み合わせで
// 生成し、有名選手の姓名はリストに入れていない。

var TEAM_NAMES = ["東京サンダー", "大阪ウェーブ", "名古屋ギア", "札幌ドリフト"];

// チームごとの戦力係数。選手生成時のbase（平均65）にそのまま加算する。
// 初期生成のときだけ使う値で、チーム力の計算式そのものには手を入れない。
// [6,2,-2,-6](幅12)は最強チームの1〜2位率が約68%、[9,3,-3,-9](幅18)は
// 約70%で、独立2000サンプルの検証により幅18を採用した。
var TEAM_POWER_COEFFICIENTS = [9, 3, -3, -9];

var LAST_NAMES = [
  "佐藤", "鈴木", "高橋", "田中", "伊藤", "山本", "中村", "小林",
  "加藤", "吉田", "山田", "佐々木", "山口", "松本", "井上", "木村",
  "林", "斎藤", "清水", "森", "池田", "橋本", "石川", "前田",
  "藤田", "岡本", "中島", "坂本", "福田", "太田", "西村", "原田",
  "松田", "竹内", "金子", "青木", "村上", "三浦", "小川", "近藤"
];

var FIRST_NAMES = [
  "大翔", "陸", "蓮", "颯太", "悠真", "湊", "樹", "陽翔",
  "新", "健太", "翼", "遥斗", "拓海", "直樹", "亮", "和也",
  "大輝", "翔太", "雄大", "将大", "健二", "昇", "隼人", "悠斗",
  "啓太", "康平", "誠", "智也", "匠", "陽介", "慎太郎", "洋平",
  "竜也", "裕太", "浩二", "健一", "光", "颯", "蒼空", "陽向"
];

// 型ごとの補正値（生成時に決定、以後不変）
var PLAYER_TYPES = {
  "シューター": { two: 5, three: 18, drib: 3, reb: -12, defe: -8 },
  "ビッグマン": { two: 12, three: -20, drib: -12, reb: 20, defe: 8 },
  "オールラウンド": { two: 4, three: 2, drib: 6, reb: 0, defe: 2 },
  "守備職人": { two: -8, three: -6, drib: -2, reb: 4, defe: 18 }
};
var PLAYER_TYPE_NAMES = Object.keys(PLAYER_TYPES);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Box-Muller法: 平均mean・標準偏差sdの正規分布に従う乱数を1つ返す
function randNormal(mean, sd) {
  var u1 = Math.random() || 1e-9; // 0を避ける
  var u2 = Math.random();
  var z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * sd;
}

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function makePlayerName() {
  return pickRandom(LAST_NAMES) + pickRandom(FIRST_NAMES);
}

// 1人の選手を生成する
// 生成手順:
//   1. 基準値baseを平均65・標準偏差9の正規分布から引き、そこにチームの
//      戦力係数（powerCoefficient）を足してから42〜95に丸める
//   2. 型を選ぶ
//   3. 各項目 = base + 補正 + 正規乱数(0,5) を 40〜99 に丸める
function makePlayer(powerCoefficient) {
  var coefficient = powerCoefficient || 0;
  var base = clamp(Math.round(randNormal(65, 9) + coefficient), 42, 95);
  var type = pickRandom(PLAYER_TYPE_NAMES);
  var adj = PLAYER_TYPES[type];

  var abilities = {};
  ["two", "three", "drib", "reb", "defe"].forEach(function (key) {
    abilities[key] = clamp(Math.round(base + adj[key] + randNormal(0, 5)), 40, 99);
  });

  return {
    name: makePlayerName(),
    type: type,
    two: abilities.two,
    three: abilities.three,
    drib: abilities.drib,
    reb: abilities.reb,
    defe: abilities.defe
  };
}

// チーム力 = 全選手の5項目の単純合計（第1段階の単純版）
function teamPower(roster) {
  var total = 0;
  roster.forEach(function (player) {
    total += player.two + player.three + player.drib + player.reb + player.defe;
  });
  return total;
}

// 4チーム×12人 + FA2人 = 50人を生成する
// チームごとにTEAM_POWER_COEFFICIENTSの係数を割り当て、最初から強い
// チームと弱いチームがある状態を作る（FAは係数0＝平均のまま）。
function setupLeague() {
  var teams = TEAM_NAMES.map(function (name, index) {
    var powerCoefficient = TEAM_POWER_COEFFICIENTS[index];
    var roster = [];
    for (var i = 0; i < 12; i++) roster.push(makePlayer(powerCoefficient));
    return { name: name, roster: roster, wins: 0, losses: 0, powerCoefficient: powerCoefficient };
  });

  var freeAgents = [];
  for (var i = 0; i < 2; i++) freeAgents.push(makePlayer(0));

  return { teams: teams, freeAgents: freeAgents };
}

// 総当たり12回戦（4チームなので、各ペアが12試合ずつ = 6ペア×12 = 72試合）
// 1試合の勝率 = 自チーム力 / (自チーム力 + 相手チーム力)
function playSeason(teams) {
  for (var a = 0; a < teams.length; a++) {
    for (var b = a + 1; b < teams.length; b++) {
      var teamA = teams[a];
      var teamB = teams[b];
      var powerA = teamPower(teamA.roster);
      var powerB = teamPower(teamB.roster);
      var winRateA = powerA / (powerA + powerB);

      for (var game = 0; game < 12; game++) {
        if (Math.random() < winRateA) {
          teamA.wins++;
          teamB.losses++;
        } else {
          teamB.wins++;
          teamA.losses++;
        }
      }
    }
  }
}

function resetRecords(teams) {
  teams.forEach(function (team) {
    team.wins = 0;
    team.losses = 0;
  });
}

// 同じ初期データ（同じ選手・同じチーム力）のまま10シーズン分シミュレートし、
// 戦力係数が一番高いチームが何回1〜2位に入るかを確認する。
// 7割程度が妥当（10回全部同じ順位なら差をつけすぎ、5割程度なら幅が足りない）。
function verifyPowerCoefficient(league, seasons) {
  var strongest = league.teams.reduce(function (a, b) {
    return b.powerCoefficient > a.powerCoefficient ? b : a;
  });

  console.log("\n=== 戦力係数の効き目を確認（同じ初期データで" + seasons + "シーズン） ===");
  console.log("最強チーム: " + strongest.name + "（戦力係数 " + strongest.powerCoefficient + "）");

  var top2Count = 0;
  for (var s = 0; s < seasons; s++) {
    resetRecords(league.teams);
    playSeason(league.teams);

    var standings = league.teams.slice().sort(function (t1, t2) {
      return t2.wins - t1.wins;
    });
    var rank = standings.indexOf(strongest) + 1;
    if (rank <= 2) top2Count++;

    console.log(
      (s + 1) + "シーズン目: " + rank + "位" +
      "（" + strongest.wins + "勝" + strongest.losses + "敗）"
    );
  }

  console.log(
    "\n" + strongest.name + "が1〜2位だった割合: " +
    top2Count + "/" + seasons + "（7割程度が目安）"
  );
}

function main() {
  var league = setupLeague();

  console.log("=== チーム力（戦力係数） ===");
  league.teams.forEach(function (team) {
    console.log(team.name + ": " + teamPower(team.roster) + "（係数 " + team.powerCoefficient + "）");
  });

  verifyPowerCoefficient(league, 10);

  var totalWins = league.teams.reduce(function (sum, team) { return sum + team.wins; }, 0);
  console.log("\n直近シーズンの勝ち数合計: " + totalWins + "（72になっていればOK）");

  console.log("\nFA選手数: " + league.freeAgents.length);
  console.log("総選手数: " + (league.teams.reduce(function (sum, team) { return sum + team.roster.length; }, 0) + league.freeAgents.length));
}

// ブラウザでui.jsから読み込まれるとき（後の段階）は自動実行しない。
// node game.js で直接動かしたときだけ、動作確認のログを出す。
if (typeof window === "undefined") {
  main();
}
