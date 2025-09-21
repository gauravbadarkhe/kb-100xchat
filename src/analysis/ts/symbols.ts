import { Project, SyntaxKind, Node, MethodDeclaration } from "ts-morph";

export type TsSymbolRow = {
  language: string;
  kind: string; // function | method | class | interface | type | enum
  name: string;
  signature?: string | null;
  start_line?: number | null;
  end_line?: number | null;
  modifiers?: Record<string, any>;
  meta?: Record<string, any>;
};

export function extractTsSymbols(path: string, content: string): TsSymbolRow[] {
  const project = new Project({ useInMemoryFileSystem: true });
  const sf = project.createSourceFile(path, content, { overwrite: true });
  const rows: TsSymbolRow[] = [];

  const push = (r: Partial<TsSymbolRow>) =>
    rows.push({
      language: "ts",
      kind: r.kind!,
      name: r.name || "anonymous",
      signature: r.signature ?? null,
      start_line: r.start_line ?? null,
      end_line: r.end_line ?? null,
      modifiers: r.modifiers ?? {},
      meta: r.meta ?? {},
    });

  // top-level functions
  sf.getFunctions().forEach((fn) => {
    push({
      kind: "function",
      name: fn.getName() || "anonymous",
      signature: truncate(fn.getText(), 500),
      start_line: fn.getStartLineNumber(),
      end_line: fn.getEndLineNumber(),
      modifiers: { exported: fn.isExported(), async: fn.isAsync() },
    });
  });

  // classes and methods
  sf.getClasses().forEach((cls) => {
    push({
      kind: "class",
      name: cls.getName() || "AnonymousClass",
      signature: truncate(cls.getText(), 500),
      start_line: cls.getStartLineNumber(),
      end_line: cls.getEndLineNumber(),
      modifiers: {
        exported: cls.isExported(),
        decorators: cls.getDecorators().map((d) => d.getName()),
      },
    });

    cls.getMethods().forEach((m: MethodDeclaration) => {
      push({
        kind: "method",
        name: `${cls.getName() || "Class"}.${m.getName()}`,
        signature: truncate(m.getText(), 500),
        start_line: m.getStartLineNumber(),
        end_line: m.getEndLineNumber(),
        modifiers: {
          async: m.isAsync(),
          decorators: m.getDecorators().map((d) => d.getName()),
          access: m.getScope() || "public",
          static: m.isStatic?.() || false,
        },
      });
    });
  });

  // interfaces
  sf.getInterfaces().forEach((intf) => {
    push({
      kind: "interface",
      name: intf.getName(),
      signature: truncate(intf.getText(), 500),
      start_line: intf.getStartLineNumber(),
      end_line: intf.getEndLineNumber(),
      modifiers: {},
    });
  });

  // type aliases
  sf.getTypeAliases().forEach((t) => {
    push({
      kind: "type",
      name: t.getName(),
      signature: truncate(t.getText(), 500),
      start_line: t.getStartLineNumber(),
      end_line: t.getEndLineNumber(),
      modifiers: {},
    });
  });

  // enums
  sf.getEnums().forEach((e) => {
    push({
      kind: "enum",
      name: e.getName(),
      signature: truncate(e.getText(), 500),
      start_line: e.getStartLineNumber(),
      end_line: e.getEndLineNumber(),
      modifiers: {},
    });
  });

  return rows;
}

function truncate(s: string, max = 800) {
  return s.length > max ? s.slice(0, max) + " …" : s;
}
