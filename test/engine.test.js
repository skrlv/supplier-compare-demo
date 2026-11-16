import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {sha256,SHA256} from '../web/sha256.js';
import {analyze,normalizeUnit,parseCSV,toCSV,parseNumber,decisionFingerprint,SAMPLE_CATALOG,SAMPLE_OFFERS} from '../web/engine.js';
const catalog=[{id:'a',sku:'A-10',name:'Пакет крафтовый 200×300 мм',base_unit:'шт',required_qty:250,aliases:'Крафт 200×300'}];
const offer={id:'o',supplier:'DEMO',sku:'A-10',sku_scope:'catalog',name:catalog[0].name,price:850,price_unit:'упак',pack_size:100,content_unit:'шт',currency:'RUB',tax_mode:'included',min_order:1,order_step:1,lead_days:'3-5',shipping:300};
const run=(patch={},args={})=>analyze({catalog,offers:[{...offer,...patch}],...args});
const decision=(o=offer,c=catalog,productId='a',reason='Проверены модель, размер и назначение')=>({productId,reason,fingerprint:decisionFingerprint(o,c)});

test('CSV supports BOM, multiline quoted cells, semicolon, comma and TSV',()=>{
  assert.deepEqual(parseCSV('\uFEFFid;name;price\r\n1;"Пакет; ""крафт""\nстрока";9,5\r\n'),[{id:'1',name:'Пакет; "крафт"\nстрока',price:'9,5'}]);
  assert.deepEqual(parseCSV('id,name\n1,"a,b"'),[{id:'1',name:'a,b'}]);
  assert.deepEqual(parseCSV('id\tname\n1\tx'),[{id:'1',name:'x'}]);
});
test('malformed CSV throws before shifting or discarding cells',()=>{
  for(const s of ['id;id\n1;2','id;\n1;2','id;name\n1;"no','id;name\n1;"x"garbage','id;name\n1;x;y','id;name\n1;a"b']) assert.throws(()=>parseCSV(s));
  assert.deepEqual(parseCSV(''),[]);
});
test('CSV export neutralizes formula text and roundtrips raw nested evidence',()=>{
  const csv=toCSV([{name:'=CMD()',value:-2,comment:'a;b',raw:{source:'x'}}]);
  assert.match(csv,/'=CMD\(\)/); assert.equal(parseCSV(csv)[0].value,'-2');
  assert.deepEqual(JSON.parse(parseCSV(csv)[0].raw),{source:'x'});
  for(const name of ['+cmd','-cmd','@cmd','\t=cmd']) assert.equal(parseCSV(toCSV([{name}]))[0].name.startsWith("'"),true);
});
test('declared decimal format accepts decimal comma/dot and space grouping, rejects excessive precision',()=>{
  assert.equal(parseNumber('1\u00a0250,50'),1250.5);assert.equal(parseNumber('1,234'),1.234);
  assert.equal(parseNumber('0'),0);assert.equal(parseNumber(1e-7),.0000001);
  for(const value of ['', 'Infinity','1,234.50','12шт','1e3','1,2,3','0.0000000000001',1e16]) assert.equal(parseNumber(value),null,String(value));
});
test('normalization never equates different dimensions',()=>{
  assert.deepEqual(normalizeUnit('g'),{canonical:'кг',dimension:'mass',factor:.001,pack:false});
  assert.equal(normalizeUnit('мл').factor,.001);assert.equal(normalizeUnit('cm').factor,.01);
  assert.equal(normalizeUnit('м2').canonical,'м²');assert.equal(normalizeUnit('коробка').pack,true);
  assert.equal(normalizeUnit('рулон 50'),null);
});
test('hand matrix A-G: MOQ, packaging, VAT, currencies, grams and half-up',()=>{
  const r=analyze({catalog:SAMPLE_CATALOG,offers:SAMPLE_OFFERS});
  for(const [id,total,order,delivered] of [['A',2850,3,300],['B',3420,300,300],['C',5000,10,1000],['D',29,3,300],['E',2550,12500,12.5],['E2',2860,13,13],['F',60,6,6],['G',1.01,1,1]]) {
    const row=r.rows.find(x=>x.id===id);assert.equal(row.status,'matched',id);assert.equal(row.calculation.total,total,id);assert.equal(row.calculation.orderQty,order,id);assert.equal(row.calculation.deliveredQty,delivered,id);
  }
  const group=r.comparisons.find(x=>x.productId==='kraft-200');
  assert.deepEqual(group.bestByCurrency,{RUB:'A',USD:'D'});assert.deepEqual(group.fastestByCurrency,{RUB:'C',USD:'D'});
  assert.equal(r.rows.find(x=>x.id==='A').normalized.unitPrice,8.5);
  assert.equal(r.rows.find(x=>x.id==='A').calculation.effectiveUnitPrice,11.4);
  assert.equal(r.rows.find(x=>x.id==='A').calculation.deliveredUnitPrice,9.5);
  assert.equal(r.rows.find(x=>x.id==='G').calculation.totalMinor,'101');
  assert.equal(r.summary.review,2);assert.equal(r.summary.invalid,4);
  assert.ok(SAMPLE_OFFERS.every(o=>o.supplier.startsWith('ДЕМО')));
});
test('overrides use original catalogue unit; calculations do not mutate inputs',()=>{
  const r=run({}, {quantities:{a:410}});assert.equal(r.rows[0].calculation.total,4550);assert.equal(r.rows[0].calculation.excessQty,90);assert.equal(catalog[0].required_qty,250);
  const r2=analyze({catalog:SAMPLE_CATALOG,offers:SAMPLE_OFFERS,quantities:{filler:13000}});
  assert.equal(r2.rows.find(x=>x.id==='E').calculation.requestedQty,13);
});
test('fractional physical steps are exact and order multiple starts at zero',()=>{
  const c=[{...catalog[0],base_unit:'кг',required_qty:.3}];
  const o={...offer,price:100,price_unit:'кг',pack_size:'',content_unit:'',min_order:.1,order_step:.1,shipping:0};
  const row=analyze({catalog:c,offers:[o]}).rows[0];assert.equal(row.calculation.orderQty,.3);assert.equal(row.calculation.total,30);
  const f=run({price:10,price_unit:'шт',pack_size:'',content_unit:'',min_order:5,order_step:2,shipping:0},{quantities:{a:4}}).rows[0];
  assert.equal(f.calculation.orderQty,6);assert.equal(f.calculation.total,60);
});
test('half-up rounds only final money, supports explicit currency precision',()=>{
  const o={...offer,price:'1.005',price_unit:'шт',pack_size:'',content_unit:'',shipping:0};
  assert.equal(run(o,{quantities:{a:1}}).rows[0].calculation.total,1.01);
  assert.equal(run(o,{quantities:{a:3}}).rows[0].calculation.total,3.02);
  assert.equal(run({...o,price:'1.5',currency:'JPY'},{quantities:{a:1}}).rows[0].calculation.total,2);
  assert.equal(run({...o,price:'1.0005',currency:'KWD'},{quantities:{a:1}}).rows[0].calculation.total,1.001);
});
test('explicit taxes never add included VAT twice; unknown inputs never imply zero',()=>{
  assert.equal(run({tax_mode:'excluded',vat_rate:20}).rows[0].calculation.total,3360);
  assert.equal(run({tax_mode:'excluded',vat_rate:0}).rows[0].calculation.total,2850);
  assert.equal(run({tax_mode:'included',vat_rate:20}).rows[0].calculation.total,2850);
  assert.equal(run({shipping:0}).rows[0].calculation.total,2550);
  assert.equal(run({price:0,shipping:0,lead_days:0}).rows[0].calculation.total,0);
  for(const patch of [{price:''},{min_order:''},{order_step:''},{lead_days:''},{shipping:''},{currency:''},{pack_size:''},{content_unit:''},{price:-1},{order_step:0},{lead_days:'5-3'},{lead_days:'в наличии'},{lead_days:'3 рабочих дня'},{tax_mode:'unknown'},{tax_mode:'excluded',vat_rate:''},{tax_mode:'excluded',vat_rate:-1}]) {
    const r=run(patch);assert.equal(r.rows[0].status,'invalid',JSON.stringify(patch));assert.equal(r.rows[0].calculation,null);assert.deepEqual(r.comparisons[0].bestByCurrency,{});
  }
});
test('indivisible pieces/packs forbid fractional order constraints and contents',()=>{
  for(const patch of [{min_order:.5},{order_step:.5},{pack_size:2.5}]) assert.equal(run(patch).rows[0].status,'invalid');
  assert.equal(run({}, {quantities:{a:.5}}).rows[0].status,'invalid');
  const c=[{...catalog[0],base_unit:'кг',required_qty:1}];
  assert.equal(run({pack_size:.5,content_unit:'кг',min_order:1,order_step:1},{catalog:c}).rows[0].status,'matched');
});
test('exact names and aliases require review; supplier SKU cannot auto-match',()=>{
  for(const patch of [{sku_scope:''},{sku_scope:'supplier'},{sku:'other',name:'Крафт 200×300'},{sku:'',name:catalog[0].name}]) {
    const r=run(patch).rows[0];assert.equal(r.status,'review',JSON.stringify(patch));assert.equal(r.calculation,null);assert.equal(r.candidates[0].id,'a');
  }
});
test('SKU punctuation, leading zeros and case remain significant',()=>{
  const c=[{...catalog[0],sku:'001-A'}];
  for(const sku of ['001A','001-a','1-A']) assert.equal(run({sku},{catalog:c}).rows[0].status,'review');
  assert.equal(run({sku:'001-A'},{catalog:c}).rows[0].status,'matched');
});
test('SKU/name variant conflicts and duplicate SKU require review',()=>{
  for(const name of ['Пакет крафтовый 250×350 мм','Электродвигатель промышленный']) assert.equal(run({name}).rows[0].status,'review');
  const c=[{...catalog[0],name:'Футболка чёрная XL'}];
  for(const name of ['Футболка белая XL','Футболка чёрная L']) assert.equal(run({name},{catalog:c}).rows[0].status,'review');
  assert.equal(run({}, {catalog:[...catalog,{...catalog[0],id:'b'}]}).rows[0].status,'review');
});
test('manual selection requires reason, fingerprint, existing target and supports recalculation',()=>{
  const o={...offer,sku:'local',sku_scope:'supplier',name:'Пакет крафтовый'};
  const initial=analyze({catalog,offers:[o]});assert.equal(initial.rows[0].status,'review');
  const d=decision(o);const r=analyze({catalog,offers:[o],decisions:{o:d}});
  assert.equal(r.rows[0].status,'matched');assert.match(r.rows[0].matchReason,/Проверены/);
  assert.equal(analyze({catalog,offers:[o],decisions:{o:d},quantities:{a:410}}).rows[0].calculation.total,4550);
  for(const invalid of ['a', {...d,reason:''},{...d,productId:'missing'},{...d,fingerprint:'old'}]) assert.equal(analyze({catalog,offers:[o],decisions:{o:invalid}}).rows[0].status,'review');
  assert.equal(analyze({catalog,offers:[{...o,price:851}],decisions:{o:d}}).rows[0].status,'review');
  assert.equal(analyze({catalog:[{...catalog[0],name:'Обновлённый товар'}],offers:[o],decisions:{o:d}}).rows[0].status,'review');
  assert.equal(r.rows[0].source.name,o.name);assert.equal(JSON.stringify(o),JSON.stringify(initial.rows[0].source));
});
test('manual decision cannot override physical dimension; exclusions are audited',()=>{
  const o={...offer,price_unit:'кг',pack_size:'',content_unit:''};
  const row=run(o,{decisions:{o:decision(o)}}).rows[0];assert.equal(row.status,'invalid');assert.match(row.issues.join(' '),/Несовместимые/);
  const r=run({}, {decisions:{o:decision(offer,catalog,'__exclude__','Не подходит исполнение')}});
  assert.equal(r.rows[0].status,'excluded');assert.equal(r.comparisons[0].offers.length,0);assert.match(r.rows[0].matchReason,/Не подходит/);
});
test('duplicate offers/catalog IDs are invalid; missing offer IDs cannot be silently index-matched',()=>{
  const r=analyze({catalog,offers:[offer,{...offer,price:500}],decisions:{o:decision()}});
  assert.equal(r.rows.every(x=>x.status==='invalid'),true);assert.equal(r.summary.comparable,0);assert.match(r.errors.join(' '),/Повторяется id/);
  assert.equal(run({}, {catalog:[...catalog,{...catalog[0]}]}).summary.comparable,0);
  assert.equal(run({id:''}).rows[0].status,'invalid');
});
test('tie break is upper lead bound then stable ID; fastest tie uses cost then ID',()=>{
  const offers=[{...offer,id:'b',lead_days:'1-5'},{...offer,id:'a',lead_days:'3-5'},{...offer,id:'fast',price:900,lead_days:1}];
  const r=analyze({catalog,offers});assert.equal(r.comparisons[0].bestByCurrency.RUB,'a');assert.equal(r.comparisons[0].fastestByCurrency.RUB,'fast');
});
test('numeric overflow and invalid catalogue demand stay visible and cannot rank',()=>{
  assert.equal(run({price:Number.MAX_VALUE}).rows[0].status,'invalid');
  assert.equal(run({price:1e15}).rows[0].status,'invalid');
  assert.equal(run({}, {quantities:{a:''}}).rows[0].status,'invalid');
  assert.equal(run({id:'toString'}).rows[0].status,'matched');
});
test('decision version signatures are stable over key ordering and quantity-independent',()=>{
  const a=decisionFingerprint({id:'x',price:1},[{id:'a',sku:'A'}]);
  const b=decisionFingerprint({price:1,id:'x'},[{sku:'A',id:'a'}]);assert.equal(a,b);
  assert.notEqual(a,decisionFingerprint({id:'x',price:2},[{id:'a',sku:'A'}]));
});

test('SHA-256 standard known-answer vectors: empty, abc and million a',()=>{
  assert.equal(sha256(''),'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(sha256('abc'),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(sha256('a'.repeat(1000000)),'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
});
test('SHA-256 block/padding boundaries, UTF-8 and streaming agree with Node crypto',()=>{
  const digest=s=>createHash('sha256').update(s).digest('hex');
  for(const size of [1,55,56,63,64,65,119,120,127,128,129,5000]) {
    const input='0123456789'.repeat(Math.ceil(size/10)).slice(0,size);
    assert.equal(sha256(input),digest(input),String(size));
    const streamed=new SHA256();for(let i=0;i<input.length;i+=7)streamed.update(input.slice(i,i+7));
    assert.equal(streamed.digestHex(),digest(input));assert.equal(streamed.digestHex(),digest(input));
  }
  assert.equal(sha256('Сверка · 📦 200×300'),digest('Сверка · 📦 200×300'));
  const bytes=Uint8Array.from({length:256},(_,i)=>i);assert.equal(sha256(bytes),digest(bytes));
  const prefix=new SHA256().update('prefix:');
  assert.equal(prefix.clone().update('A').digestHex(),digest('prefix:A'));
  assert.equal(prefix.clone().update('B').digestHex(),digest('prefix:B'));
  assert.equal(prefix.digestHex(),digest('prefix:'));
});
test('fingerprint is compact SHA-256 of full canonical data and catches in-place edits',()=>{
  const o={price:1,id:'x'},c=[{sku:'A',id:'a'}];
  const canonical='{"catalog":[{"id":"a","sku":"A"}],"offer":{"id":"x","price":1}}';
  assert.equal(decisionFingerprint(o,c),'decision-v2:'+createHash('sha256').update(canonical).digest('hex'));
  assert.match(decisionFingerprint(o,c),/^decision-v2:[0-9a-f]{64}$/);
  const first=decisionFingerprint(o,c);c[0].sku='B';assert.notEqual(decisionFingerprint(o,c),first);
  const c2=[{...catalog[0]}],o2={...offer,sku_scope:'supplier'},d=decision(o2,c2);
  c2[0].aliases='Изменены варианты';
  assert.equal(analyze({catalog:c2,offers:[o2],decisions:{o:d}}).rows[0].status,'review');
});
test('analyze hashes the catalogue prefix once for many manual decisions',()=>{
  let reads=0;const product={...catalog[0],get version(){reads++;return 'v1';}},c=[product];
  const offers=Array.from({length:100},(_,i)=>({...offer,id:'row-'+i}));
  const decisions=Object.fromEntries(offers.map(o=>[o.id,decision(o,c)]));reads=0;
  const r=analyze({catalog:c,offers,decisions});
  assert.equal(r.summary.matched,100);assert.ok(reads<10,'catalogue version serialized once, reads='+reads);
});

test('indexed exact codes retain other exact-name conflicts',()=>{
  const other={...catalog[0],id:'b',sku:'B-20',name:'Пакет крафтовый 250×350 мм'};
  const r=run({name:other.name},{catalog:[...catalog,other]});
  assert.equal(r.rows[0].status,'review');assert.deepEqual(r.rows[0].candidates.map(c=>c.id),['a','b']);
});
test('large exact-code imports avoid full catalogue fuzzy scans',()=>{
  const c=Array.from({length:2000},(_,i)=>({id:'p'+i,sku:'SKU-'+i,name:'ДЕМО модель '+i,base_unit:'шт',required_qty:1}));
  const offers=c.map((p,i)=>({...offer,id:'o'+i,sku:p.sku,name:p.name,price_unit:'шт',pack_size:'',content_unit:'',price:1,shipping:0}));
  const r=analyze({catalog:c,offers});assert.equal(r.summary.matched,2000);assert.equal(r.rows[1999].productId,'p1999');
});
