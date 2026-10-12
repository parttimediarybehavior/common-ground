// Publish only the three self-contained player pages; source and tooling stay in GitHub.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url),output=new URL('../dist/',import.meta.url);
await mkdir(output,{recursive:true});
for(const page of ['index.html','casebook-standalone.html','standalone.html']){
 await writeFile(new URL(page,output),await readFile(new URL(page,root)));
}
