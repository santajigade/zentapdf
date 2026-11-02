/// <reference lib="webworker" />
// QPDF (WebAssembly) for encryption, decryption and lossless optimisation. Loaded only when needed.
import createModule from '@neslinesli93/qpdf-wasm';
import wasmUrl from '@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url';

type Msg =
  | { op: 'encrypt'; file: ArrayBuffer; user: string; owner: string; allowPrint: boolean; allowCopy: boolean; allowModify: boolean }
  | { op: 'decrypt'; file: ArrayBuffer; password: string }
  | { op: 'optimize'; file: ArrayBuffer };

const post = (m: any, t: Transferable[] = []) => (self as any).postMessage(m, t);

self.onmessage = async (ev: MessageEvent<Msg>) => {
  const m = ev.data; let log = '';
  // qpdf prints errors (e.g. "invalid password") to the console; keep them out of the page console
  console.error = (...a: any[]) => { log += a.join(' ') + '\n'; };
  console.log = (...a: any[]) => { log += a.join(' ') + '\n'; };
  try {
    const q: any = await (createModule as any)({ locateFile: () => wasmUrl, noInitialRun: true, print: (t: string) => (log += t + '\n'), printErr: (t: string) => (log += t + '\n') });
    q.FS.writeFile('/in.pdf', new Uint8Array(m.file));
    let args: string[];
    if (m.op === 'encrypt') {
      args = ['--encrypt', m.user, m.owner || m.user + '-owner-' + Math.random().toString(36).slice(2), '256',
        `--print=${m.allowPrint ? 'full' : 'none'}`, `--modify=${m.allowModify ? 'all' : 'none'}`, `--extract=${m.allowCopy ? 'y' : 'n'}`,
        '--', '/in.pdf', '/out.pdf'];
    } else if (m.op === 'decrypt') {
      args = [`--password=${m.password}`, '--decrypt', '/in.pdf', '/out.pdf'];
    } else {
      args = ['--object-streams=generate', '--compress-streams=y', '--recompress-flate', '--compression-level=9', '--remove-unreferenced-resources=yes', '/in.pdf', '/out.pdf'];
    }
    const wrong = () => Object.assign(new Error('WRONG_PASSWORD'), { name: 'PasswordError' });
    // Can the file be opened without a password? (qpdf exits with 2 when it can't)
    const opensFreely = m.op === 'optimize' ? true : q.callMain(['--password=', '--decrypt', '/in.pdf', '/probe.pdf']) === 0;
    if (!opensFreely && (m.op === 'encrypt' || (m.op === 'decrypt' && !m.password))) throw wrong();
    const rc = q.callMain(args);
    if (rc !== 0 && rc !== 3) {
      if (!opensFreely) throw wrong();
      throw new Error('This file could not be processed. It may be damaged.');
    }
    const out = q.FS.readFile('/out.pdf') as Uint8Array;
    post({ type: 'result', files: [out] }, [out.buffer]);
  } catch (e: any) {
    post({ type: 'error', message: String(e?.message ?? e), name: e?.name });
  }
};
