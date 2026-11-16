import ExcelJS from 'exceljs';
import {mkdir,writeFile} from 'node:fs/promises';
const dir=new URL('../examples/',import.meta.url);await mkdir(dir,{recursive:true});
const catalog=[
 {id:'fastener',sku:'001-100',name:'ДЕМО • Крепёж M6, оцинкованный',base_unit:'шт',required_qty:'250',aliases:'Крепёж M6|ДЕМО крепёж'},
 {id:'powder',sku:'P-01',name:'ДЕМО • Порошок технический, марка A',base_unit:'г',required_qty:'12500',aliases:''},
 {id:'step',sku:'STEP',name:'ДЕМО • Деталь с шагом заказа',base_unit:'шт',required_qty:'4',aliases:''},
 {id:'round',sku:'ROUND',name:'ДЕМО • Образец округления',base_unit:'шт',required_qty:'1',aliases:''},
 {id:'motor-a',sku:'M-A',name:'ДЕМО • Двигатель 220 В, модель A',base_unit:'шт',required_qty:'1',aliases:'Двигатель 220'},
 {id:'motor-b',sku:'M-B',name:'ДЕМО • Двигатель 220 В, модель B',base_unit:'шт',required_qty:'1',aliases:'Двигатель 220'}
];
const base={supplier:'ДЕМО',supplier_sku:'',sku:'001-100',sku_scope:'catalog',name:'ДЕМО • Крепёж M6, оцинкованный',price:'850',price_unit:'упак',pack_size:'100',content_unit:'шт',currency:'RUB',tax_mode:'included',vat_rate:'',min_order:'1',order_step:'1',lead_days:'3–5',shipping:'300'};
const offers=[
 {id:'A',...base,supplier:'ДЕМО • Альфа'},
 {id:'B',...base,supplier:'ДЕМО • Бета',price:'9,50',price_unit:'шт',pack_size:'',content_unit:'',tax_mode:'excluded',vat_rate:'20',min_order:'300',order_step:'100',lead_days:'2',shipping:'0'},
 {id:'C',...base,supplier:'ДЕМО • Гамма',price:'500',min_order:'10',lead_days:'1',shipping:'0'},
 {id:'D',...base,supplier:'ДЕМО • Дельта',price:'9',currency:'USD',lead_days:'4',shipping:'2'},
 {id:'E',...base,supplier:'ДЕМО • Масса',sku:'P-01',name:catalog[1].name,price:'0,18',price_unit:'г',pack_size:'',content_unit:'',min_order:'1000',order_step:'500',lead_days:'4'},
 {id:'E2',...base,supplier:'ДЕМО • Масса 2',sku:'P-01',name:catalog[1].name,price:'220',price_unit:'кг',pack_size:'',content_unit:'',min_order:'5',shipping:'0',lead_days:'5'},
 {id:'F',...base,supplier:'ДЕМО • Шаг',sku:'STEP',name:catalog[2].name,price:'10',price_unit:'шт',pack_size:'',content_unit:'',min_order:'5',order_step:'2',shipping:'0',lead_days:'1'},
 {id:'G',...base,supplier:'ДЕМО • Округление',sku:'ROUND',name:catalog[3].name,price:'1,005',price_unit:'шт',pack_size:'',content_unit:'',shipping:'0',lead_days:'1'},
 {id:'REVIEW',...base,supplier:'ДЕМО • Проверка',sku:'',sku_scope:'',name:'ДЕМО • Двигатель 220',price:'5000',price_unit:'шт',pack_size:'',content_unit:'',shipping:'0',lead_days:'4'},
 {id:'UNKNOWN',...base,supplier:'ДЕМО • Уточнить доставку',shipping:''}
];
const quote=value=>'"'+String(value??'').replace(/"/g,'""')+'"';
const csv=rows=>'\uFEFF'+[Object.keys(rows[0]),...rows.map(r=>Object.keys(rows[0]).map(h=>r[h]??''))].map(r=>r.map(quote).join(';')).join('\r\n');
await writeFile(new URL('catalog.csv',dir),csv(catalog));await writeFile(new URL('offers.csv',dir),csv(offers));
const workbook=new ExcelJS.Workbook();
function addSheet(name,rows){const ws=workbook.addWorksheet(name);ws.addRow(Object.keys(rows[0]));rows.forEach(row=>ws.addRow(Object.keys(rows[0]).map(h=>String(row[h]??''))));ws.columns.forEach(c=>c.width=22);}
addSheet('Предложения — ДЕМО',offers);addSheet('Дополнительный пример',[{...offers[0],id:'A-SHEET2',supplier:'ДЕМО • Второй лист'}]);
await workbook.xlsx.writeFile(new URL('offers.xlsx',dir).pathname);
const catbook=new ExcelJS.Workbook(),ws=catbook.addWorksheet('Каталог — ДЕМО');ws.addRow(Object.keys(catalog[0]));catalog.forEach(row=>ws.addRow(Object.values(row)));await catbook.xlsx.writeFile(new URL('catalog.xlsx',dir).pathname);
const bad=new ExcelJS.Workbook(),f=bad.addWorksheet('Формула — отклонение');f.addRow(['id','supplier','name','price','price_unit']);f.addRow(['FORMULA','ДЕМО','ДЕМО • формула',{formula:'1+1',result:2},'шт']);await bad.xlsx.writeFile(new URL('rejected-formula.xlsx',dir).pathname);
await writeFile(new URL('rejected-damaged.xlsx',dir),'This is deliberately not an XLSX file.');
await writeFile(new URL('rejected-duplicate.csv',dir),csv([{...offers[0]},{...offers[1],id:'A'}]));
console.log('Синтетические CSV и XLSX сохранены в examples/. Все цены и сроки вымышлены.');
