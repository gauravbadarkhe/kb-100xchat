// src/chunkers/code.ts
import ts from "typescript";

export function chunkCode(src: string, path: string, lang: string) {
  if (!["ts", "tsx", "js", "jsx"].includes(lang))
    return [{ text: src, meta: { path }, ordinal: 0 }];
  const source = ts.createSourceFile(path, src, ts.ScriptTarget.Latest, true);
  const chunks: any[] = [];

  const push = (node: ts.Node, label: string) => {
    const s = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
    const e = source.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
    const text = src.slice(node.getFullStart(), node.getEnd());
    chunks.push({
      text,
      meta: { path, symbol: label, start_line: s, end_line: e },
    });
  };

  const walk = (n: ts.Node) => {
    if (ts.isFunctionDeclaration(n) && n.name) push(n, n.name.getText());
    if (ts.isClassDeclaration(n) && n.name) push(n, n.name.getText());
    if (ts.isMethodDeclaration(n) && n.name) push(n, n.name.getText());
    if (ts.isVariableStatement(n))
      push(n, n.declarationList.declarations[0]?.name.getText() || "var");
    ts.forEachChild(n, walk);
  };

  walk(source);
  if (!chunks.length) chunks.push({ text: src, meta: { path } });
  return chunks.map((c, i) => ({ ...c, ordinal: i }));
}
