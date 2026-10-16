import { execFileSync } from 'node:child_process';
import process from 'node:process';

const projectRoot = process.cwd();
const localProcess = /(?:cds(?:-serve|\s+(?:watch|serve))|vite|@sap\/cds-dk\/bin\/watch\/watched)/;

type ProcessInfo = { pid: number; command: string };

function processes(): ProcessInfo[] {
  try {
    const output = execFileSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' });
    return output.split('\n').flatMap((line) => {
      const match = line.trim().match(/^(\d+)\s+(.+)$/);
      if (!match) return [];
      return [{ pid: Number(match[1]), command: match[2] }];
    });
  } catch {
    return [];
  }
}

const candidates = processes().filter(({ pid, command }) =>
  pid !== process.pid && command.includes(projectRoot) && localProcess.test(command),
);

if (candidates.length === 0) {
  console.log('No stale MK7 CAP/Vite processes found.');
  process.exit(0);
}

for (const candidate of candidates) {
  try {
    process.kill(candidate.pid, 'SIGTERM');
    console.log(`Stopped stale local process ${candidate.pid}.`);
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
    if (code !== 'ESRCH') console.warn(`Could not stop process ${candidate.pid}.`);
  }
}
