// Build a self-contained offline demo from our own dependency-free modules.
import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
async function build(page,stylesheet,entry,moduleNames,target){
 const modules=[];
 for(const name of moduleNames){
  const source=await readFile(new URL(name,root),'utf8');
  modules.push(source.replace(/^import .+ from ['"].+['"];\s*$/gm,'').replace(/^export /gm,''));
 }
 const script=modules.join('\n\n').replace(/<\/script/gi,'<\\/script');
 const css=await readFile(new URL(stylesheet,root),'utf8');
 let html=await readFile(new URL(page,root),'utf8');
 html=html.replace(`<link rel="stylesheet" href="./${stylesheet}">`,`<style>${css}</style>`)
   .replace(`<script type="module" src="./${entry}"></script>`,`<script type="module">${script}</script>`)
   .replace('class="brand" href="./"','class="brand" href="#"');
 html=html.replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'none'; object-src 'none'; base-uri 'none'">`);
 await writeFile(new URL(target,root),html);
 console.log(`Built ${target} (${Buffer.byteLength(html)} bytes); opens directly in a browser.`);
}
await build('sandbox.html','style.css','app.js',['engine.js','save.js','app.js'],'standalone.html');
await build('casebook.html','casebook.css','casebook.js',['engine.js','save.js','harder-case.js','window-case.js','cases.js','casebook.js'],'casebook-standalone.html');

// The static site's entry page is the casebook; standalone.html remains the sandbox.
await writeFile(new URL('index.html',root),await readFile(new URL('casebook-standalone.html',root),'utf8'));
