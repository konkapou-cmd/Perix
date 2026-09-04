const puppeteer = require("puppeteer-core");

(async () => {
  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    headless: "new",
    args: ["--no-sandbox", "--disable-gpu"],
  });
  const page = await browser.newPage();
  const messages = [];
  page.on("console", (msg) => messages.push(`[${msg.type()}] ${msg.text()}`));
  page.on("pageerror", (err) => messages.push(`[pageerror] ${err.message}\n${(err.stack || "").split("\n").slice(0, 6).join("\n")}`));
  page.on("requestfailed", (req) => messages.push(`[requestfailed] ${req.url()} ${req.failure()?.errorText}`));

  await page.goto("http://localhost:5000", { waitUntil: "networkidle2", timeout: 90000 }).catch((e) => messages.push("[goto] " + e.message));
  await new Promise((r) => setTimeout(r, 10000));
  const bodyText = await page.evaluate(() => (document.body ? document.body.innerText.slice(0, 800) : "NO BODY"));
  console.log("=== BODY TEXT ===");
  console.log(bodyText);
  console.log("=== CONSOLE ===");
  console.log(messages.slice(0, 40).join("\n"));
  await browser.close();
})().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
