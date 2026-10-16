import cds from '@sap/cds';
import { readParticipantWorkbook, WORKBOOK_PATH } from './workbook.js';
import { registerConstructs } from '../srv/construct/registration.js';

/** Deploys the schema and registers every MK7 construct from the unchanged source workbook (baseline). */
const { rows, checksum } = await readParticipantWorkbook();
const dbFile = process.env.DB_FILE ?? 'db.sqlite';   // Docker: a file on the persistent volume
await cds.deploy('*').to(`sqlite:${dbFile}`);
const db = await cds.connect.to('db');
const result = await db.tx((tx) => registerConstructs(tx, rows, { file: WORKBOOK_PATH.split('/').at(-1)!, checksum, actor: 'IMPORT' }, { replaceAll: true }));
console.log(JSON.stringify({ ...result, conflicts: [...new Set(rows.filter((r) => r.maloConflict).map((r) => r.maloId))] }, null, 2));
