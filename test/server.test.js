import test from 'node:test';import assert from 'node:assert/strict';
import {createServer} from '../server.mjs';
test('local API analyzes, imports and rejects cross-origin and invalid payload',async()=>{
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{
  assert.equal((await fetch(base)).status,200);
  const result=await fetch(base+'/api/analyze',{method:'POST',body:JSON.stringify({catalog:[],offers:[]})});assert.equal(result.status,200);assert.ok((await result.json()).errors.length);
  assert.equal((await fetch(base+'/api/analyze',{method:'POST',headers:{Origin:'https://other.example'},body:'{}'})).status,403);
  assert.equal((await fetch(base+'/api/analyze',{method:'POST',body:'{bad'})).status,400);
  const csv='id,sku,name,base_unit,required_qty\np,P,Товар,шт,250';
  const imported=await fetch(base+'/api/import?kind=catalog&name=demo.csv',{method:'POST',body:csv});assert.equal(imported.status,200);assert.equal((await imported.json()).rows[0].sku,'P');
  assert.equal((await fetch(base+'/%2e%2e%2fpackage.json')).status,403);
 }finally{await new Promise(r=>server.close(r));}
});
