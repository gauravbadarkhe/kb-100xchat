import { Project } from "ts-morph";

export type TypeShapeRow = {
  name: string;
  kind: "interface" | "type" | "enum";
  shape: any; // normalized JSON-ish schema
  start_line?: number | null;
  end_line?: number | null;
  meta?: Record<string, any>;
};

export function extractTsTypeShapes(
  path: string,
  content: string,
): TypeShapeRow[] {
  const project = new Project({ useInMemoryFileSystem: true });
  const sf = project.createSourceFile(path, content, { overwrite: true });
  const out: TypeShapeRow[] = [];

  // interfaces -> properties into {properties, required}
  sf.getInterfaces().forEach((intf) => {
    const props: Record<string, any> = {};
    const required: string[] = [];
    intf.getProperties().forEach((p) => {
      const name = p.getName();
      const typeText = p.getType().getText();
      const optional = p.hasQuestionToken();
      props[name] = { type: normalizeTsType(typeText), optional };
      if (!optional) required.push(name);
    });
    out.push({
      name: intf.getName(),
      kind: "interface",
      shape: { properties: props, required },
      start_line: intf.getStartLineNumber(),
      end_line: intf.getEndLineNumber(),
      meta: {},
    });
  });

  // type aliases (best-effort; we store raw text for unions/complex)
  sf.getTypeAliases().forEach((t) => {
    const tt = t.getType().getText();
    const isUnion = /\|/.test(tt);
    const isObject = /{[\s\S]*}/.test(tt);
    const shape = isObject
      ? { text: compress(tt) }
      : isUnion
        ? { union: tt.split("|").map((s) => s.trim()) }
        : { type: normalizeTsType(tt) };

    out.push({
      name: t.getName(),
      kind: "type",
      shape,
      start_line: t.getStartLineNumber(),
      end_line: t.getEndLineNumber(),
      meta: {},
    });
  });

  // enums
  sf.getEnums().forEach((e) => {
    out.push({
      name: e.getName(),
      kind: "enum",
      shape: { enum: e.getMembers().map((m) => m.getName()) },
      start_line: e.getStartLineNumber(),
      end_line: e.getEndLineNumber(),
      meta: {},
    });
  });

  return out;
}

function normalizeTsType(t: string) {
  const tt = t.replace(/\s+/g, " ");
  if (/^string(\[\])?$/.test(tt)) return "string";
  if (/^number(\[\])?$/.test(tt)) return "number";
  if (/^boolean(\[\])?$/.test(tt)) return "boolean";
  if (/^Record<.+>$/.test(tt)) return "record";
  if (/^Array<.+>$/.test(tt) || /\[\]$/.test(tt)) return "array";
  if (/^Promise<.+>$/.test(tt)) return "promise";
  if (/^{[\s\S]*}$/.test(tt)) return "object";
  return tt.slice(0, 100);
}

function compress(s: string, max = 800) {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max) + " …" : t;
}
