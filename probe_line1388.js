const fs = require("fs");
const path = "dist/_expo/static/js/web";
const f = fs.readdirSync(path).find((x) => x.startsWith("entry"));
const s = fs.readFileSync(path + "/" + f, "utf8");
const lines = s.split("\n");
console.log("line 1388 length:", lines[1387].length);
console.log(lines[1387].slice(0, 3000));
