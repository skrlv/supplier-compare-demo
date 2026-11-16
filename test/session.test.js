import test from 'node:test';
import assert from 'node:assert/strict';
import {emptySession,importRows,decide,editOffer,resultFor,restoreSession,exportJSON,exportCSV} from '../web/session.js';
const p={id:'p',sku:'P',name:'Товар',base_unit:'шт',required_qty:250};
const a={id:'A',supplier:'ДЕМО',sku:'P',sku_scope:'catalog',name:'Товар',price:850,price_unit:'упак',pack_size:100,content_unit:'шт',currency:'RUB',tax_mode:'included',min_order:1,order_step:1,lead_days:'3–5',shipping:300};
const initial=()=>({...emptySession(),catalog:[p],offers:[a]});
test('manual decision recalculates, edits preserve original and invalidate decision',()=>{
 let s=initial();s.offers[0]={...a,sku:'',name:'Похожий товар'};
 assert.equal(resultFor(s).rows[0].status,'review');
 s=decide(s,'A','p','Проверены спецификация и размер');assert.equal(resultFor(s).rows[0].calculation.total,2850);
 s.quantities.p=410;assert.equal(resultFor(s).rows[0].calculation.total,4550);
 s=editOffer(s,'A',{price:800});assert.equal(s.offers[0].price,850);assert.equal(resultFor(s).rows[0].status,'review');
 s=decide(s,'A','p','Размер подтверждён повторно');assert.equal(resultFor(s).rows[0].calculation.total,4300);
 assert.throws(()=>decide(s,'A','p',''));
});
test('duplicate/conflicting imports and broken restore are atomic',()=>{
 const s=initial(),before=JSON.stringify(s);
 assert.throws(()=>importRows(s,[{...a,price:900}],'offers'));
 assert.throws(()=>restoreSession('{broken'));
 assert.throws(()=>restoreSession({...s,offers:[a,a]}));
 assert.equal(JSON.stringify(s),before);
});
test('JSON roundtrip recalculates and preserves reason, original and fixes; CSV has real totals',()=>{
 let s=decide(initial(),'A','p','Сверен общий код');s=editOffer(s,'A',{shipping:0});s=decide(s,'A','p','Уточнена доставка');
 const json=exportJSON(s),restored=restoreSession(json),r=resultFor(restored);
 assert.equal(r.rows[0].calculation.total,2550);assert.equal(restored.offers[0].shipping,300);assert.equal(restored.edits.A.shipping,0);
 assert.equal(restored.decisions.A.reason,'Уточнена доставка');assert.match(exportCSV(restored),/2550/);
});

test('empty and catalogue-only sessions restore; decision history survives edits',()=>{
 assert.deepEqual(restoreSession(exportJSON(emptySession())).offers,[]);
 const s={...emptySession(),catalog:[p]};assert.equal(restoreSession(exportJSON(s)).catalog.length,1);
 let full=decide(initial(),'A','p','Основание до исправления');full=editOffer(full,'A',{shipping:400});
 assert.equal(full.decisionHistory[0].decision.reason,'Основание до исправления');
 assert.equal(resultFor(full).rows[0].status,'review');
});
