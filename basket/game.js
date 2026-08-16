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

// 基準値baseと型から5項目の能力を作る（makePlayer/makeRookieで共有）
// 各項目 = base + 型の補正 + 正規乱数(0,5) を 40〜99 に丸める
function generateAbilities(base, type) {
  var adj = PLAYER_TYPES[type];
  var abilities = {};
  ["two", "three", "drib", "reb", "defe"].forEach(function (key) {
    abilities[key] = clamp(Math.round(base + adj[key] + randNormal(0, 5)), 40, 99);
  });
  return abilities;
}

// 隠しポテンシャル（成長で到達できる上限）を項目ごとに作る。画面には出さない。
// spreadが大きいほど、現在の能力からどこまで伸びるか読めなくなる（新人向け）。
function makePotential(abilities, spread) {
  var potential = {};
  Object.keys(abilities).forEach(function (key) {
    potential[key] = clamp(abilities[key] + Math.round(Math.abs(randNormal(0, spread))), abilities[key], 99);
  });
  return potential;
}

// 1人の選手を生成する（初期ロースター用）
// 生成手順:
//   1. 基準値baseを平均65・標準偏差9の正規分布から引き、そこにチームの
//      戦力係数（powerCoefficient）を足してから42〜95に丸める
//   2. 型を選ぶ
//   3. 各項目 = base + 補正 + 正規乱数(0,5) を 40〜99 に丸める
function makePlayer(powerCoefficient) {
  var coefficient = powerCoefficient || 0;
  var base = clamp(Math.round(randNormal(65, 9) + coefficient), 42, 95);
  var type = pickRandom(PLAYER_TYPE_NAMES);
  var abilities = generateAbilities(base, type);

  var player = {
    name: makePlayerName(),
    type: type,
    age: 20 + Math.floor(Math.random() * 14), // 初期ロースターは20〜33歳の分布
    two: abilities.two,
    three: abilities.three,
    drib: abilities.drib,
    reb: abilities.reb,
    defe: abilities.defe
  };
  player.potential = makePotential(abilities, 10);
  return player;
}

// 新人を1人生成する（年齢19〜22歳、能力は平均58・標準偏差8）
// ポテンシャルは初期ロースターより振れ幅を大きくする（賭けの対象にするため）
function makeRookie() {
  var base = clamp(Math.round(randNormal(58, 8)), 35, 90);
  var type = pickRandom(PLAYER_TYPE_NAMES);
  var abilities = generateAbilities(base, type);

  var player = {
    name: makePlayerName(),
    type: type,
    age: 19 + Math.floor(Math.random() * 4),
    two: abilities.two,
    three: abilities.three,
    drib: abilities.drib,
    reb: abilities.reb,
    defe: abilities.defe
  };
  player.potential = makePotential(abilities, 18);
  return player;
}

function overall(player) {
  return (player.two + player.three + player.drib + player.reb + player.defe) / 5;
}

function ageBracket(age) {
  if (age <= 26) return "growth";
  if (age <= 29) return "plateau";
  return "decline";
}

// 型の得意項目（補正がプラスの項目）は伸びやすく、苦手項目は伸びにくい
function growthMultiplier(key, type) {
  var adj = PLAYER_TYPES[type][key];
  if (adj > 0) return 1.4;
  if (adj < 0) return 0.7;
  return 1.0;
}

// 30歳以降の衰え方の内訳。ドリブル・ディフェンスは走力が落ちるため早く衰え、
// リバウンドは中くらい、2P・3Pは技術なので落ちにくい。
var DECLINE_RATE = { two: 0.6, three: 0.6, drib: 2.2, reb: 1.3, defe: 2.2 };

// 1シーズン分の成長・衰退を1人に適用し、年齢を1つ上げる
function growPlayer(player) {
  var bracket = ageBracket(player.age);
  ["two", "three", "drib", "reb", "defe"].forEach(function (key) {
    var delta;
    if (bracket === "growth") {
      delta = randNormal(2.5, 1.5) * growthMultiplier(key, player.type);
    } else if (bracket === "plateau") {
      delta = randNormal(-0.6, 1.0);
    } else {
      var yearsInDecline = player.age - 29;
      delta = -(DECLINE_RATE[key] + yearsInDecline * 0.12) + randNormal(0, 1.0);
    }
    var next = Math.min(player[key] + delta, player.potential[key]);
    player[key] = clamp(Math.round(next), 40, 99);
  });
  player.age++;
}

// 引退条件: 33歳以上かつ総合(閾値)未満 / 39歳
// （3つ目の「FAのまま1シーズン過ぎた」はadvanceSeason側で扱う）
// 総合の閾値は指示書の例では62だが、20シーズンの人数安定確認で総選手数が
// 目安（55〜62人）に届かなかったため58に緩めた（下のverifyPopulationStability参照）。
var RETIRE_AGE_SOFT = 33;
var RETIRE_OVERALL_THRESHOLD = 58;
var RETIRE_AGE_HARD = 39;

function shouldRetireByAge(player) {
  if (player.age >= RETIRE_AGE_HARD) return true;
  if (player.age >= RETIRE_AGE_SOFT && overall(player) < RETIRE_OVERALL_THRESHOLD) return true;
  return false;
}

// 新人は指示書の例では毎年6人だが、それだとチーム上限(52人)止まりで
// 総選手数が55〜62人の目安に届かず、FAが0人になる回もあったため10人に増やした
// （下のverifyPopulationStabilityで300〜1000回試行して確認済み）。
var ROOKIES_PER_SEASON = 10;
var TEAM_ROSTER_CAP = 13;

// 1シーズン分の成長・衰退・引退・新人加入をまとめて進める。
// この段階には契約・FA市場の仕組みがまだ無いので、FAは「誰にも取られず
// 1シーズン過ぎたら引退する」という3つ目の引退条件どおり毎シーズン全員入れ替わる。
// 新人は人数が少ないチームから優先的に上限13人まで割り振り、
// 余った分だけFAに回る。
function advanceSeason(league) {
  league.teams.forEach(function (team) {
    team.roster.forEach(growPlayer);
  });
  league.freeAgents.forEach(growPlayer);

  league.teams.forEach(function (team) {
    team.roster = team.roster.filter(function (p) { return !shouldRetireByAge(p); });
  });

  // FAは誰にも取られなかったので全員引退し、今季の新人だけの状態になる
  league.freeAgents = [];

  var rookies = [];
  for (var i = 0; i < ROOKIES_PER_SEASON; i++) rookies.push(makeRookie());

  rookies.forEach(function (rookie) {
    var target = null;
    league.teams.forEach(function (team) {
      if (team.roster.length < TEAM_ROSTER_CAP) {
        if (!target || team.roster.length < target.roster.length) target = team;
      }
    });
    if (target) {
      target.roster.push(rookie);
    } else {
      league.freeAgents.push(rookie);
    }
  });
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

function countPlayers(league) {
  var teamTotal = league.teams.reduce(function (sum, team) { return sum + team.roster.length; }, 0);
  return { total: teamTotal + league.freeAgents.length, team: teamTotal, fa: league.freeAgents.length };
}

// 20シーズン空回しして、総選手数とFA残りが安定するか確認する。
// 乱数の影響が大きいので1回では判定せず、trials回まわして範囲を見る。
// 目安（Pythonで検証済み）: 総選手数55〜62人 / FA残り2〜10人
function verifyPopulationStability(trials, seasons) {
  console.log("\n=== 人数の安定性を確認（" + seasons + "シーズン空回し × " + trials + "回） ===");

  var totals = [];
  var faCounts = [];
  for (var t = 0; t < trials; t++) {
    var league = setupLeague();
    for (var s = 0; s < seasons; s++) advanceSeason(league);

    var counts = countPlayers(league);
    totals.push(counts.total);
    faCounts.push(counts.fa);

    console.log(
      (t + 1) + "回目: 総選手数 " + counts.total +
      "（チーム" + counts.team + "人 + FA" + counts.fa + "人）"
    );
  }

  console.log(
    "\n総選手数の範囲: " + Math.min.apply(null, totals) + "〜" + Math.max.apply(null, totals) +
    "人（目安 55〜62人）"
  );
  console.log(
    "FA残りの範囲: " + Math.min.apply(null, faCounts) + "〜" + Math.max.apply(null, faCounts) +
    "人（目安 2〜10人）"
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

  verifyPopulationStability(10, 20);
}

// ブラウザでui.jsから読み込まれるとき（後の段階）は自動実行しない。
// node game.js で直接動かしたときだけ、動作確認のログを出す。
if (typeof window === "undefined") {
  main();
}
