import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import ts from 'typescript';
const modules = new Map();
export async function load(file) {
  file = resolve(file);
  if (modules.has(file)) return modules.get(file);
  let code = ts.transpileModule(await readFile(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText.replace(/^import ["'][^"']+\.css["'];?$/gm, '');
  for (const match of [...code.matchAll(/from\s+["'](\.[^"']+)["']/g)]) {
    const dependency = await load(resolve(dirname(file), `${match[1]}.ts`));
    code = code.replace(match[0], `from "${dependency}"`);
  }
  const url = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
  modules.set(file, url);
  return url;
}
