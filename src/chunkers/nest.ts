// src/chunkers/nest.ts
import ts from "typescript";

type Chunk = { text: string; meta: any; ordinal: number };

export function chunkNestControllers(src: string, path: string): Chunk[] {
  const sf = ts.createSourceFile(path, src, ts.ScriptTarget.Latest, true);
  const chunks: Chunk[] = [];
  let ordinal = 0;

  const getLine = (pos: number) =>
    sf.getLineAndCharacterOfPosition(pos).line + 1;

  const routeOf = (decorators?: ts.NodeArray<ts.Decorator>) => {
    if (!decorators) return null;
    for (const d of decorators) {
      const ex = d.expression;
      if (ts.isCallExpression(ex) && ts.isIdentifier(ex.expression)) {
        const name = ex.expression.getText(sf).toLowerCase();
        if (["get", "post", "put", "patch", "delete"].includes(name)) {
          const arg = ex.arguments[0]?.getText(sf) || "''";
          return {
            method: name.toUpperCase(),
            path: arg.replace(/['"`]/g, ""),
          };
        }
      }
    }
    return null;
  };

  const controllerBase = (decorators?: ts.NodeArray<ts.Decorator>) => {
    if (!decorators) return "";
    for (const d of decorators) {
      const ex = d.expression;
      if (
        ts.isCallExpression(ex) &&
        ts.isIdentifier(ex.expression) &&
        ex.expression.getText(sf) === "Controller"
      ) {
        const arg = ex.arguments[0]?.getText(sf) || "''";
        return arg.replace(/['"`]/g, "");
      }
    }
    return "";
  };

  const visit = (n: ts.Node, ctrlBase = "") => {
    if (ts.isClassDeclaration(n)) {
      const base = controllerBase(n.modifiers as any);
      const newBase = base || ctrlBase;

      // dive into methods
      n.members.forEach((m) => visit(m, newBase));
      return;
    }

    if (ts.isMethodDeclaration(n)) {
      const route = routeOf(n.modifiers as any);
      if (route) {
        const start = getLine(n.getStart());
        const end = getLine(n.getEnd());
        const label = `${route.method} ${ctrlPath(ctrlBase, route.path)}`;
        const text = src.slice(n.getFullStart(), n.getEnd());
        chunks.push({
          text,
          meta: {
            path,
            symbol: label,
            start_line: start,
            end_line: end,
            route: label,
          },
          ordinal: ordinal++,
        });
      }
      return;
    }

    n.forEachChild((child) => visit(child, ctrlBase));
  };

  const ctrlPath = (base: string, p: string) => {
    const b = (base || "").replace(/\/+$/, "");
    const q = (p || "").replace(/^\/+/, "");
    return b && q ? `/${b}/${q}` : b ? `/${b}` : q ? `/${q}` : "/";
  };

  visit(sf);
  return chunks.length ? chunks : [{ text: src, meta: { path }, ordinal: 0 }];
}
