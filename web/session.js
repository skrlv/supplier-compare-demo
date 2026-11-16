import {analyze, decisionFingerprint, toCSV} from './engine.js';
import {validateImport} from './lib/import.js';
const copy = x => JSON.parse(JSON.stringify(x));
const object = x => x && typeof x === 'object' && !Array.isArray(x);
const checked=s=>{if(new TextEncoder().encode(JSON.stringify(s)).length>16*1024*1024)throw new Error('Данные сессии больше 16 МБ: сохраните её и начните новую.');if(s.decisionHistory.length>10000)throw new Error('Достигнут лимит 10000 изменений решений.');return s;};
const unsafe = new Set([...Object.getOwnPropertyNames(Object.prototype),'prototype']);
export const emptySession = () => ({schemaVersion:2,catalog:[],offers:[],decisions:{},quantities:{},edits:{},decisionHistory:[],demo:false});
export function effectiveOffers(s) { return s.offers.map(o=>({...o,...s.edits[o.id]})); }
export function resultFor(s) { return analyze({...s,offers:effectiveOffers(s)}); }
export function importRows(s,rows,kind) {
  if (!['catalog','offers'].includes(kind)) throw new Error('Неизвестный тип таблицы.');
  if(rows.some(r=>unsafe.has(String(r.id)))) throw new Error('Зарезервированный ID: выберите другой код.');
  validateImport(s[kind],rows,kind);
  const next=copy(s); next[kind].push(...copy(rows));
  resultFor(next); return checked(next);
}
export function decide(s,id,productId,reason) {
  if (!reason?.trim()) throw new Error('Укажите основание: модель, спецификацию или причину исключения.');
  const offer=effectiveOffers(s).find(o=>o.id===id);
  if (!offer) throw new Error('Предложение не найдено.');
  if (productId!=='__exclude__' && !s.catalog.some(p=>p.id===productId)) throw new Error('Выберите товар.');
  const next=copy(s); if(next.decisions[id]) next.decisionHistory.push({offerId:id,decision:next.decisions[id],action:"replaced",at:new Date().toISOString()}); next.decisions[id]={productId,reason:reason.trim(),fingerprint:decisionFingerprint(offer,s.catalog)};
  return checked(next);
}
export function editOffer(s,id,patch) {
  if (!s.offers.some(o=>o.id===id)) throw new Error('Предложение не найдено.');
  if (!object(patch) || Object.keys(patch).some(k=>unsafe.has(k)||k==='id'||k.startsWith('_'))) throw new Error('Недопустимое исправление.');
  const next=copy(s); next.edits[id]={...next.edits[id],...copy(patch)}; if(next.decisions[id]) { next.decisionHistory.push({offerId:id,decision:copy(next.decisions[id]),action:"conditions-edited",at:new Date().toISOString()}); next.decisions[id].fingerprint="stale:"+next.decisions[id].fingerprint; }
  return checked(next);
}
export function reconsider(s,id) {
  const next=copy(s),d=next.decisions[id];
  if(d) next.decisionHistory.push({offerId:id,decision:copy(d),action:"reconsidered",at:new Date().toISOString()});
  next.decisions[id]={productId:d?.productId||"",reason:d?.reason||"",fingerprint:"stale:"};
  return checked(next);
}
export function restoreSession(input) {
  const s=typeof input==='string'?JSON.parse(input):copy(input);
  if (!object(s)||s.schemaVersion!==2) throw new Error('Нужна сессия Сверки версии 2.');
  for (const kind of ['catalog','offers']) {
    if (!Array.isArray(s[kind])||s[kind].length>5000||!s[kind].every(object)) throw new Error('Повреждён список '+kind+'.');
    if (s[kind].some(r=>typeof r.id!=='string'||!r.id||unsafe.has(r.id))) throw new Error('Недопустимый ID.');
    if(s[kind].length) validateImport([],s[kind],kind);
  }
  for (const key of ['decisions','quantities','edits']) if (!object(s[key])||Object.keys(s[key]).some(k=>unsafe.has(k))) throw new Error('Повреждён раздел '+key+'.');
  if (Object.entries(s.edits).some(([id,p])=>!s.offers.some(o=>o.id===id)||!object(p)||Object.keys(p).some(k=>unsafe.has(k)||k==='id'||k.startsWith('_')))) throw new Error('Недопустимые исправления.');
  if (Object.values(s.quantities).some(q=>!['string','number'].includes(typeof q))) throw new Error('Недопустимая потребность.');
  if (Object.values(s.decisions).some(d=>!object(d)||typeof d.productId!=='string'||typeof d.reason!=='string'||typeof d.fingerprint!=='string')) throw new Error('Недопустимое решение.');
  if(s.decisionHistory!==undefined && (!Array.isArray(s.decisionHistory)||s.decisionHistory.length>10000||!s.decisionHistory.every(object))) throw new Error("Повреждена история решений.");
  const next={schemaVersion:2,decisionHistory:s.decisionHistory||[],catalog:s.catalog,offers:s.offers,decisions:s.decisions,quantities:s.quantities,edits:s.edits,demo:!!s.demo};
  resultFor(next); return checked(next);
}
export function exportJSON(s) { const result=JSON.stringify({...copy(s),exportedAt:new Date().toISOString(),calculation:resultFor(s)}); if(new TextEncoder().encode(result).length>128*1024*1024) throw new Error('Экспорт больше 128 МБ. Уменьшите сессию.'); return result; }
export function exportCSV(s) {
  const r=resultFor(s);
  return toCSV(r.rows.map(row=>({offer_id:row.id,supplier:row.supplier,name:row.name,status:row.status,product_id:row.productId,match_reason:row.matchReason,decision_reason:s.decisions[row.id]?.reason||'',issues:row.issues.join(' | '),price:row.source.price,price_unit:row.source.price_unit,pack_size:row.source.pack_size,content_unit:row.source.content_unit,tax_mode:row.source.tax_mode,vat_rate:row.source.vat_rate,moq:row.source.min_order,step:row.source.order_step,lead_days:row.source.lead_days,shipping:row.source.shipping,currency:row.normalized.currency,base_unit:row.normalized.baseUnit,base_price:row.normalized.unitPrice,requested_qty:row.calculation?.requestedQty,order_qty:row.calculation?.orderQty,delivered_qty:row.calculation?.deliveredQty,excess_qty:row.calculation?.excessQty,total:row.calculation?.total,effective_price:row.calculation?.effectiveUnitPrice,delivered_price:row.calculation?.deliveredUnitPrice,source_file:row.source._source?.file,source_sheet:row.source._source?.sheet,source_row:row.source._source?.row,original: s.offers.find(o=>o.id===row.id),edits:s.edits[row.id]||{},decision:s.decisions[row.id]||{},decision_history:s.decisionHistory.filter(d=>d.offerId===row.id),catalog_product:s.catalog.find(p=>p.id===row.productId)||{},errors:r.errors})));
}
