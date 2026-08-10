// このファイルが「どのdataファイルを読み込むか」の一覧です。
// 新しいアプリを足す手順:
//   1. data/ フォルダに新しいファイルを作る（例: data/keynote.js）
//      macos.js か scrivener.js をコピーして中身を書き換えるのが簡単です。
//   2. 下の配列に、そのファイル名を1行追加する。
//   3. index.html は触らなくてOK。ブラウザでindex.htmlを開き直せば
//      新しいアプリのタブが自動で増えます。
window.TIPS_FILES = [
  "macos.js",
  "scrivener.js"
];
