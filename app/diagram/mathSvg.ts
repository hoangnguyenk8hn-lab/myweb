import { mathjax } from "mathjax-full/js/mathjax.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import "mathjax-full/js/input/tex/ams/AmsConfiguration.js";
import "mathjax-full/js/input/tex/newcommand/NewcommandConfiguration.js";
import "mathjax-full/js/input/tex/noundefined/NoUndefinedConfiguration.js";

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const engine = mathjax.document("", {
  InputJax: new TeX({
    packages: ["base", "ams", "newcommand", "noundefined"],
    maxBuffer: 20000,
    maxMacros: 1000,
  }),
  OutputJax: new SVG({ fontCache: "none" }),
});
export type MathSvg = { body: string; box: number[] };
const cache = new Map<string, MathSvg>();
export function renderMathSvg(latex: string): MathSvg {
  const key = latex.slice(0, 12000);
  const hit = cache.get(key);
  if (hit) return hit;
  const node = engine.convert(key, {
    display: true,
    em: 16,
    ex: 8,
    containerWidth: 10000,
  });
  const markup = adaptor.outerHTML(node);
  const body = markup.match(/<svg[^>]*>([\s\S]*)<\/svg>/)?.[1] ?? "";
  const box = (markup.match(/viewBox="([^"]+)"/)?.[1] ?? "0 0 1000 1000")
    .split(/\s+/)
    .map(Number);
  const result = { body, box };
  cache.set(key, result);
  if (cache.size > 256) cache.delete(cache.keys().next().value!);
  return result;
}
