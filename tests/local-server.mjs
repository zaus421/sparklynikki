// Synthetic local verification only. No production bindings or data.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {fixture} from './fixture.mjs';
let state=await fixture();
const root=new URL('../',import.meta.url);
http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://127.0.0.1:8788');
    if(url.pathname==='/__reset' && req.method==='POST') {state.db.close();state=await fixture();res.end('reset');return;}
    if(url.pathname.startsWith('/api/')) {
      let body='';for await(const chunk of req) body+=chunk;
      const result=await state.call(url.pathname+url.search,req.method,body?JSON.parse(body):undefined);
      res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));return;
    }
    if(url.pathname==='/admin/config.js'){res.setHeader('Content-Type','text/javascript');res.end('window.SPARKLY_ADMIN_CONFIG={apiBase:location.origin};');return;}
    const path=url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname;
    const target=new URL('.'+path,root);
    if(!fileURLToPath(target).startsWith(fileURLToPath(root))) {res.writeHead(403);res.end();return;}
    const contents=await readFile(target);
    res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.html')?'text/html':'application/octet-stream');
    res.end(contents);
  }catch(error){res.writeHead(500);res.end(error.message);}
}).listen(8788,'127.0.0.1',()=>console.log('Synthetic admin test server: http://127.0.0.1:8788/admin/'));
