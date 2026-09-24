import http from 'node:http';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const file=fileURLToPath(new URL('./index.html',import.meta.url));
const server=http.createServer((req,res)=>{
 if(!['/','/index.html'].includes(new URL(req.url,'http://127.0.0.1:4173').pathname)){res.writeHead(404);res.end('Not found');return}
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
 const stream=fs.createReadStream(file);stream.on('error',()=>res.destroy());stream.pipe(res);
});
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'Port 4173 is already in use. Open index.html directly instead.':e.message);process.exitCode=1});
server.listen(4173,'127.0.0.1',()=>console.log('Open http://127.0.0.1:4173/ — Ctrl+C to stop.'));
