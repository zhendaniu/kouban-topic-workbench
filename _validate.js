const fs = require("fs");
const p = JSON.parse(fs.readFileSync("packs/2026-09-07.json", "utf8"));
const bad = ["赋能","闭环","抓手","值得注意的是","总而言之","综上所述","在这个时代","在当今","在如今","不仅仅是","让我们","首先，其次","众所周知"];
let total = 0, issues = 0;
p.tracks.forEach(tk => tk.topics.forEach(tp => {
  tp.scripts.forEach((s, i) => {
    total++;
    const n = (s.text || "").replace(/\s/g, "").length;
    let flag = "";
    if (n < 240 || n > 400) { flag += `[字数${n}]`; issues++; }
    if (!s.allowBad) bad.forEach(b => { if ((s.text || "").includes(b)) { flag += `[禁用词:${b}]`; issues++; } });
    if (flag) console.log(`${tp.id}#${i+1} ${s.angle} ${flag} len=${n}`);
  });
}));
console.log("总稿数:", total, "问题:", issues);
