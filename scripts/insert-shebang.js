import fs from "node:fs";
import path from "node:path";

const shebang = "#!/usr/bin/env node";
const distPath = path.resolve("dist", "cli.js");
const srcPath = path.resolve("src", "cli.ts");

if (!(fs.existsSync(distPath) && fs.existsSync(srcPath))) {
  process.exit(0);
}

const desiredShebang = fs.readFileSync(srcPath, "utf-8").split("\n", 1)[0];
if (desiredShebang !== shebang) {
  console.warn("Expected shebang to remain '#!/usr/bin/env node'");
}

const content = fs.readFileSync(distPath, "utf-8");
if (content.startsWith(shebang)) {
  process.exit(0);
}

fs.writeFileSync(distPath, `${shebang}\n${content}`);
