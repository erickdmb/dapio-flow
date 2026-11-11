/** Wrap words and long tokens to fit a fixed area without painting over icons. */
export function wrapLabel(text: string, maxWidth: number, maxLines: number, measure: (text: string) => number): string[] {
  if (!text || maxLines < 1) return [];
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && measure(`${line} ${word}`) <= maxWidth) { line += ` ${word}`; continue; }
      if (line) { lines.push(line); line = ""; }
      for (const char of word) {
        if (line && measure(line + char) > maxWidth) { lines.push(line); line = ""; }
        line += char;
      }
    }
    lines.push(line);
  }
  if (lines.length <= maxLines) return lines;
  const result = lines.slice(0, maxLines);
  let last = result[maxLines - 1];
  while (last && measure(last + "…") > maxWidth) last = last.slice(0, -1);
  result[maxLines - 1] = last + "…";
  return result;
}
