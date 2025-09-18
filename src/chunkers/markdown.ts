// src/chunkers/markdown.ts
import { unified } from "unified";
import remarkParse from "remark-parse";
import { visit } from "unist-util-visit";

function nodeText(n: any): string {
  if (!n) return "";
  if (n.type === "text") return n.value;
  if (n.type === "code")
    return "```" + (n.lang || "") + "\n" + n.value + "\n```";
  if (n.children) return n.children.map(nodeText).join("");
  return "";
}

export function chunkMarkdown(md: string, path: string) {
  const tree = unified().use(remarkParse).parse(md);
  const chunks: { text: string; meta: any }[] = [];
  let current = { title: "", text: "" };
  visit(tree, (node: any) => {
    if (node.type === "heading" && node.depth <= 3) {
      if (current.text.trim())
        chunks.push({
          text: current.text,
          meta: { path, title: current.title },
        });
      current = { title: nodeText(node), text: "" };
    } else if (["paragraph", "code", "list"].includes(node.type)) {
      current.text += nodeText(node) + "\n\n";
    }
  });
  if (current.text.trim())
    chunks.push({ text: current.text, meta: { path, title: current.title } });
  return chunks.map((c, i) => ({ ...c, ordinal: i }));
}
