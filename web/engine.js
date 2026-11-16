import {SHA256} from './sha256.js';
/** Supplier Compare — deterministic, conservative procurement calculations. No network or storage. */
const text = value => value == null ? '' : String(value).trim();
const key = value => text(value).toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/[×х]/g, 'x').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
const has = (obj, prop) => Object.prototype.hasOwnProperty.call(obj, prop);
const blank = value => value == null || text(value) === '';
const round = (value, digits = 2) => Number(value.toFixed(digits));

/** Decimal input: dot or comma decimal mark, spaces are grouping marks. No mixed separators.
 * At most 12 decimal places and absolute value <= 10^15. Strings never accept exponents.
 * All purchase arithmetic below uses exact rational BigInt values, not binary floats. */
function decimalText(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    let s = String(value);
    if (/[eE]/.test(s)) {
      const [mantissa, exponent] = s.toLowerCase().split('e'), exp=Number(exponent);
      const negative=mantissa.startsWith('-'), parts=mantissa.replace(/^[+-]/,'').split('.');
      const digits=parts.join(''), point=parts[0].length+exp;
      s=(negative?'-':'')+(point<=0?'0.'+'0'.repeat(-point)+digits:point>=digits.length?digits+'0'.repeat(point-digits.length):digits.slice(0,point)+'.'+digits.slice(point));
    }
    value=s;
  }
  if (blank(value)) return null;
  const s=text(value).replace(/[\s\u00a0\u202f]/g,'').replace(',','.');
  if (!/^[+-]?(?:\d+(?:\.\d{0,12})?|\.\d{1,12})$/.test(s)) return null;
  const n=Number(s);
  return Number.isFinite(n) && Math.abs(n)<=1e15 ? s : null;
}
export function parseNumber(value) {
  const s=decimalText(value); return s===null ? null : Number(s);
}
const gcd=(a,b)=>{ a=a<0n?-a:a; b=b<0n?-b:b; while(b){const c=a%b;a=b;b=c;} return a||1n; };
function rat(n,d=1n) { if(d===0n) throw new Error('Нулевой делитель.'); if(d<0n){n=-n;d=-d;} const g=gcd(n,d); return {n:n/g,d:d/g}; }
function decimal(value) {
  const s=decimalText(value); if(s===null) return null;
  const negative=s.startsWith('-'), [whole,fraction='']=s.replace(/^[+-]/,'').split('.');
  return rat(BigInt((whole||'0')+fraction)*(negative?-1n:1n),10n**BigInt(fraction.length));
}
const add=(a,b)=>rat(a.n*b.d+b.n*a.d,a.d*b.d);
const sub=(a,b)=>rat(a.n*b.d-b.n*a.d,a.d*b.d);
const mul=(a,b)=>rat(a.n*b.n,a.d*b.d);
const div=(a,b)=>rat(a.n*b.d,a.d*b.n);
const cmp=(a,b)=>a.n*b.d<b.n*a.d?-1:a.n*b.d>b.n*a.d?1:0;
const number=a=>Number(a.n)/Number(a.d);
const whole=a=>a.n%a.d===0n;
function rounded(a,digits) {
  const scale=10n**BigInt(digits), sign=a.n<0n?-1n:1n, n=(a.n<0n?-a.n:a.n)*scale;
  const minor=(n/a.d+(n%a.d*2n>=a.d?1n:0n))*sign;
  if (minor>BigInt(Number.MAX_SAFE_INTEGER)||minor<BigInt(Number.MIN_SAFE_INTEGER)) return null;
  return {value:Number(minor)/Number(scale),minor:String(minor)};
}
function stable(value) {
  if (Array.isArray(value)) return '['+value.map(stable).join(',')+']';
  if (value && typeof value==='object') return '{'+Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';
  return JSON.stringify(value)??'null';
}
/** Hash canonical {catalog,offer}. Reuse the streamed catalogue prefix within one analyze call.
 * No identity cache: mutations in the same object are detected on the next call.
 * Quantities are independent of product identity and do not invalidate a human decision. */
function fingerprintPrefix(catalog) { return new SHA256().update('{"catalog":').update(stable(catalog)).update(',"offer":'); }
function fingerprintWithPrefix(offer,prefix) { return 'decision-v2:'+prefix.clone().update(stable(offer)).update('}').digestHex(); }
export function decisionFingerprint(offer,catalog) { return fingerprintWithPrefix(offer,fingerprintPrefix(catalog)); }

const unitGroups = [
  ['шт', 'count', 1, ['шт','шт.','штука','штук','штуки','pcs','pc','piece','pieces','ед','ед.']],
  ['кг', 'mass', 1, ['кг','kg','килограмм','килограммы']],
  ['кг', 'mass', 0.001, ['г','гр','г.','g','gram','грамм']],
  ['кг', 'mass', 1000, ['т','t','тонна']],
  ['л', 'volume', 1, ['л','л.','l','литр','литры']],
  ['л', 'volume', 0.001, ['мл','ml','миллилитр']],
  ['м', 'length', 1, ['м','м.','m','метр','метры']],
  ['м', 'length', 0.01, ['см','cm','сантиметр']],
  ['м', 'length', 0.001, ['мм','mm','миллиметр']],
  ['м²', 'area', 1, ['м²','м2','m2','m²','кв.м','кв. м','кв м']],
];
export function normalizeUnit(value) {
  const v = text(value).toLocaleLowerCase('ru').replace(/\s+/g, ' ');
  if (['упак','упак.','упаковка','упаковки','pack','packs','короб','короб.','коробка','коробки','box','boxes'].includes(v))
    return {canonical:'упак', dimension:'package', factor:null, pack:true};
  for (const [canonical,dimension,factor,aliases] of unitGroups)
    if (aliases.includes(v)) return {canonical,dimension,factor,pack:false};
  return null;
}

function delimiterFor(s) {
  let quoted = false; const counts = {',':0,';':0,'\t':0};
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '"') { if (quoted && s[i+1] === '"') i++; else quoted = !quoted; }
    else if (!quoted && /[\r\n]/.test(s[i])) break;
    else if (!quoted && has(counts, s[i])) counts[s[i]]++;
  }
  return Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0];
}
/** CSV: BOM, comma/semicolon/tab, multiline quoted cells, RFC4180 escaping. */
export function parseCSV(input) {
  if (typeof input !== 'string') throw new Error('CSV должен быть текстом.');
  const s = input.replace(/^\uFEFF/, '');
  if (!s.trim()) return [];
  const delimiter = delimiterFor(s), records = []; let record = [], cell = '', state = 'start';
  const finishCell = () => { record.push(cell); cell = ''; state = 'start'; };
  const finishRow = () => { finishCell(); if (record.some(x=>x.trim()!=='')) records.push(record); record = []; };
  for (let i=0; i<s.length; i++) {
    const ch = s[i];
    if (state === 'quoted') {
      if (ch === '"') { if (s[i+1] === '"') { cell += '"'; i++; } else state = 'closed'; }
      else cell += ch;
      continue;
    }
    if (ch === delimiter) { finishCell(); continue; }
    if (ch === '\r' || ch === '\n') { if (ch === '\r' && s[i+1] === '\n') i++; finishRow(); continue; }
    if (state === 'closed') { if (ch === ' ' || ch === '\t') continue; throw new Error('CSV: лишний символ после закрывающей кавычки.'); }
    if (ch === '"') { if (state !== 'start') throw new Error('CSV: кавычка внутри неэкранированного поля.'); state = 'quoted'; }
    else { cell += ch; state = 'plain'; }
  }
  if (state === 'quoted') throw new Error('CSV: незакрытая кавычка.');
  if (cell !== '' || record.length || state === 'closed') finishRow();
  if (!records.length) return [];
  const headers = records.shift().map(x=>x.trim());
  if (headers.some(x=>!x)) throw new Error('CSV: пустое название столбца.');
  const headerKeys = headers.map(x=>x.toLocaleLowerCase('ru'));
  if (new Set(headerKeys).size !== headers.length) throw new Error('CSV: повторяющиеся названия столбцов.');
  return records.map((values, i) => {
    if (values.length !== headers.length) throw new Error(`CSV: строка ${i+2}, ожидалось ${headers.length} столбцов, получено ${values.length}.`);
    return Object.fromEntries(headers.map((h,j)=>[h,values[j]]));
  });
}
/** Excel-safe CSV; neutralizes formula injection only for textual cells. */
export function toCSV(rows) {
  if (!Array.isArray(rows) || !rows.length) return '';
  const headers = [...new Set(rows.flatMap(row=>Object.keys(row)))];
  const encode = value => {
    let v = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '');
    if (typeof value !== 'number' && /^[\s]*[=+\-@]/.test(v)) v = "'" + v;
    return /[";\r\n]/.test(v) ? '"' + v.replace(/"/g,'""') + '"' : v;
  };
  return '\uFEFF' + [headers.map(encode).join(';'), ...rows.map(row=>headers.map(h=>encode(row[h])).join(';'))].join('\r\n');
}

function similarity(a,b) {
  const ka = key(a), kb = key(b);
  if (!ka || !kb) return 0;
  if (ka === kb) return 1;
  const words = s => new Set(s.split(' ')); const wa=words(ka), wb=words(kb);
  const common = [...wa].filter(x=>wb.has(x)).length;
  const jaccard = common / new Set([...wa,...wb]).size;
  const grams = s => new Set(Array.from({length:Math.max(0,s.length-1)},(_,i)=>s.slice(i,i+2)));
  const ga=grams(ka), gb=grams(kb); const shared=[...ga].filter(x=>gb.has(x)).length;
  const dice = ga.size+gb.size ? 2*shared/(ga.size+gb.size) : 0;
  return round(0.65*jaccard+0.35*dice,4);
}
function variantConflict(a,b) {
  const tokens = s => key(s).split(' ');
  const numbers = s => [...key(s).matchAll(/\d+(?:[.,]\d+)?/g)].map(m=>m[0]).sort().join('|');
  const na=numbers(a), nb=numbers(b);
  if (na && nb && na !== nb) return true;
  const colors = ['черн','бел','красн','син','зелен','розов','сер','беж','коричнев','желт','прозрач','натуральн'];
  const colorsOf = s => new Set(tokens(s).map(x=>colors.find(c=>x.startsWith(c))).filter(Boolean));
  const ca=colorsOf(a), cb=colorsOf(b);
  if (ca.size && cb.size && ![...ca].some(x=>cb.has(x))) return true;
  const sizesOf = s => tokens(s).filter(x=>/^(?:xxxs|xxs|xs|s|m|l|xl|xxl|xxxl|[2-6]xl)$/.test(x)).sort().join('|');
  const sa=sizesOf(a), sb=sizesOf(b);
  return Boolean(sa && sb && sa !== sb);
}
const supportedCurrencies = new Set(['RUB','USD','EUR','CNY','KZT','BYN','GBP','CHF','JPY','KRW','TRY','AED','INR','UZS','KGS','AMD','GEL','AZN','TJS','TMT','CAD','AUD','PLN','SEK','NOK','DKK','CZK','HUF','BRL','KWD','BHD']);
function leadDays(value) {
  const simple = parseNumber(value);
  if (simple !== null) return simple >= 0 ? simple : null;
  const m = text(value).match(/^(\d+(?:[.,]\d+)?)\s*[-–—]\s*(\d+(?:[.,]\d+)?)$/);
  if (!m) return null;
  const min=parseNumber(m[1]), max=parseNumber(m[2]);
  return min <= max ? max : null;
}
function normalizeOffer(raw) {
  const issues=[];
  const price=parseNumber(raw.price), unit=normalizeUnit(raw.price_unit);
  const currency=text(raw.currency).toUpperCase();
  const minOrder=parseNumber(raw.min_order), orderStep=parseNumber(raw.order_step), shipping=parseNumber(raw.shipping), lead=leadDays(raw.lead_days);
  if (price===null || price<0) issues.push('Цена: число от 0 до 10¹⁵, не более 12 десятичных знаков.');
  if (!unit) issues.push('Неизвестная единица цены.');
  if (!supportedCurrencies.has(currency)) issues.push('Укажите поддерживаемую валюту (RUB, USD, EUR и др.; см. README).');
  if (minOrder===null || minOrder<=0) issues.push('Минимальный заказ должен быть указан и больше нуля.');
  if (orderStep===null || orderStep<=0) issues.push('Кратность заказа должна быть указана и больше нуля.');
  if (unit && (unit.pack || unit.dimension==='count')) {
    if (minOrder!==null && !Number.isInteger(minOrder)) issues.push('Минимум для штук и упаковок должен быть целым.');
    if (orderStep!==null && !Number.isInteger(orderStep)) issues.push('Шаг для штук и упаковок должен быть целым.');
  }
  if (shipping===null || shipping<0) issues.push('Укажите стоимость доставки, включая явный 0 для бесплатной.');
  if (lead===null) issues.push('Укажите срок календарными днями или диапазоном от–до от подтверждения заказа.');
  if (!text(raw.supplier)) issues.push('Не указан поставщик.');
  if (!text(raw.name) && !text(raw.sku)) issues.push('Не указаны ни название товара, ни артикул.');
  let unitsPerOrderUnit=unit?.factor??null, baseUnit=unit?.canonical??null, dimension=unit?.dimension??null;
  if (unit?.pack) {
    const size=parseNumber(raw.pack_size), content=normalizeUnit(raw.content_unit);
    if (size===null || size<=0) issues.push('Для упаковки укажите положительный pack_size.');
    if (!content || content.pack) issues.push('Для упаковки укажите физическую content_unit (шт, г, кг, мл, л, м и т. п.).');
    if (content?.dimension==='count' && size!==null && !Number.isInteger(size)) issues.push('Содержимое упаковки в штуках должно быть целым.');
    if (size!==null && size>0 && content && !content.pack) {
      unitsPerOrderUnit=number(mul(decimal(raw.pack_size),decimal(content.factor))); baseUnit=content.canonical; dimension=content.dimension;
    }
  } else if (unit && (!blank(raw.pack_size) || !blank(raw.content_unit))) {
    issues.push('pack_size/content_unit допустимы только для упаковки; для физической единицы оставьте их пустыми.');
  }
  const mode=key(raw.tax_mode);
  let grossPrice=price;
  if (['excluded','без ндс','не включен'].includes(mode)) {
    const rate=parseNumber(raw.vat_rate);
    if (rate===null || rate<0 || rate>100) issues.push('Для цены без НДС укажите явную ставку vat_rate от 0 до 100.');
    else if (price!==null) grossPrice=number(mul(decimal(raw.price),add(rat(1n),div(decimal(raw.vat_rate),rat(100n)))));
  } else if (!['included','с ндс','включен'].includes(mode)) {
    issues.push('Неизвестен налоговый режим: укажите included или excluded с явной ставкой.');
  }
  if (unitsPerOrderUnit!==null && (!Number.isFinite(unitsPerOrderUnit) || unitsPerOrderUnit<=0 || unitsPerOrderUnit>1e15)) issues.push('Размер упаковки выходит за допустимый диапазон.');
  const unitPrice=unitsPerOrderUnit && grossPrice!==null ? grossPrice/unitsPerOrderUnit : null;
  if (unitPrice!==null && !Number.isFinite(unitPrice)) issues.push('Цена за единицу выходит за допустимый диапазон.');
  return {issues,normalized:{baseUnit,dimension,unitsPerOrderUnit,unitPrice,currency,leadDays:lead,leadLabel:text(raw.lead_days),minOrder,orderStep,shipping,grossPrice,priceUnit:text(raw.price_unit)}};
}
function normalizeCatalog(catalog,quantities,errors) {
  const ids=new Map(), skus=new Map();
  for (const p of catalog) { const id=text(p.id),sku=text(p.sku); if(id)ids.set(id,(ids.get(id)||0)+1); if(sku)skus.set(sku,(skus.get(sku)||0)+1); }
  return catalog.map((raw,index)=>{
    const issues=[],id=text(raw.id),sku=text(raw.sku),name=text(raw.name),unit=normalizeUnit(raw.base_unit);
    if(!id) issues.push('Отсутствует id товара.'); else if(ids.get(id)>1) issues.push(`Повторяется id товара: ${id}.`);
    if(!sku) issues.push('Отсутствует артикул каталога.');
    if(!name) issues.push('Отсутствует название товара.');
    if(!unit || unit.pack) issues.push('Базовая единица каталога должна быть физической.');
    const quantityInput=has(quantities,id)?quantities[id]:raw.required_qty, quantity=parseNumber(quantityInput);
    if(quantity===null || quantity<=0) issues.push('Потребность должна быть числом больше нуля.');
    if(unit?.dimension==='count' && quantity!==null && !Number.isInteger(quantity)) issues.push('Потребность в штуках должна быть целой.');
    if(sku && skus.get(sku)>1) errors.push(`Каталог: артикул ${sku} неоднозначен, автоматическое сопоставление по нему запрещено.`);
    for(const issue of issues) errors.push(`Каталог, строка ${index+2}: ${issue}`);
    const aliases=(Array.isArray(raw.aliases)?raw.aliases:text(raw.aliases).split('|')).map(text).filter(Boolean);
    return {...raw,id,sku,name,aliases,baseUnit:unit?.canonical??null,dimension:unit?.dimension??null,quantityInput,requiredQty:quantity!==null && unit && !unit.pack?number(mul(decimal(quantityInput),decimal(unit.factor))):null,issues,valid:issues.length===0};
  });
}
function candidateIndex(catalog) {
  const sku=new Map(),name=new Map();
  const put=(map,k,p)=>{if(!k)return;if(!map.has(k))map.set(k,[]);map.get(k).push(p);};
  for(const p of catalog) {
    if(!p.id || !p.name)continue;
    put(sku,p.sku,p);
    for(const alias of new Set([key(p.name),...p.aliases.map(key)]))put(name,alias,p);
  }
  return {catalog,sku,name};
}
function candidatesFor(raw,index) {
  const sku=text(raw.sku),name=key(raw.name),skuMatches=index.sku.get(sku)||[],nameMatches=index.name.get(name)||[];
  // A direct code or exact name already supplies useful candidates. Fuzzy matching is only
  // needed when both indexes miss. Exact names remain manual review in chooseMatch.
  const direct=[...new Set([...skuMatches,...nameMatches])];
  const pool=direct.length?direct:index.catalog.filter(p=>p.id && p.name);
  return pool.map(p=>{
    const skuExact=Boolean(sku && sku===p.sku),nameExact=Boolean(name && [p.name,...p.aliases].some(n=>key(n)===name));
    const nameScore=nameExact?1:skuExact?1:Math.max(similarity(name,p.name),...p.aliases.map(a=>similarity(name,a)));
    return {id:p.id,name:p.name,score:skuExact?1:nameScore,skuExact,nameExact,product:p};
  }).filter(c=>c.skuExact||c.nameExact||c.score>=.12).sort((a,b)=>Number(b.skuExact)-Number(a.skuExact)||b.score-a.score||a.id.localeCompare(b.id)).slice(0,5);
}
function chooseMatch(raw,candidates,decision,products,signaturePrefix) {
  if(decision!==undefined && decision!==null) {
    if(!decision || typeof decision!=='object' || Array.isArray(decision) || !text(decision.reason) || decision.fingerprint!==fingerprintWithPrefix(raw,signaturePrefix))
      return {product:null,reason:'Ручное решение не подтверждено: требуется основание и актуальная версия исходных данных.'};
    if(decision.productId==='__exclude__') return {excluded:true,product:null,reason:'Исключено вручную: '+text(decision.reason)};
    const matches=products.filter(p=>p.id===text(decision.productId));
    if(matches.length===1) return {product:matches[0],reason:'Ручная проверка: '+text(decision.reason)};
    return {product:null,reason:'Ручное решение ссылается на отсутствующий или неоднозначный id каталога.'};
  }
  const skuMatches=candidates.filter(c=>c.skuExact),nameMatches=candidates.filter(c=>c.nameExact);
  if(text(raw.sku_scope)!=='catalog') return {product:null,reason:'Код поставщика не подтверждён как общий артикул каталога. Требуется ручная проверка модели и варианта.'};
  if(skuMatches.length>1) return {product:null,reason:'Артикул относится к нескольким товарам каталога.'};
  if(skuMatches.length===1) {
    const p=skuMatches[0].product;
    if(nameMatches.some(c=>c.id!==p.id) || (text(raw.name) && (variantConflict(raw.name,p.name)||Math.max(similarity(raw.name,p.name),...p.aliases.map(a=>similarity(raw.name,a)))<.3)))
      return {product:null,reason:'Общий артикул совпал, но название или вариант противоречит каталогу.'};
    return {product:p,reason:'Точный общий артикул каталога; область кода явно подтверждена.'};
  }
  return {product:null,reason:candidates.length?'Название — только кандидат. Проверьте модель, вариант и взаимозаменяемость.':'Совпадение не найдено: выберите товар или исключите строку.'};
}
function calculate(raw,normalized,product) {
  const n=normalized,unit=normalizeUnit(raw.price_unit),base=normalizeUnit(product.base_unit);
  const requested=mul(decimal(product.quantityInput),decimal(base.factor));
  const units=unit.pack?mul(decimal(raw.pack_size),decimal(normalizeUnit(raw.content_unit).factor)):decimal(unit.factor);
  const step=decimal(raw.order_step),minimum=decimal(raw.min_order),needed=div(requested,units);
  const wanted=cmp(minimum,needed)>0?minimum:needed,multiple=div(wanted,step);
  const count=multiple.n/multiple.d+(multiple.n%multiple.d?1n:0n),order=mul(rat(count),step),delivered=mul(order,units);
  let gross=decimal(raw.price);
  if(['excluded','без ндс','не включен'].includes(key(raw.tax_mode))) gross=mul(gross,add(rat(1n),div(decimal(raw.vat_rate),rat(100n))));
  const exactTotal=add(mul(order,gross),decimal(raw.shipping));
  const decimals=['JPY','KRW'].includes(n.currency)?0:['KWD','BHD'].includes(n.currency)?3:2;
  const total=rounded(exactTotal,decimals);
  if(!total || [requested,order,delivered].some(x=>cmp(x,rat(1000000000000000n))>0)) return null;
  const result={requestedQty:number(requested),orderQty:number(order),deliveredQty:number(delivered),excessQty:number(sub(delivered,requested)),total:total.value,currency:n.currency,effectiveUnitPrice:total.value/number(requested),deliveredUnitPrice:total.value/number(delivered),totalMinor:total.minor,currencyDecimals:decimals};
  return Object.values(result).some(v=>typeof v==='number'&&!Number.isFinite(v))?null:result;
}
export function analyze({catalog=[],offers=[],decisions={},quantities={}}={}) {
  const errors=[];
  if(!Array.isArray(catalog)||!Array.isArray(offers)) throw new Error('catalog и offers должны быть массивами строк.');
  if(!catalog.every(p=>p && typeof p==='object'&&!Array.isArray(p))||!offers.every(p=>p && typeof p==='object'&&!Array.isArray(p))) throw new Error('Каждая строка должна быть объектом.');
  if(!decisions || typeof decisions!=='object'||Array.isArray(decisions)||!quantities||typeof quantities!=='object'||Array.isArray(quantities)) throw new Error('decisions и quantities должны быть объектами.');
  const products=normalizeCatalog(catalog,quantities,errors);
  const signaturePrefix=fingerprintPrefix(catalog), matchingIndex=candidateIndex(products);
  if(!products.length) errors.push('Каталог пуст. Сначала импортируйте каталог товаров.');
  const ids=offers.map((r,i)=>text(r.id)||`missing-id-${i+2}`),counts=new Map();
  for(const id of ids) counts.set(id,(counts.get(id)||0)+1);
  const duplicateIds=new Set([...counts].filter(([,n])=>n>1).map(([id])=>id));
  for(const id of duplicateIds) errors.push(`Повторяется id предложения: ${id}. Решения не применяются к таким строкам.`);
  const rows=offers.map((raw,index)=>{
    const id=ids[index],{issues,normalized}=normalizeOffer(raw),candidates=candidatesFor(raw,matchingIndex);
    const match=chooseMatch(raw,candidates,duplicateIds.has(id)?undefined:(has(decisions,id)?decisions[id]:undefined),products,signaturePrefix);
    const row={id,source:{...raw},supplier:text(raw.supplier),name:text(raw.name),status:'review',productId:match.product?.id??null,matchReason:match.reason,candidates:candidates.map(({id,name,score})=>({id,name,score})),issues,normalized,calculation:null};
    if(!text(raw.id)) issues.push('Отсутствует устойчивый id предложения. Импортируйте строку с id или идентификатором источника.');
    if(duplicateIds.has(id)) issues.push('Повторяющийся id предложения: задайте уникальные id и импортируйте снова.');
    if(match.excluded && !duplicateIds.has(id) && text(raw.id)) {row.status='excluded';return row;}
    if(match.product) {
      if(match.product.issues.length) issues.push(...match.product.issues.map(x=>'Каталог: '+x));
      if(normalized.dimension && match.product.dimension && normalized.dimension!==match.product.dimension) issues.push(`Несовместимые единицы: предложение ${normalized.baseUnit}, каталог ${match.product.baseUnit}.`);
      if(!issues.length) {row.calculation=calculate(raw,normalized,match.product);if(!row.calculation)issues.push('Расчёт выходит за допустимый диапазон; сумма в минимальных единицах валюты должна быть безопасным целым.');}
      row.status=issues.length?'invalid':'matched';
    } else row.status=issues.length?'invalid':'review';
    return row;
  });
  const comparisons=products.map(p=>{
    const eligible=rows.filter(r=>r.productId===p.id && r.status==='matched' && r.calculation),bestByCurrency={},fastestByCurrency={};
    for(const currency of new Set(eligible.map(r=>r.normalized.currency))) {
      const group=eligible.filter(r=>r.normalized.currency===currency);
      const byTotal=(a,b)=>{const x=BigInt(a.calculation.totalMinor),y=BigInt(b.calculation.totalMinor);return x<y?-1:x>y?1:0;};
      const sorted=group.slice().sort((a,b)=>byTotal(a,b)||a.normalized.leadDays-b.normalized.leadDays||a.id.localeCompare(b.id));
      const fastest=group.slice().sort((a,b)=>a.normalized.leadDays-b.normalized.leadDays||byTotal(a,b)||a.id.localeCompare(b.id));
      bestByCurrency[currency]=sorted[0].id;fastestByCurrency[currency]=fastest[0].id;
    }
    return {productId:p.id,name:p.name,baseUnit:p.baseUnit,requestedQty:p.requiredQty,offers:eligible,bestByCurrency,fastestByCurrency};
  });
  const summary={total:rows.length,matched:rows.filter(r=>r.status==='matched').length,review:rows.filter(r=>r.status==='review').length,invalid:rows.filter(r=>r.status==='invalid').length,excluded:rows.filter(r=>r.status==='excluded').length,comparable:rows.filter(r=>r.calculation!==null).length};
  return {catalog:products,rows,comparisons,summary,errors:[...new Set(errors)]};
}
// All prices, lead times, companies and tax rates are synthetic teaching fixtures.
export const SAMPLE_CATALOG=[
  {id:'kraft-200',sku:'KP-2030',name:'Пакет крафтовый 200×300 мм',base_unit:'шт',required_qty:250,aliases:'Крафт-пакет 200×300 мм'},
  {id:'kraft-250',sku:'KP-2535',name:'Пакет крафтовый 250×350 мм',base_unit:'шт',required_qty:100,aliases:''},
  {id:'filler',sku:'PF-01',name:'Бумажный наполнитель натуральный',base_unit:'г',required_qty:12500,aliases:''},
  {id:'clip',sku:'CL-01',name:'Зажим упаковочный 10 мм',base_unit:'шт',required_qty:4,aliases:''},
  {id:'round',sku:'TEST-001',name:'Контроль округления',base_unit:'шт',required_qty:1,aliases:''},
  {id:'ribbon',sku:'RB-10',name:'Лента хлопковая 10 мм',base_unit:'м',required_qty:60,aliases:''},
];
const demoOffer=(id,supplier,sku,name,price,price_unit,extra={})=>({id,supplier:'ДЕМО · '+supplier,sku,sku_scope:'catalog',name,price,price_unit,pack_size:'',content_unit:'',currency:'RUB',tax_mode:'included',vat_rate:'',min_order:1,order_step:1,lead_days:5,shipping:0,...extra});
export const SAMPLE_OFFERS=[
  demoOffer('A','Альфа','KP-2030','Пакет крафтовый 200×300 мм',850,'упак',{pack_size:100,content_unit:'шт',shipping:300,lead_days:'3–5'}),
  demoOffer('B','Бета','KP-2030','Пакет крафтовый 200×300 мм','9,50','шт',{tax_mode:'excluded',vat_rate:20,min_order:300,order_step:100,lead_days:2}),
  demoOffer('C','Гамма','KP-2030','Пакет крафтовый 200×300 мм',500,'упак',{pack_size:100,content_unit:'шт',min_order:10,lead_days:1}),
  demoOffer('D','Дельта','KP-2030','Пакет крафтовый 200×300 мм',9,'упак',{pack_size:100,content_unit:'шт',currency:'USD',shipping:2,lead_days:4}),
  demoOffer('E','Альфа','PF-01','Бумажный наполнитель натуральный','0,18','г',{min_order:1000,order_step:500,shipping:300,lead_days:4}),
  demoOffer('E2','Бета','PF-01','Бумажный наполнитель натуральный',220,'кг',{min_order:5,order_step:1,lead_days:2}),
  demoOffer('F','Альфа','CL-01','Зажим упаковочный 10 мм',10,'шт',{min_order:5,order_step:2,lead_days:1}),
  demoOffer('G','Альфа','TEST-001','Контроль округления','1,005','шт',{lead_days:1}),
  demoOffer('review-1','Гамма','','Пакет крафтовый',790,'упак',{sku_scope:'supplier',pack_size:100,content_unit:'шт',shipping:250}),
  demoOffer('review-2','Дельта','supplier-001','Пакет крафтовый 200×300 мм',8,'шт',{sku_scope:'supplier'}),
  demoOffer('invalid-unit','Дельта','RB-10','Лента хлопковая 10 мм',700,'кг'),
  demoOffer('invalid-moq','Гамма','CL-01','Зажим упаковочный 10 мм',9,'шт',{min_order:''}),
  demoOffer('invalid-price','Дельта','KP-2535','Пакет крафтовый 250×350 мм',-12,'шт'),
  demoOffer('invalid-tax','Альфа','KP-2535','Пакет крафтовый 250×350 мм',13,'шт',{tax_mode:'unknown'}),
];
