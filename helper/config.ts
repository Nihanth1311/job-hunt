// Where the helper keeps its things on your laptop: ~/.jobhunt-helper/
//   config.json  the site's address and this laptop's token (readable only by you)
//   chrome/      the Chrome profile autofill uses: separate from your everyday Chrome
//   files/       resume PDFs downloaded for the forms being filled (cleared at each start)

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const HOME = process.env.JOBHUNT_HELPER_HOME || path.join(os.homedir(), ".jobhunt-helper");
export const CHROME_DIR = path.join(HOME, "chrome");
export const FILES_DIR = path.join(HOME, "files");
const CONFIG = path.join(HOME, "config.json");

export interface Config {
  site: string;
  token: string;
}

export function readConfig(): Config | null {
  try {
    const c = JSON.parse(fs.readFileSync(CONFIG, "utf8")) as Partial<Config>;
    return c.site && c.token ? { site: c.site, token: c.token } : null;
  } catch {
    return null;
  }
}

export function writeConfig(c: Config): void {
  fs.mkdirSync(HOME, { recursive: true, mode: 0o700 });
  fs.writeFileSync(CONFIG, JSON.stringify(c, null, 2), { mode: 0o600 });
  fs.chmodSync(CONFIG, 0o600);
}
