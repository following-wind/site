// 育成バスケゲーム: 選手生成・シーズン消化・成長引退・個人成績・年俸/FA（第1〜4段階）
//
// 画面はまだ作らない。console.logで確認する（main()参照）。
// チーム力は全選手の5項目の単純合計（出場時間も型も考えない第1段階の単純版）。
// AIチームの行動と、勝敗計算を項目別に差し替えるところ（第6・7段階）はまだ。
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

// ポジション（PG/SG/SF/PF/C）。この並び順を「隣接」の判定にも使う
// （例: SFの隣はSGとPF）。
var POSITION_ORDER = ["PG", "SG", "SF", "PF", "C"];

// 型ごとの候補ポジションと、判定に使う能力（下のpickPrimaryPosition参照）。
// 守備職人は当初PG/C（両極端）で考えていたが、defe+18・reb+4という
// 能力からSF/PFのほうが自然で、他の3つとも隣接ポジションになる点を
// 優先してこちらにした。
// カバレッジ: PG=オールラウンドのみ / SG,SF,PF=2型ずつ / C=ビッグマンのみ。
// PG・Cが手薄なのは織り込み済みで、下のensurePositionCoverage()で補う。
var TYPE_POSITION_CANDIDATES = {
  "シューター": { high: "SG", low: "SF", key: "drib" },
  "ビッグマン": { high: "C", low: "PF", key: "defe" },
  "オールラウンド": { high: "SG", low: "PG", key: "three" },
  "守備職人": { high: "PF", low: "SF", key: "reb" }
};

// 型の候補2つのうち、判定軸の能力が高いほどhigh側に倒れやすくする。
// 差が大きいほど強く倒れるが、決定論にはしない（低い方になることもある）。
function pickPrimaryPosition(abilities, type) {
  var rule = TYPE_POSITION_CANDIDATES[type];
  var diff = abilities[rule.key] - 65; // 65前後を基準に高低を見る
  var probHigh = clamp(0.5 + diff * 0.02, 0.15, 0.85);
  return Math.random() < probHigh ? rule.high : rule.low;
}

function adjacentPositions(position) {
  var index = POSITION_ORDER.indexOf(position);
  var adjacent = [];
  if (index > 0) adjacent.push(POSITION_ORDER[index - 1]);
  if (index < POSITION_ORDER.length - 1) adjacent.push(POSITION_ORDER[index + 1]);
  return adjacent;
}

// 一定確率で隣接ポジションをもう1つ持たせる（マルチポジション）。
// 専門外での起用ペナルティや出場時間の割り振りはA-3で扱うので、
// ここではポジションを決めるだけ。
var MULTI_POSITION_CHANCE = 0.25;

function assignPositions(abilities, type) {
  var primary = pickPrimaryPosition(abilities, type);
  var positions = [primary];
  if (Math.random() < MULTI_POSITION_CHANCE) {
    positions.push(pickRandom(adjacentPositions(primary)));
  }
  return positions;
}

// マルチポジションの市場価値の上乗せ（要求額の倍率）。playerSalary()参照。
var MULTI_POSITION_SALARY_PREMIUM = 1.15;

// 出場時間配分（A-2）。ポジション1つにつき48分の枠を選手たちで分け合う。
// player.rotation = { position: "PG"などnull, minutes: 数値 } を選手ごとに持つ。
var POSITION_MINUTES_CAP = 48;

// 指定ポジションに現在割り振られている合計分数（自分自身の分も含む）
function positionMinutesUsed(roster, position) {
  return roster.reduce(function (sum, p) {
    return p.rotation && p.rotation.position === position ? sum + p.rotation.minutes : sum;
  }, 0);
}

// 選手の適性ポジション（positions配列）から、指定ポジションまでの
// 隣接ステップ数（適性そのものなら0）
function positionDistance(player, position) {
  var target = POSITION_ORDER.indexOf(position);
  var distances = player.positions.map(function (pos) {
    return Math.abs(POSITION_ORDER.indexOf(pos) - target);
  });
  return Math.min.apply(null, distances);
}

// 専門外ポジションで起用したときの能力の目減り具合（1.0が本来どおり）。
// A-2の時点ではまだ勝敗・成績には使わず、画面での目安表示にだけ使う。
// A-3で実際にteamPower等の計算に反映する。
function positionPenaltyMultiplier(player, position) {
  var distance = positionDistance(player, position);
  if (distance === 0) return 1.0;
  if (distance === 1) return 0.85;
  if (distance === 2) return 0.65;
  return 0.45;
}

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
    positions: assignPositions(abilities, type),
    age: 20 + Math.floor(Math.random() * 14), // 初期ロースターは20〜33歳の分布
    two: abilities.two,
    three: abilities.three,
    drib: abilities.drib,
    reb: abilities.reb,
    defe: abilities.defe
  };
  player.potential = makePotential(abilities, 10);
  // 初期ロースターが一斉に契約切れにならないよう、残り年数は1〜3年をランダムに割り振る
  player.contractYears = 1 + Math.floor(Math.random() * 3);
  player.contractSalary = playerSalary(player); // まだ成績が無いので能力ベースの額になる
  player.rotation = { position: null, minutes: 0 }; // 出場時間配分（A-2）。毎シーズンadvanceSeason()でリセットされる
  return player;
}

var ROOKIE_CONTRACT_YEARS = 2;

// 新人を1人生成する（年齢19〜22歳、能力は平均58・標準偏差8）
// ポテンシャルは初期ロースターより振れ幅を大きくする（賭けの対象にするため）
function makeRookie() {
  var base = clamp(Math.round(randNormal(58, 8)), 35, 90);
  var type = pickRandom(PLAYER_TYPE_NAMES);
  var abilities = generateAbilities(base, type);

  var player = {
    name: makePlayerName(),
    type: type,
    positions: assignPositions(abilities, type),
    age: 19 + Math.floor(Math.random() * 4),
    two: abilities.two,
    three: abilities.three,
    drib: abilities.drib,
    reb: abilities.reb,
    defe: abilities.defe
  };
  player.potential = makePotential(abilities, 18);
  // 新人契約は一律2年（単純化。ベテランのように交渉で年数を選べたりはしない）
  player.contractYears = ROOKIE_CONTRACT_YEARS;
  player.contractSalary = playerSalary(player); // まだ成績が無いので能力ベースの額になる
  player.rotation = { position: null, minutes: 0 };
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
// ここではまだ誰にも取られたかどうかを判定しないので、FAは「誰にも取られず
// 1シーズン過ぎたら引退する」という3つ目の引退条件どおり毎シーズン全員入れ替わる
// （runContractDecisions()で解雇された選手がFAに残るのは、この関数の外・
// advanceSeason()とplaySeason()の間で行う想定）。
// 新人は人数が少ないチームから優先的に上限13人まで割り振り、
// 余った分だけFAに回る。
// チームに5ポジション全部が埋まっているか確認し、欠けていれば一番近い
// （隣接ステップ数が少ない）選手にそのポジションをマルチポジションとして
// 追加する。TYPE_POSITION_CANDIDATESの設計上PG・Cは供給元が1型しかなく
// 手薄になりやすいので、この補正が実質的な保険になる。
function ensurePositionCoverage(roster) {
  POSITION_ORDER.forEach(function (position) {
    var covered = roster.some(function (p) { return p.positions.indexOf(position) !== -1; });
    if (covered || roster.length === 0) return;

    var best = roster[0];
    var bestDistance = Infinity;
    roster.forEach(function (p) {
      var distance = Math.min.apply(null, p.positions.map(function (pos) {
        return Math.abs(POSITION_ORDER.indexOf(pos) - POSITION_ORDER.indexOf(position));
      }));
      if (distance < bestDistance) {
        bestDistance = distance;
        best = p;
      }
    });
    best.positions.push(position);
  });
}

function advanceSeason(league) {
  league.teams.forEach(function (team) {
    team.roster.forEach(growPlayer);
  });
  league.freeAgents.forEach(growPlayer);

  // 契約の残り年数を1つ減らす。0になった選手が今季の契約更改の対象になる
  // （対象をどう扱うかはprocessExpiredAiContracts()・契約更改タブ側で行う）
  league.teams.forEach(function (team) {
    team.roster.forEach(function (p) { p.contractYears--; });
  });

  // 出場時間配分は毎シーズンリセットする（ロースターも年齢も変わるので、
  // 前シーズンの配分をそのまま引き継がず、都度考え直してもらう）。
  league.teams.forEach(function (team) {
    team.roster.forEach(function (p) { p.rotation = { position: null, minutes: 0 }; });
  });

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

  league.teams.forEach(function (team) { ensurePositionCoverage(team.roster); });
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
    ensurePositionCoverage(roster);
    return { name: name, roster: roster, wins: 0, losses: 0, powerCoefficient: powerCoefficient };
  });

  var freeAgents = [];
  for (var i = 0; i < 2; i++) freeAgents.push(makePlayer(0));

  return { teams: teams, freeAgents: freeAgents };
}

var SEASON_GAMES = 36;

// 総当たり12回戦（4チームなので、各ペアが12試合ずつ = 6ペア×12 = 72試合）
// 1試合の勝率 = 自チーム力 / (自チーム力 + 相手チーム力)
function playSeason(teams) {
  teams.forEach(computeSeasonStats);

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

function average(roster, key) {
  var sum = roster.reduce(function (s, p) { return s + p[key]; }, 0);
  return sum / roster.length;
}

// チーム全体のシーズン合計（得点・リバウンド・アシスト・スティール）。
// 出場時間や個々の選手は考えず、チーム平均能力から36試合分をまとめて出す。
// 係数はNBA的な1試合あたりの数字感（得点100前後、リバウンド40台など）に
// 大まかに合わせただけの目安。
function computeTeamSeasonTotals(roster) {
  return {
    points: Math.round(SEASON_GAMES * (average(roster, "two") * 0.9 + average(roster, "three") * 0.7)),
    rebounds: Math.round(SEASON_GAMES * average(roster, "reb") * 0.7),
    assists: Math.round(SEASON_GAMES * average(roster, "drib") * 0.4),
    steals: Math.round(SEASON_GAMES * average(roster, "defe") * 0.12)
  };
}

// 選手ごとの出場時間の割合（チーム内で合計1になる）。
// 総合力が高いほど出場しやすいが、乱数の幅を大きめに取ることで
// 「能力は高いのに出場機会がない選手」も出るようにしてある。
function computePlayingTimeShares(roster) {
  var raw = roster.map(function (player) {
    return Math.max(overall(player) + randNormal(0, 8), 5);
  });
  var total = raw.reduce(function (sum, w) { return sum + w; }, 0);
  return raw.map(function (w) { return w / total; });
}

// 「重みの比率どおりにtotalを配る」だけの関数。得点・リバウンド・
// アシスト・スティールの4項目で使い回す。
function distributeByWeight(weights, total) {
  var sum = weights.reduce(function (s, w) { return s + w; }, 0);
  if (sum <= 0) return weights.map(function () { return 0; });
  return weights.map(function (w) { return Math.round(total * w / sum); });
}

// 1チーム分の個人成績（シーズン合計）を計算し、各選手のstatsに書き込む。
// 得点は2P・3P、リバウンドはリバウンド、アシストはドリブル、
// スティールはディフェンスの能力から作る。保存するのはシーズン合計だけ。
function computeSeasonStats(team) {
  var roster = team.roster;
  var totals = computeTeamSeasonTotals(roster);
  var playingTimeShares = computePlayingTimeShares(roster);

  var pointsWeights = roster.map(function (p, i) {
    return playingTimeShares[i] * (p.two * 0.9 + p.three * 0.7);
  });
  var reboundWeights = roster.map(function (p, i) { return playingTimeShares[i] * p.reb; });
  var assistWeights = roster.map(function (p, i) { return playingTimeShares[i] * p.drib; });
  var stealWeights = roster.map(function (p, i) { return playingTimeShares[i] * p.defe; });

  var points = distributeByWeight(pointsWeights, totals.points);
  var rebounds = distributeByWeight(reboundWeights, totals.rebounds);
  var assists = distributeByWeight(assistWeights, totals.assists);
  var steals = distributeByWeight(stealWeights, totals.steals);

  roster.forEach(function (player, i) {
    player.stats = {
      playingTimeShare: playingTimeShares[i],
      points: points[i],
      rebounds: rebounds[i],
      assists: assists[i],
      steals: steals[i]
    };
  });
}

function avgStat(list, statKey) {
  if (list.length === 0) return 0;
  var sum = list.reduce(function (s, p) { return s + p.stats[statKey]; }, 0);
  return sum / list.length;
}

// 個人成績が「らしい」形になっているかを確認する。
//   - ビッグマンは得点少なめ・リバウンド多め、シューターはその逆になるか
//   - 出場時間が短い選手は4項目とも少なくなるか
// 1チーム(12人)だけだと乱数でぶれて型ごとの差が埋もれるので、
// trials個のリーグ分（各4チーム）を作ってまとめて平均を見る。
function verifyIndividualStats(trials) {
  console.log("\n=== 個人成績の確認（型ごとの平均・出場時間との関係、" + trials + "リーグ分で集計） ===");

  var allPlayers = [];
  for (var t = 0; t < trials; t++) {
    var league = setupLeague();
    playSeason(league.teams);
    league.teams.forEach(function (team) {
      allPlayers = allPlayers.concat(team.roster);
    });
  }

  console.log("型ごとの平均成績（1シーズン合計、" + allPlayers.length + "人分）:");
  PLAYER_TYPE_NAMES.forEach(function (type) {
    var list = allPlayers.filter(function (p) { return p.type === type; });
    if (list.length === 0) return;
    console.log(
      "  " + type + "（" + list.length + "人）: " +
      "得点 " + avgStat(list, "points").toFixed(1) +
      " / リバウンド " + avgStat(list, "rebounds").toFixed(1) +
      " / アシスト " + avgStat(list, "assists").toFixed(1) +
      " / スティール " + avgStat(list, "steals").toFixed(1)
    );
  });

  var sortedByPlayingTime = allPlayers.slice().sort(function (a, b) {
    return a.stats.playingTimeShare - b.stats.playingTimeShare;
  });
  var quarter = Math.floor(sortedByPlayingTime.length / 4);
  var low = sortedByPlayingTime.slice(0, quarter);
  var high = sortedByPlayingTime.slice(sortedByPlayingTime.length - quarter);

  console.log("\n出場時間による比較（下位25% vs 上位25%、4項目合計の平均）:");
  [["出場時間 少なめ", low], ["出場時間 多め", high]].forEach(function (pair) {
    var label = pair[0];
    var list = pair[1];
    var totalAvg = avgStat(list, "points") + avgStat(list, "rebounds") + avgStat(list, "assists") + avgStat(list, "steals");
    console.log("  " + label + "（" + list.length + "人）: 合計平均 " + totalAvg.toFixed(1));
  });
}

// 年俸カーブ。線形にせず、能力10上昇で約2倍になる加速カーブにする。
// 「そこそこを多く」と「主力1人に賭ける」が同じ価値にならないようにするため。
var SALARY_BASE = 80; // 万円

function calcSalary(overallValue) {
  return Math.round(SALARY_BASE * Math.pow(2, (overallValue - 50) / 10));
}

// 前年の成績から「求める額の根拠になる能力っぽい数字」を作るための重み。
// 得点・リバウンド・アシストよりスティールを重めにしてあるのは、
// 数が少ない分1つの価値を大きくする程度の理由で、厳密な根拠はない。
var PERFORMANCE_WEIGHTS = { points: 1.0, rebounds: 1.2, assists: 1.5, steals: 3.0 };

function performanceIndex(stats) {
  return (
    stats.points * PERFORMANCE_WEIGHTS.points +
    stats.rebounds * PERFORMANCE_WEIGHTS.rebounds +
    stats.assists * PERFORMANCE_WEIGHTS.assists +
    stats.steals * PERFORMANCE_WEIGHTS.steals
  );
}

// performanceIndexは能力値と単位が違うので、40リーグ分のシミュレーション結果から
// 平均・標準偏差を測り、能力overallと同じ分布になるようz-score変換する。
// （型のバランスや人数を変えたら、この2つの定数は計算し直しが必要）
var PERFORMANCE_CALIBRATION = { meanOverall: 66.7, sdOverall: 10.8, meanPerf: 679.6, sdPerf: 199.7 };

// 要求額は能力そのものではなく前年の成績で決まる。
// 出場時間の運で成績が能力より良く/悪く出た選手は、そのまま
// 「実力より高い/安い」要求額になる（前年の成績が無い新人は能力をそのまま使う）。
function perceivedOverall(player) {
  if (!player.stats) return overall(player);
  var z = (performanceIndex(player.stats) - PERFORMANCE_CALIBRATION.meanPerf) / PERFORMANCE_CALIBRATION.sdPerf;
  return clamp(Math.round(PERFORMANCE_CALIBRATION.meanOverall + z * PERFORMANCE_CALIBRATION.sdOverall), 40, 99);
}

function playerSalary(player) {
  var base = calcSalary(perceivedOverall(player));
  if (player.positions && player.positions.length > 1) return Math.round(base * MULTI_POSITION_SALARY_PREMIUM);
  return base;
}

// サラリーキャップ（1チームあたり）。
// 指示書の4,600万円は「50人を1つのプール」とみなした試算値だったが、
// 実際は4チームへのチーム単位の補充（戦力係数・上限13人など）で
// ロースターの年俸構成が変わり、4,600万円のままだと全選手を要求額どおりに
// 契約した場合の適合率が約66%まで下がった。5,300万円に調整し、約84%まで戻した
// （下のverifySalaryCapで150チーム分試行して確認）。
var SALARY_CAP = 5300; // 万円

// オフシーズンが進むほどFAの要求額が下がる。
// 「もう少し待てば安く取れるかもしれない」という駆け引きを作るためのもの。
// weeksIntoOffseasonは0スタートで、最大40%まで値下がりする。
function faAskingPrice(baseSalary, weeksIntoOffseason) {
  var discount = Math.min(0.4, weeksIntoOffseason * 0.05);
  return Math.round(baseSalary * (1 - discount));
}

// 契約更改の最小版（第6段階「AIチームの行動」の一部を先出しした）。
// 性格・状態の判定はまだ無く、単純なルールだけ:
//   1. 契約が切れた(contractYears<=0)選手のうち、能力が閾値未満なら再契約しない（FAに出す）
//   2. キャップを超えるチームは、年俸が高く能力の低い順（年俸÷能力が高い順）に解雇する
// ロースター下限を割ったときのFAからの補充（3つ目のルール）はまだ実装しない。
//
// 閾値は46〜54で試した（「毎シーズン全員が対象」という単純化をしていた時点での検証）。
// 48以下だと解雇がほぼ起きず(10シーズンでベテランFAが見える回数が全体の3割未満)、
// 55以上だと再契約されない選手が多すぎてロースターが縮み続けた
// (最小チーム総人数が35〜14まで落ちた)。53は解雇が10シーズンで平均12人前後、
// チーム総人数は52→51程度でほぼ維持でき、ベテランFAが見える割合が4割強になる
// （20試行×10シーズンで確認）。契約年数を導入した後も対象を「切れた選手だけ」に
// 絞っただけで閾値自体の意味は変わらないため、この値をそのまま使っている。
// 各性格の閾値・判断はこの値を基準にした加減で表現する（下のshouldAiResign参照）。
var RESIGN_OVERALL_THRESHOLD = 53;

// 契約更改タブで選べる契約年数。AIチームの自動更改でもここから選ぶ
// （性格によって偏りを持たせる。下のpickAiResignDuration参照）。
var RESIGN_DURATION_OPTIONS = [1, 3];

function pickResignDuration() {
  return pickRandom(RESIGN_DURATION_OPTIONS);
}

// チームごとの性格（固定）。TEAM_NAMES/TEAM_POWER_COEFFICIENTSと同じ並び順。
// プレイヤーのチーム（index 3・札幌ドリフト）はnull（AI判断の対象外）。
// ランダム割り当てにすると、プレイヤーが相手の癖を覚えられなくなるため固定にした。
var TEAM_PERSONALITIES = ["youth", "conservative", "spender", null];

var PERSONALITY_LABELS = {
  youth: "若手重視",
  conservative: "堅実",
  spender: "金遣いが荒い"
};

// 性格ごとの契約更改の判断。それぞれ「わざと残す失敗」を作るための偏り。
//   若手重視: 25歳以下は基準を緩め、26歳以上は厳しくする
//             → 実力のある30代を手放して即戦力を逃す（足踏みする）
//   堅実: 要求額が能力なりの額(calcSalary(overall))を3割以上超えたら見送る
//             → 前年の当たり年で要求額が跳ね上がった大物を取り逃す
//   金遣いが荒い: 閾値をやや緩めるだけでなく、能力が高いほど実際に
//             要求額の上乗せを払って再契約する（下のspenderPremium参照）
//             → 高額・長期契約を積みがちで、翌年キャップ超過による解雇に遭いやすい
var YOUTH_AGE_CUTOFF = 25;
var YOUTH_THRESHOLD_ADJUST = { young: -8, old: 6 };
var CONSERVATIVE_OVERPAY_LIMIT = 1.3;
var SPENDER_THRESHOLD_ADJUST = -5;

function shouldAiResign(player, personality) {
  var value = overall(player);

  if (personality === "youth") {
    var threshold = RESIGN_OVERALL_THRESHOLD +
      (player.age <= YOUTH_AGE_CUTOFF ? YOUTH_THRESHOLD_ADJUST.young : YOUTH_THRESHOLD_ADJUST.old);
    return value >= threshold;
  }

  if (personality === "conservative") {
    if (value < RESIGN_OVERALL_THRESHOLD) return false;
    var fairPrice = calcSalary(value);
    return playerSalary(player) <= fairPrice * CONSERVATIVE_OVERPAY_LIMIT;
  }

  if (personality === "spender") {
    return value >= RESIGN_OVERALL_THRESHOLD + SPENDER_THRESHOLD_ADJUST;
  }

  return value >= RESIGN_OVERALL_THRESHOLD; // 性格未設定時の保険（現状は使われない）
}

// 金遣いが荒いチームが実際に払う上乗せ率。能力が高いほど上乗せが大きくなる
// （「高能力に上限超えで払う」を再現する）。overall65で+30%、99で+約98%。
function spenderPremium(player) {
  var value = overall(player);
  return 1.3 + Math.max(0, value - 65) * 0.02;
}

// 性格ごとの再契約額。金遣いが荒い以外は要求額どおり。
function decideResignSalary(player, personality) {
  var askingPrice = playerSalary(player);
  if (personality === "spender") return Math.round(askingPrice * spenderPremium(player));
  return askingPrice;
}

// 性格ごとの契約年数の傾向。若手重視は有望な若手を長期で囲い込み、
// ベテランは短期で様子見。堅実は常に短期でリスクを抑える。
// 金遣いが荒いは値の張る長期契約を積みがち（キャップ超過の一因）。
function pickAiResignDuration(player, personality) {
  if (personality === "youth") return player.age <= YOUTH_AGE_CUTOFF ? 3 : 1;
  if (personality === "conservative") return 1;
  if (personality === "spender") return 3;
  return pickResignDuration();
}

// 契約が切れたAIチームの選手だけを、チームの性格に沿って判断する。
// myTeamIndexのチーム（プレイヤー）は対象にしない。そちらは契約更改タブで
// 手動判断するため、contractYears<=0のまま残しておく。
function processExpiredAiContracts(league, myTeamIndex) {
  league.teams.forEach(function (team, index) {
    if (index === myTeamIndex) return;
    var personality = TEAM_PERSONALITIES[index];

    var keep = [];
    team.roster.forEach(function (player) {
      if (player.contractYears > 0) {
        keep.push(player);
        return;
      }
      if (shouldAiResign(player, personality)) {
        player.contractSalary = decideResignSalary(player, personality);
        player.contractYears = pickAiResignDuration(player, personality);
        keep.push(player);
      } else {
        league.freeAgents.push(player);
      }
    });
    team.roster = keep;
  });
}

// キャップ(contractSalaryの合計)を超えるチームを、年俸が高く能力が低いほど
// 優先的に解雇して収める（年俸÷能力が高い順）。myTeamIndexは対象にしない
// （プレイヤーの契約更改タブ側で、契約時にキャップ超過を防ぐため）。
function enforceSalaryCap(league, myTeamIndex) {
  league.teams.forEach(function (team, index) {
    if (index === myTeamIndex) return;

    var total = teamCommittedSalary(team);
    var cutOrder = team.roster.slice().sort(function (a, b) {
      return (b.contractSalary / overall(b)) - (a.contractSalary / overall(a));
    });

    var i = 0;
    while (total > SALARY_CAP && i < cutOrder.length) {
      var player = cutOrder[i];
      var idx = team.roster.indexOf(player);
      if (idx !== -1) {
        team.roster.splice(idx, 1);
        league.freeAgents.push(player);
        total -= player.contractSalary;
      }
      i++;
    }
  });
}

// 契約中(contractYears>0)の選手のcontractSalary合計＝現在キャップに使っている額
function teamCommittedSalary(team) {
  return team.roster.reduce(function (sum, p) {
    return p.contractYears > 0 ? sum + p.contractSalary : sum;
  }, 0);
}

// シーズン終了時の契約更改をまとめて行う。advanceSeason()（成長・引退・新人）
// とplaySeason()（試合・成績）の間で呼ぶ想定: 直前のシーズンの成績（年俸の元）
// を使ってAIチームの解雇・再契約を決める。myTeamIndexのチームは対象外（契約更改
// タブで手動判断するため、contractYears<=0の選手をそのまま残す）。
// 解雇された選手はFA市場に成績付きで残る。
function runContractDecisions(league, myTeamIndex) {
  processExpiredAiContracts(league, myTeamIndex);
  enforceSalaryCap(league, myTeamIndex);
}

// 実際に生成した選手データで、年俸とキャップの感触を確認する。
// 「全選手をそれぞれの要求額どおりに契約したら」という厳しめの前提での
// 適合率なので、実際のプレイでは選手を選んで契約する分もっと収まりやすくなるはず。
function verifySalaryCap(trials) {
  console.log("\n=== 年俸・サラリーキャップの確認（" + trials + "チーム分） ===");

  var fitCount = 0;
  var teamTotals = [];
  var allSalaries = [];

  for (var t = 0; t < trials; t++) {
    var league = setupLeague();
    playSeason(league.teams);
    league.teams.forEach(function (team) {
      var total = 0;
      team.roster.forEach(function (player) {
        var salary = playerSalary(player);
        allSalaries.push(salary);
        total += salary;
      });
      teamTotals.push(total);
      if (total <= SALARY_CAP) fitCount++;
    });
  }

  allSalaries.sort(function (a, b) { return a - b; });
  teamTotals.sort(function (a, b) { return a - b; });

  console.log(
    "個人年俸: 中央値 " + allSalaries[Math.floor(allSalaries.length / 2)] +
    "万円 / 最高額 " + allSalaries[allSalaries.length - 1] + "万円"
  );
  console.log(
    "チーム総年俸: 中央値 " + teamTotals[Math.floor(teamTotals.length / 2)] +
    "万円 / 最高額 " + teamTotals[teamTotals.length - 1] + "万円"
  );
  console.log(
    "キャップ（" + SALARY_CAP + "万円）に収まるチームの割合: " +
    fitCount + "/" + teamTotals.length +
    "（" + (fitCount / teamTotals.length * 100).toFixed(1) + "%）"
  );
}

// 「要求額は前年の成績で決まる」の核心である、能力どおりの年俸(trueSalary)と
// 実際の要求額(demandSalary)のズレを確認する。z-score変換は分布の形を能力overall
// に合わせているだけで、ズレそのものを消す処理ではないはずだが、消えていないか、
// 逆に能力と無関係なほど暴れていないかを両方チェックする。
function verifySalaryDivergence(trials) {
  console.log("\n=== 要求額と能力どおりの年俸のズレを確認（" + trials + "チーム分） ===");

  var players = [];
  for (var t = 0; t < trials; t++) {
    var league = setupLeague();
    playSeason(league.teams);
    league.teams.forEach(function (team) {
      players = players.concat(team.roster);
    });
  }

  var ratios = players.map(function (p) {
    var trueSalary = calcSalary(overall(p));
    var demandSalary = playerSalary(p);
    return { player: p, trueSalary: trueSalary, demandSalary: demandSalary, ratio: (demandSalary - trueSalary) / trueSalary };
  });

  var over20 = ratios.filter(function (r) { return r.ratio > 0.2; }).length;
  var under20 = ratios.filter(function (r) { return r.ratio < -0.2; }).length;
  var within10 = ratios.filter(function (r) { return Math.abs(r.ratio) < 0.1; }).length;

  console.log(
    "能力どおりの年俸から+20%を超えて割高: " + over20 + "/" + players.length +
    "（" + (over20 / players.length * 100).toFixed(1) + "%）"
  );
  console.log(
    "能力どおりの年俸から-20%を超えて割安: " + under20 + "/" + players.length +
    "（" + (under20 / players.length * 100).toFixed(1) + "%）"
  );
  console.log(
    "ほぼ実力どおり（±10%以内）: " + within10 + "/" + players.length +
    "（" + (within10 / players.length * 100).toFixed(1) + "%）"
  );

  var sortedByRatio = ratios.slice().sort(function (a, b) { return b.ratio - a.ratio; });
  console.log("\n割高の例（能力の割に要求額が高い上位3人）:");
  sortedByRatio.slice(0, 3).forEach(function (r) {
    console.log(
      "  " + r.player.name + "（" + r.player.type + "、能力" + overall(r.player).toFixed(1) + "）: " +
      "本来" + r.trueSalary + "万円 → 要求" + r.demandSalary + "万円（" + (r.ratio * 100).toFixed(0) + "%）"
    );
  });
  console.log("割安の例（能力の割に要求額が安い上位3人）:");
  sortedByRatio.slice(-3).reverse().forEach(function (r) {
    console.log(
      "  " + r.player.name + "（" + r.player.type + "、能力" + overall(r.player).toFixed(1) + "）: " +
      "本来" + r.trueSalary + "万円 → 要求" + r.demandSalary + "万円（" + (r.ratio * 100).toFixed(0) + "%）"
    );
  });
}

function verifyFaDepreciation() {
  console.log("\n=== FAの値下がりの例（当初の要求額500万円の選手） ===");
  for (var week = 0; week <= 8; week += 2) {
    console.log("  オフシーズン" + week + "週目: " + faAskingPrice(500, week) + "万円");
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

// セーブデータの読み書き（localStorage）。
// キーは1つにまとめ、バージョン番号を入れる（DESIGN.md「保存」参照）。
// 仕様変更で古いセーブと形が合わなくなったら、SAVE_KEYの末尾を
// 上げる（v1→v2）。古いキーのデータはそのまま残るが二度と読まれない
// ので、新しいキーと衝突しない。
// v1→v2: 追加段階A-1でplayer.positions・A-2でplayer.rotationを
// 追加したが、SAVE_KEYを上げ忘れていた。古いセーブ（この2つが無い）を
// 読み込むと出場時間タブの描画でクラッシュする不具合があったため、
// v2に上げるのと合わせて、下のlooksLikeValidPlayer()で選手の形も
// 確認するようにした（次に同じ上げ忘れをしても、真っ白な画面や
// クラッシュではなく新規開始に落ちるようにするための保険）。
// localStorageはブラウザにしか無いので、関数の中でだけ参照する
// （node game.jsで動かすconsole確認では呼ばれないようにする）。
var SAVE_KEY = "basket_save_v2";

function saveGame(league, currentSeason, inOffseason) {
  var payload = { key: SAVE_KEY, currentSeason: currentSeason, inOffseason: !!inOffseason, league: league };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
  } catch (e) {
    // 保存に失敗しても続行に支障は無い（容量超過など）ので握りつぶす
  }
}

// 選手データとして最低限の形になっているかを確認する。
// バージョンを上げ忘れたときの保険なので、全フィールドは見ずに
// 描画で必ず参照する主要なものだけ確認する。
function looksLikeValidPlayer(player) {
  return !!player &&
    Array.isArray(player.positions) && player.positions.length > 0 &&
    !!player.rotation && typeof player.rotation === "object" &&
    typeof player.contractYears === "number" &&
    typeof player.contractSalary === "number";
}

// 保存データを読み込む。無い/壊れている/形が合わない場合はnullを返し、
// 呼び出し側で新規開始として扱う。
function loadGame() {
  try {
    var raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;

    var payload = JSON.parse(raw);
    if (!payload || payload.key !== SAVE_KEY) return null;
    if (!payload.league || !Array.isArray(payload.league.teams) || !Array.isArray(payload.league.freeAgents)) return null;
    if (typeof payload.currentSeason !== "number") return null;

    var teamsLookValid = payload.league.teams.every(function (team) {
      return Array.isArray(team.roster) && team.roster.every(looksLikeValidPlayer);
    });
    var faLookValid = payload.league.freeAgents.every(looksLikeValidPlayer);
    if (!teamsLookValid || !faLookValid) return null;

    return payload;
  } catch (e) {
    return null; // JSONが壊れている場合もここに来る
  }
}

function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (e) {
    // 消せなくても致命的ではない
  }
}

function main() {
  var league = setupLeague();

  console.log("=== チーム力（戦力係数） ===");
  league.teams.forEach(function (team) {
    console.log(team.name + ": " + teamPower(team.roster) + "（係数 " + team.powerCoefficient + "）");
  });

  verifyPowerCoefficient(league, 10);
  verifyIndividualStats(30);
  verifySalaryCap(150);
  verifySalaryDivergence(40);
  verifyFaDepreciation();

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
