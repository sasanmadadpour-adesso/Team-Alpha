import cds from '@sap/cds';
import { readParticipantWorkbook, WORKBOOK_PATH } from './workbook.js';
import { registerConstructs } from '../srv/construct/registration.js';
import { loadSapFixture } from '../srv/construct/sap-state.js';

/** Deploys the schema and registers every MK7 construct from the unchanged source workbook (baseline). */
const { rows, checksum } = await readParticipantWorkbook();
await cds.deploy('*').to('sqlite:db.sqlite');
const db = await cds.connect.to('db');
const sapFixture = await loadSapFixture();
const result = await db.tx((tx) => registerConstructs(tx, rows, { file: WORKBOOK_PATH.split('/').at(-1)!, checksum, actor: 'IMPORT' }, { replaceAll: true, sapFixture }));
console.log(JSON.stringify({ ...result, conflicts: [...new Set(rows.filter((r) => r.maloConflict).map((r) => r.maloId))] }, null, 2));
