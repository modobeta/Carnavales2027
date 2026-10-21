import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inlineLink = /!?\[[^\]\n]*\]\(\s*(?:<([^>\n]+)>|([^\s)\n]+))(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;
const referenceDefinition = /^\s{0,3}\[[^\]\n]+\]:\s*(?:<([^>\n]+)>|(\S+))/;

function localPath(target) {
  if (!target || target.startsWith("#") || target.startsWith("/") || /^[a-z][a-z\d+.-]*:/i.test(target)) {
    return null;
  }
  const pathname = target.split(/[?#]/, 1)[0];
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

export function findBrokenRelativeLinks(markdown, markdownPath, fileExists = existsSync) {
  const errors = [];
  let fence = null;

  for (const [index, line] of markdown.split(/\r?\n/).entries()) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
      continue;
    }
    if (fence) continue;

    // Inline code may contain illustrative Markdown links, not real navigation.
    const prose = line.replace(/`+[^`]*`+/g, "");
    const targets = [...prose.matchAll(inlineLink)].map((match) => match[1] ?? match[2]);
    const definition = prose.match(referenceDefinition);
    if (definition) targets.push(definition[1] ?? definition[2]);

    for (const target of targets) {
      const pathname = localPath(target);
      if (!pathname) continue;
      const destination = path.resolve(path.dirname(markdownPath), pathname);
      if (!fileExists(destination)) errors.push({ line: index + 1, target });
    }
  }

  return errors;
}

function main() {
  const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
    .split("\0")
    .filter((file) => file.toLowerCase().endsWith(".md"));
  let broken = 0;

  for (const file of tracked) {
    const absolute = path.resolve(root, file);
    const errors = findBrokenRelativeLinks(readFileSync(absolute, "utf8"), absolute);
    for (const error of errors) {
      console.error(`${file}:${error.line}: no existe ${error.target}`);
      broken += 1;
    }
  }

  if (broken > 0) {
    console.error(`${broken} enlace(s) relativo(s) roto(s).`);
    process.exitCode = 1;
    return;
  }
  console.log(`Enlaces relativos verificados en ${tracked.length} archivos Markdown.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
