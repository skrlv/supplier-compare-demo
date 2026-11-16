import {rm,cp,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const project=new URL('../',import.meta.url);
const dist=new URL('dist/',project);
await rm(dist,{recursive:true,force:true});await mkdir(dist,{recursive:true});
await cp(new URL('web/',project),dist,{recursive:true});
await cp(new URL('examples/',project),new URL('examples/',dist),{recursive:true});
console.log(`Статическая сборка: ${fileURLToPath(dist)}`);
