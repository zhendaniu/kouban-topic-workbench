const fs = require("fs");
const F = "packs/2026-09-07.json";
const p = JSON.parse(fs.readFileSync(F, "utf8"));
const app = {
  "tv2#3": "九月机票窗口就是现在，别等长假才后悔。",
  "ai5#2": "长期看，这条路比卖产品更值钱。"
};
let done = 0;
p.tracks.forEach(tk => tk.topics.forEach(tp => {
  tp.scripts.forEach((s, i) => {
    const key = `${tp.id}#${i + 1}`;
    if (app[key]) { s.text = (s.text || "") + app[key]; done++; }
  });
}));
fs.writeFileSync(F, JSON.stringify(p, null, 2) + "\n", "utf8");
console.log("追加完成:", done);
