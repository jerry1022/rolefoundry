import { spawnSync } from "node:child_process";
const image = process.argv[2] || "rolefoundry-worker:ci";
if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/.test(image)) throw Error("Invalid image name.");
const source = `
import {createHash} from 'node:crypto';
import {fromBuffer} from 'yauzl';
import {ZipAccountArchive} from '/app/src/modules/account-data/adapters/archive.ts';
const owner=crypto.randomUUID(),doc=crypto.randomUUID(),input=Buffer.from('Controlled bilingual source: 繁體中文.');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const path='files/'+doc+'/source.pdf';
const payload={schemaVersion:1,exportedAt:new Date().toISOString(),account:{id:owner,email:'fixture@test.invalid',createdAt:new Date().toISOString(),lastSignInAt:null,role:'member'},data:{preferences:[{name:'Synthetic portability fixture'}]},files:[{key:owner+'/'+doc+'/source/'+crypto.randomUUID(),path,sha256:hash(input),byteCount:input.length}]};
const builder=new ZipAccountArchive(),output=await builder.build(payload,async()=>input,new AbortController().signal);
if(!builder.verify(output.bytes,output.sha256))throw Error('Archive digest mismatch.');
const files=await new Promise((resolve,reject)=>fromBuffer(Buffer.from(output.bytes),{lazyEntries:true},(error,zip)=>{
 if(error||!zip)return reject(Error('Invalid ZIP.'));const result={};zip.on('error',reject);zip.on('end',()=>resolve(result));
 zip.on('entry',entry=>zip.openReadStream(entry,(error,stream)=>{if(error||!stream)return reject(Error('Invalid entry.'));const chunks=[];stream.on('error',reject);stream.on('data',chunk=>chunks.push(chunk));stream.on('end',()=>{result[entry.fileName]=Buffer.concat(chunks);zip.readEntry();});}));zip.readEntry();
}));
const manifest=JSON.parse(files['account.json'].toString());
if(!files[path].equals(input)||manifest.files[0].key||Object.keys(files).length!==2)throw Error('Archive lost content or exposed a private location.');
console.log(JSON.stringify({ok:true}));
`;
const result = spawnSync(
  "docker",
  [
    "run",
    "--rm",
    "-i",
    "--network",
    "none",
    "--read-only",
    "--memory",
    "256m",
    "--cpus",
    "1",
    "--pids-limit",
    "32",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "-e",
    "TSX_DISABLE_CACHE=1",
    "--entrypoint",
    "node",
    image,
    "--max-old-space-size=192",
    "--conditions=react-server",
    "--import",
    "tsx",
    "--input-type=module",
  ],
  { input: source, encoding: "utf8", timeout: 30000, maxBuffer: 1024 * 1024 },
);
if (result.status !== 0 || !result.stdout.includes('"ok":true'))
  throw Error("Linux account archive round-trip failed.");
console.log("Actual Linux account ZIP round-trip passed without network or writable filesystem.");
