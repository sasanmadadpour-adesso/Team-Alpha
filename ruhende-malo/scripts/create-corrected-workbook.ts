import path from 'node:path';
import XLSX from 'xlsx';

const source=path.resolve('data/source/new-data-source.xlsx');
const target=path.resolve('data/source/new-data-source-corrected.xlsx');
const building='B-CGN-01', oldMalo='50539603888', newMalo='50539603891';
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
XLSX.writeFile(workbook,target,{compression:true});
console.log(JSON.stringify({source,target,building,oldMalo,newMalo,participantRows,consumptionRows,note:'Synthetic demo correction; not SAP-verified.'},null,2));
