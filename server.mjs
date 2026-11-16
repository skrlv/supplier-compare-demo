import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {analyze} from './web/engine.js';
import {readTable,autoMapping,mapRows} from './web/lib/import.js';
const root=fileURLToPath(new URL('./web/',import.meta.url));
const mime={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.css':'text/css;charset=utf-8','.svg':'image/svg+xml','.csv':'text/csv;charset=utf-8','.json':'application/json','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
export function createServer(){return http.createServer(async(req,res)=>{
  const send=(status,data,type='application/json')=>{res.writeHead(status,{'Content-Type':type,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});res.end(typeof data==='string'||Buffer.isBuffer(data)?data:JSON.stringify(data));};
  try{
    if(req.headers.origin && req.headers.origin!==`http://${req.headers.host}`)return send(403,{error:'Cross-origin requests are not allowed.'});
    const url=new URL(req.url,'http://127.0.0.1');
    if(req.method==='POST' && ['/api/analyze','/api/import'].includes(url.pathname)){
      let size=0;const chunks=[];
      for await(const c of req){size+=c.length;if(size>5*1024*1024){send(413,{error:'Maximum 5 MB.'});return;}chunks.push(c);}
      const body=Buffer.concat(chunks);
      if(url.pathname==='/api/analyze'){
        const input=JSON.parse(body.toString('utf8'));
        if(!Array.isArray(input.catalog)||!Array.isArray(input.offers)||input.catalog.length>5000||input.offers.length>5000)throw new Error('Invalid rows or row limit.');
        return send(200,analyze(input));
      }
      const name=url.searchParams.get('name')||'offers.csv',kind=url.searchParams.get('kind')||'offers';
      if(!['catalog','offers'].includes(kind))throw new Error('Unknown import kind.');
      const table=await readTable(body,{name}),sheet=table.sheets[Number(url.searchParams.get('sheet')||0)];
      if(!sheet)throw new Error('Sheet not found.');
      return send(200,{rows:mapRows(sheet,autoMapping(sheet.headers,kind),{kind,sourceName:name,sourceId:table.sourceId}),sheets:table.sheets.map(s=>s.name)});
    }
    if(req.method!=='GET'&&req.method!=='HEAD')return send(405,{error:'Method not allowed.'});
    let pathname=decodeURIComponent(req.url.split('?')[0]);
    if(pathname.includes('..')||pathname.includes('\\')||pathname.includes('\0'))return send(403,{error:'Invalid path.'});
    if(pathname==='/')pathname='/index.html';
    const target=path.resolve(root,'.'+pathname);
    if(!target.startsWith(root))return send(403,{error:'Invalid path.'});
    let data;
    try {data=await readFile(target);}catch{
      if(pathname.startsWith('/examples/'))data=await readFile(new URL('./examples/'+path.basename(pathname),import.meta.url));else throw new Error('Not found');
    }
    send(200,req.method==='HEAD'?'':data,mime[path.extname(pathname)]||'application/octet-stream');
  }catch(err){send(err.message==='Not found'?404:400,{error:err.message});}
});}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const port=Number(process.env.PORT||4199);
  createServer().listen(port,'127.0.0.1',()=>console.log(`Сверка: http://127.0.0.1:${port} (только локальный компьютер)`));
}
