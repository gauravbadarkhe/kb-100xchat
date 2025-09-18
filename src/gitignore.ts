// src/gitignore.ts
import ignore from "ignore";

const DEFAULT_IGNORES = [
  "node_modules/",
  "dist/",
  "build/",
  ".next/",
  "coverage/",
  ".git/",
  ".github/",
  "*.min.*",
  "*.map",
  "*.lock",
  "*.zip",
  "*.tar",
  "*.tgz",
  "*.png",
  "*.jpg",
  "*.jpeg",
  "*.gif",
  "*.pdf",
  "*.ico",
  "*.woff",
  "*.woff2",
  "*.ttf",
];

export function makeIgnore(rootGitignore?: string) {
  const ig = ignore();
  ig.add(DEFAULT_IGNORES);
  if (rootGitignore) ig.add(rootGitignore.split(/\r?\n/));
  return ig;
}
