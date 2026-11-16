/** Bounded, strict table import. Nothing is committed by this module. */
export const LIMITS = Object.freeze({bytes:5*1024*1024, rows:5000, columns:100, sheets:12, expanded:30*1024*1024, entries:1000});
export const FIELDS = Object.freeze({
  catalog:['id','sku','name','base_unit','required_qty','aliases'],
  offers:['id','supplier','supplier_sku','sku','sku_scope','name','price','price_unit','pack_size','content_unit','currency','tax_mode','vat_rate','min_order','order_step','lead_days','shipping']
});
export const FIELD_LABELS = Object.freeze({id:'ID строки',sku:'Общий артикул каталога',name:'Название / модель',base_unit:'Единица потребности',required_qty:'Требуемое количество',aliases:'Синонимы через |',supplier:'Поставщик',supplier_sku:'Артикул поставщика',sku_scope:'Общий код: catalog / неизвестно',price:'Цена за единицу продажи',price_unit:'Единица продажи',pack_size:'Содержимое упаковки',content_unit:'Единица содержимого',currency:'Валюта: RUB / USD / EUR',tax_mode:'Налог: included / excluded / unknown',vat_rate:'Ставка налога, %',min_order:'Минимум в единицах продажи',order_step:'Шаг в единицах продажи',lead_days:'Срок, календарные дни',shipping:'Доставка с налогами'});
const aliases = {
 id:['идентификатор','код строки','ид строки'],sku:['артикул','общий артикул','код каталога','артикул каталога'],name:['название','наименование','товар','наименование товара'],base_unit:['базовая единица','единица потребности','базовая ед'],required_qty:['потребность','требуемое количество','количество'],aliases:['синонимы','альтернативные названия'],supplier:['поставщик','компания'],supplier_sku:['артикул поставщика','код поставщика'],sku_scope:['область артикула','общий код','область кода'],price:['цена','стоимость'],price_unit:['единица цены','единица продажи','ед цены'],pack_size:['содержимое упаковки','размер упаковки','штук в упаковке'],content_unit:['единица содержимого','ед содержимого'],currency:['валюта'],tax_mode:['налоговый режим','режим ндс','ндс','налог'],vat_rate:['ставка ндс','ставка налога','ндс %'],min_order:['минимальный заказ','минимум','moq'],order_step:['шаг заказа','шаг','кратность'],lead_days:['срок','срок дней','срок поставки','срок в днях'],shipping:['доставка','стоимость доставки']
};
const key = value => String(value??'').trim().toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/[._]+/g,' ').replace(/\s+/g,' ');
const headerKey = value => String(value??'').trim().toLocaleLowerCase('ru');
const own = (o,k) => Object.prototype.hasOwnProperty.call(o,k);
function error(message){throw new Error(message);}
function checkHeaders(headers){
 if(!headers.length || headers.length>LIMITS.columns) error('Таблица должна содержать от 1 до 100 столбцов.');
 if(headers.some(h=>!h.trim())) error('Есть столбец с пустым заголовком.');
 if(headers.some(h=>h.length>200)) error('Заголовок длиннее 200 символов.');
 if(new Set(headers.map(headerKey)).size!==headers.length) error('Повторяющиеся заголовки столбцов.');
 if(headers.some(h=>['__proto__','constructor','prototype'].includes(h))) error('Недопустимый заголовок столбца.');
}
function makeSheet(name,records,rowNumbers){
 if(!records.length) error('Таблица пуста.');
 const headers=records[0].map(x=>String(x??'').trim());checkHeaders(headers);
 if(records.length-1>LIMITS.rows) error('Превышено 5000 строк данных.');
 const rows=records.slice(1).map((cells,index)=>{
  if(cells.length>headers.length) error(`Строка ${rowNumbers[index+1]}: больше ячеек, чем заголовков.`);
  return Object.fromEntries(headers.map((h,i)=>[h,cells[i]??'']));
 });
 if(!rows.length) error('Таблица содержит только заголовок.');
 return {name,headers,rows,rowNumbers:rowNumbers.slice(1)};
}
function csvSheet(text,name){
 const s=text.replace(/^\uFEFF/,'');
 if(!s.trim()) error('Таблица пуста.');
 let q=false;const counts={';':0,',':0,'\t':0};
 for(let i=0;i<s.length;i++){const c=s[i];if(c==='"'){if(q&&s[i+1]==='"')i++;else q=!q;}else if(!q&&/[\r\n]/.test(c))break;else if(!q&&own(counts,c))counts[c]++;}
 const delimiter=Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0];
 const records=[],numbers=[];let cells=[],cell='',state='start',line=1,startLine=1;
 const finishCell=()=>{if(cell.length>10000)error(`Строка ${startLine}: ячейка длиннее 10000 символов.`);cells.push(cell);cell='';state='start';if(cells.length>LIMITS.columns)error('Превышено 100 столбцов.');};
 const finishRow=()=>{finishCell();if(cells.some(x=>x.trim()!=='')){records.push(cells);numbers.push(startLine);if(records.length>LIMITS.rows+1)error('Превышено 5000 строк данных.');}cells=[];startLine=line+1;};
 for(let i=0;i<s.length;i++){
  const c=s[i];
  if(state==='quoted'){
   if(c==='"'){if(s[i+1]==='"'){cell+='"';i++;}else state='closed';}else{cell+=c;if(c==='\n')line++;else if(c==='\r'&&s[i+1]!=='\n')line++;}continue;
  }
  if(c===delimiter){finishCell();continue;}
  if(c==='\r'||c==='\n'){if(c==='\r'&&s[i+1]==='\n')i++;finishRow();line++;continue;}
  if(state==='closed'){if(c===' ')continue;error(`CSV: лишний символ после кавычки, строка ${line}.`);}
  if(c==='"'){if(state!=='start')error(`CSV: неэкранированная кавычка, строка ${line}.`);state='quoted';}
  else{cell+=c;state='plain';}
 }
 if(state==='quoted')error('CSV: незакрытая кавычка.');
 if(cell!==''||cells.length||state==='closed')finishRow();
 return makeSheet(name,records,numbers);
}
function zipPreflight(bytes){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),n=bytes.length;
 const u16=o=>view.getUint16(o,true),u32=o=>view.getUint32(o,true);
 let eocd=-1;for(let i=n-22;i>=Math.max(0,n-65557);i--){if(u32(i)===0x06054b50&&i+22+u16(i+20)===n){eocd=i;break;}}
 if(eocd<0)error('XLSX повреждён: не найдена ZIP-структура.');
 if(u16(eocd+4)||u16(eocd+6))error('Многотомные ZIP не поддерживаются.');
 const entries=u16(eocd+10),size=u32(eocd+12),offset=u32(eocd+16);
 if(entries>LIMITS.entries||entries===65535||offset===0xffffffff||size===0xffffffff)error('XLSX содержит слишком много ZIP-элементов или ZIP64.');
 if(offset+size>eocd)error('XLSX повреждён: некорректный ZIP-каталог.');
 let p=offset,total=0;
 for(let i=0;i<entries;i++){
  if(p+46>offset+size||u32(p)!==0x02014b50)error('XLSX повреждён: ZIP-заголовок.');
  const flags=u16(p+8),method=u16(p+10),expanded=u32(p+24),nl=u16(p+28),el=u16(p+30),cl=u16(p+32);
  if(flags&1)error('Зашифрованный XLSX не поддерживается.');
  if(![0,8].includes(method))error('Неподдерживаемое сжатие XLSX.');
  total+=expanded;if(total>LIMITS.expanded)error('Распакованный XLSX превышает 30 МБ.');
  p+=46+nl+el+cl;if(p>offset+size)error('XLSX повреждён: размер ZIP-каталога.');
 }
 if(p!==offset+size)error('XLSX повреждён: лишние ZIP-записи.');
}
async function excelLibrary(){if(globalThis.ExcelJS?.Workbook)return globalThis.ExcelJS;const pkg=await import('exceljs');return pkg.default??pkg;}
function cellValue(cell,sheet){
 const value=cell.value;
 if(value===null||value===undefined)return '';
 if(typeof value==='object'){
  if('formula' in value||'sharedFormula' in value)error(`Лист «${sheet}», ${cell.address}: формулы запрещены, включая сохранённый результат.`);
  if(value instanceof Date)error(`Лист «${sheet}», ${cell.address}: дата не является числом условий; замените явным текстом.`);
  if('error' in value)error(`Лист «${sheet}», ${cell.address}: ошибка Excel.`);
  if(Array.isArray(value.richText))return value.richText.map(x=>x.text??'').join('');
  if(typeof value.text==='string'&&'hyperlink' in value)return value.text;
  error(`Лист «${sheet}», ${cell.address}: неподдерживаемый тип ячейки.`);
 }
 if(typeof value==='number'){
  if(!Number.isFinite(value))error(`Лист «${sheet}», ${cell.address}: нечисловое значение.`);
  // Excel identifiers stored as text keep leading zeros; simple zero formats preserve visible codes too.
  if(/^0+$/.test(cell.numFmt??'')&&Number.isInteger(value)&&value>=0)return String(value).padStart(cell.numFmt.length,'0');
  return String(value);
 }
 if(typeof value==='boolean')return value?'true':'false';
 return String(value);
}
export async function readTable(input,{name='table.csv'}={}){
 const bytes=input instanceof Uint8Array?input:input instanceof ArrayBuffer?new Uint8Array(input):error('Ожидаются байты файла.');
 if(bytes.byteLength>LIMITS.bytes)error('Файл превышает 5 МБ.');if(!bytes.length)error('Файл пуст.');
 const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes);
 const sourceId=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 const ext=String(name).toLowerCase().split('.').pop();
 if(['csv','tsv'].includes(ext)){
  let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{error('CSV должен быть в UTF-8. Пересохраните файл как CSV UTF-8.');}
  return {sourceId,sheets:[csvSheet(text,'Таблица')]};
 }
 if(ext!=='xlsx')error('Поддерживаются CSV, TSV и XLSX. Старый XLS предварительно пересохраните.');
 zipPreflight(bytes);
 const Excel=await excelLibrary(),workbook=new Excel.Workbook();
 try{await workbook.xlsx.load(bytes);}catch(err){error(`Не удалось открыть XLSX: повреждённый или неподдерживаемый файл. ${String(err?.message??'').slice(0,120)}`);}
 if(!workbook.worksheets.length||workbook.worksheets.length>LIMITS.sheets)error('XLSX должен содержать от 1 до 12 листов.');
 let totalRows=0;const sheets=[];
 for(const sheet of workbook.worksheets){
  if(sheet.rowCount>LIMITS.rows+1||sheet.columnCount>LIMITS.columns)error(`Лист «${sheet.name}»: превышен предел 5000 строк или 100 столбцов.`);
  if(sheet.model.merges?.length)error(`Лист «${sheet.name}»: объединённые ячейки нужно разъединить перед импортом.`);
  const records=[],numbers=[];
  sheet.eachRow({includeEmpty:false},row=>{
   const cells=[];row.eachCell({includeEmpty:false},(cell,col)=>{cells[col-1]=cellValue(cell,sheet.name);});
   if(cells.some(x=>String(x??'').trim()!=='')){records.push(Array.from({length:cells.length},(_,i)=>cells[i]??''));numbers.push(row.number);}
  });
  if(!records.length)continue;
  totalRows+=records.length-1;if(totalRows>LIMITS.rows)error('Во всех листах вместе превышено 5000 строк данных.');
  sheets.push(makeSheet(sheet.name,records,numbers));
 }
 if(!sheets.length)error('В XLSX нет таблиц с данными.');
 return {sourceId,sheets};
}
export function autoMapping(headers,kind){
 const fields=FIELDS[kind];if(!fields)error('Неизвестный вид таблицы.');
 checkHeaders(headers);
 const out=Object.fromEntries(headers.map(h=>[h,fields.find(f=>[f,...(aliases[f]??[])].some(a=>key(a)===key(h)))??'']));
 const selected=Object.values(out).filter(Boolean);
 if(new Set(selected).size!==selected.length)error('Два заголовка означают одно поле после преобразования. Исправьте заголовки до импорта.');
 return out;
}
export function mapRows(sheet,mapping,{kind,sourceName='',sourceId=''}={}){
 const fields=FIELDS[kind];if(!fields)error('Неизвестный вид таблицы.');
 checkHeaders(sheet.headers);
 if(!sourceId||!/^[a-f0-9]{64}$/.test(sourceId))error('Не задан идентификатор исходного файла.');
 const selected=[];
 for(const [header,field] of Object.entries(mapping)){
  if(!sheet.headers.includes(header))error('Назначен отсутствующий столбец.');
  if(field&&!fields.includes(field))error(`Неизвестное поле ${field}.`);
  if(field)selected.push(field);
 }
 if(new Set(selected).size!==selected.length)error('Один атрибут назначен нескольким столбцам.');
 const required=kind==='catalog'?['name','base_unit','required_qty']:['supplier','name','price','price_unit'];
 for(const field of required)if(!selected.includes(field))error(`Назначьте столбец «${FIELD_LABELS[field]}».`);
 if(!Array.isArray(sheet.rows)||!sheet.rows.length||sheet.rows.length>LIMITS.rows)error('Нет строк для импорта или превышен лимит.');
 const rows=sheet.rows.map((original,index)=>{
  const row=Object.fromEntries(fields.map(f=>[f,'']));
  for(const header of sheet.headers){const field=mapping[header];if(field)row[field]=String(original[header]??'').trim();}
  if(!row.id)row.id=`src-${sourceId.slice(0,20)}-${encodeURIComponent(sheet.name)}-${sheet.rowNumbers[index]??index+2}`;
  row._source={file:sourceName,sheet:sheet.name,row:sheet.rowNumbers[index]??index+2,sourceId,original:structuredClone(original),mapping:structuredClone(mapping)};
  return row;
 });
 validateImport([],rows,kind);return rows;
}
export function validateImport(existing,incoming,kind){
 if(!FIELDS[kind])error('Неизвестный вид таблицы.');
 if(!Array.isArray(existing)||!Array.isArray(incoming)||!incoming.length)error('Нет строк для импорта.');
 if(existing.length+incoming.length>LIMITS.rows)error('Всего допустимо не более 5000 строк одного вида.');
 const existingSources=new Set(existing.map(x=>x?._source?.sourceId).filter(Boolean));
 for(const row of incoming)if(existingSources.has(row?._source?.sourceId))error('Этот исходный файл уже импортирован. Повторный импорт отклонён.');
 const ids=new Set();
 for(const row of [...existing,...incoming]){
  if(!row||typeof row!=='object'||Array.isArray(row)||!String(row.id??'').trim())error('Каждой строке нужен непустой ID.');
  if(String(row.id).length>200)error('ID длиннее 200 символов.');
  if(['__proto__','constructor','prototype'].includes(String(row.id)))error('Недопустимый ID.');
  if(ids.has(String(row.id)))error(`Дубликат или конфликт ID «${row.id}». Импорт целиком отклонён.`);
  ids.add(String(row.id));
 }
 if(kind==='catalog'){
  const skus=new Set();for(const row of [...existing,...incoming]){const sku=String(row.sku??'').trim();if(sku){if(skus.has(sku))error(`Дубликат общего артикула «${sku}» в каталоге.`);skus.add(sku);}}
 }
 return true;
}
