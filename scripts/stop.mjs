// `npm run stop`: stops the running Job Hunt server, found through the database lock file
// (data/pglite.lock holds the server's process id; see src/server/db/index.ts).
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const lockFile = `${process.env.PGLITE_DIR || path.join(process.cwd(), "data", "pglite")}.lock`;

const running = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
};

let pid = 0;
try {
  pid = Number(fs.readFileSync(lockFile, "utf8").trim());
} catch {}

if (!pid || !running(pid)) {
  fs.rmSync(lockFile, { force: true });
  console.log("Job Hunt isn't running.");
  process.exit(0);
}

if (process.platform === "win32") {
  // Stop the whole `next dev` tree: the server's parent ("next dev") and everything under it.
  let target = pid;
  try {
    const parent = Number(
      execSync(`powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').ParentProcessId"`).toString().trim(),
    );
    const cmd = execSync(`powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=${parent}').CommandLine"`).toString();
    if (parent && /next/.test(cmd)) target = parent;
  } catch {}
  try {
    execSync(`taskkill /PID ${target} /T /F`, { stdio: "ignore" });
  } catch {}
} else {
  process.kill(pid, "SIGINT"); // lets the server close the database cleanly
}

for (let i = 0; i < 80 && running(pid); i++) await new Promise((r) => setTimeout(r, 100));
if (running(pid)) {
  console.log(`Couldn't stop process ${pid}. End it from Task Manager (Node.js).`);
  process.exit(1);
}
fs.rmSync(lockFile, { force: true });
console.log("Job Hunt stopped. Start it again with: npm run dev");
