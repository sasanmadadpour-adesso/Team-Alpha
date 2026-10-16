import path from 'node:path';
import XLSX from 'xlsx';

const source=path.resolve('data/source/new-data-source.xlsx');
const target=path.resolve('data/source/new-data-source-corrected.xlsx');
const building='B-CGN-01', oldMalo='50539603888', newMalo='50539603891';
// The source workbook contains one 34-character MeLo ID. Keep the source
// workbook immutable, but apply the documented data correction consistently
// to every sheet that carries that identifier.
const oldMelo='DE00733257078200000000000000880945';
const newMelo='DE0073325707820000000000000880945';
const workbook=XLSX.readFile(source,{cellDates:false});

function replace(sheetName:string,buildingHeader:string,maloHeader:string){
  const sheet=workbook.Sheets[sheetName]; if(!sheet) throw new Error(`Missing sheet ${sheetName}`);
  const rows=XLSX.utils.sheet_to_json<Record<string,unknown>>(sheet,{raw:true,defval:null});
  let changed=0;
  for(const row of rows) if(String(row[buildingHeader])===building&&String(row[maloHeader])===oldMalo){row[maloHeader]=newMalo;changed++;}
  workbook.Sheets[sheetName]=XLSX.utils.json_to_sheet(rows,{header:Object.keys(rows[0]??{})});
  return changed;
}

const participantRows=replace('MK7 Participants','building_id','market_location_id_import_MaLo');
const consumptionRows=replace('Hourly Consumption','building_id','market_location_id_MaLo');
if(participantRows!==1||consumptionRows!==8760) throw new Error(`Unexpected correction scope: participants=${participantRows}, consumption=${consumptionRows}`);
let meloCells=0;
for(const sheetName of workbook.SheetNames){
  const sheet=workbook.Sheets[sheetName];
  for(const address of Object.keys(sheet)){
    if(address.startsWith('!')) continue;
    const cell=sheet[address];
    if(String(cell.v??'')===oldMelo){ cell.v=newMelo; meloCells++; }
  }
}
if(meloCells===0) throw new Error(`Expected to correct MeLo ${oldMelo}, but it was not found.`);
XLSX.writeFile(workbook,target,{compression:true});
console.log(JSON.stringify({source,target,building,oldMalo,newMalo,oldMelo,newMelo,participantRows,consumptionRows,meloCells,note:'Synthetic demo correction; not SAP-verified.'},null,2));
