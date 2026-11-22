import { readFileSync, writeFileSync } from "node:fs";
const load = (p) => readFileSync("dist/" + p, "utf8");
const html = load("index.html")
  .replace(
    /<script[^>]+src="([^"]+)"[^>]*><\/script>/g,
    (_, p) =>
      '<script type="module">' +
      load(p).replace(/<\/script/gi, "<\\/script") +
      "</script>",
  )
  .replace(
    /<link[^>]+href="([^"]+\.css)"[^>]*>/g,
    (_, p) => "<style>" + load(p) + "</style>",
  );
const csp =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'";
writeFileSync(
  "dist/offline.html",
  html.replace(
    "<head>",
    '<head><meta http-equiv=\"Content-Security-Policy\" content=\"' +
      csp +
      '\">',
  ),
);
