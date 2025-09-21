import { Project, SyntaxKind } from "ts-morph";

export function extractNestEndpoints(path: string, content: string) {
  const project = new Project({ useInMemoryFileSystem: true });
  const sf = project.createSourceFile(path, content, { overwrite: true });

  const endpoints: any[] = [];

  sf.getClasses().forEach((cls) => {
    const isController = cls
      .getDecorators()
      .some((d) => d.getName() === "Controller");
    if (!isController) return;
    const basePathDec = cls
      .getDecorators()
      .find((d) => d.getName() === "Controller");
    const basePath = (basePathDec?.getArguments()[0]?.getText() || "").replace(
      /[`'"]/g,
      "",
    );

    cls.getMethods().forEach((m) => {
      const routeDec = m
        .getDecorators()
        .find((d) =>
          [
            "Get",
            "Post",
            "Put",
            "Patch",
            "Delete",
            "Head",
            "Options",
            "All",
          ].includes(d.getName()),
        );
      if (!routeDec) return;

      const method = routeDec.getName().toUpperCase();
      const sub = (routeDec.getArguments()[0]?.getText() || "").replace(
        /[`'"]/g,
        "",
      );
      const pathFull =
        (basePath ? `/${basePath.replace(/^\/|\/$/g, "")}` : "") +
        (sub ? `/${sub.replace(/^\/|\/$/g, "")}` : "");
      const decorators = m.getDecorators().map((d) => d.getName());
      const reqParam = m
        .getParameters()
        .find((p) => p.getDecorators().some((d) => d.getName() === "Body"));
      const dtoIn = reqParam?.getType().getText();
      const dtoOut = m.getReturnType().getText();

      endpoints.push({
        language: "ts",
        protocol: "http",
        method,
        path: pathFull || "/",
        operation_id: null,
        handler_name: `${cls.getName() || "Controller"}.${m.getName()}`,
        start_line: m.getStartLineNumber(),
        end_line: m.getEndLineNumber(),
        decorators,
        request_shape: dtoIn ? { type: dtoIn } : null,
        response_shape: dtoOut ? { type: dtoOut } : null,
        meta: {},
      });
    });
  });

  return endpoints;
}
