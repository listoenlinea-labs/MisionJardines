'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const backend=require('../src/services/comprobante-parser');
const browser=require('../../docs/assets/js/comprobante-parser');
const owner='MARIA DEL ROCIO BAHENA JUAREZ';
const ends=['4409','4884','2440'];
const mercado=`Comprobante de transferencia
mercado pago WALLET
Comprobante de transferencia
12/noviembre/2026 a las 12:59.
$ 350 MXN
Concepto: JARDINES 319
Origen y destino
Cesar Camacho
Mercado Pago Wallet
CLABE: ****6260
MARIA DEL ROCIO BAHENA JUAREZ
AZTECA
Número de tarjeta: ****4884
Comprobante
#188198047943`;
for(const [name,p] of [['servidor',backend],['navegador',browser]]){
 test(name+' identifica el comprobante de Mercado Pago presentado por el usuario',()=>{
  const fields=p.extract(mercado);
  assert.deepEqual(fields,{
   folio:'188198047943',claveRastreo:'',referencia:'',
   amount:'350.00',date:'2026-11-12',time:'12:59:00'
  });
  const result=p.verifyDestination(mercado,owner,ends);
  assert.equal(result.ok,true);
  assert.equal(result.matchedSuffix,'4884');
 });
 test(name+' funciona sin OCR del logo y no inventa emisor ni receptora',()=>{
  const noLogo=mercado.replace('mercado pago WALLET','WALLET');
  assert.equal(p.extract(noLogo).folio,'188198047943');
  assert.equal(p.verifyDestination(noLogo,owner,ends).ok,true);
  assert.equal(p.verifyDestination(mercado.replace('MARIA DEL ROCIO BAHENA JUAREZ','PERSONA AJENA'),owner,ends).ok,false);
  const reverse=mercado.replace('Cesar Camacho','MARIA DEL ROCIO BAHENA JUAREZ')
   .replace('MARIA DEL ROCIO BAHENA JUAREZ\nAZTECA','PERSONA AJENA\nAZTECA');
  assert.equal(p.verifyDestination(reverse,owner,ends).ok,false);
  assert.equal(p.extract(mercado.replace('$ 350 MXN','Sin importe')).amount,'');
 });
}
test('el parser del backend es idéntico al de navegador en Pagos y Casa Club',()=>{
 assert.equal(read('backend/src/services/comprobante-parser.js'),read('docs/assets/js/comprobante-parser.js'));
});
test('comprobante seleccionable antes de reserva, enviado SOLO tras obtener token y folio',()=>{
 const html=read('docs/casa-club.html');
 const proof=read('docs/assets/js/casa-club-publico-comprobante.js');
 const booking=read('docs/assets/js/casa-club.js');
 assert.match(html,/id="clubProofFile"[^>]*type="file"/);
 assert.match(proof,/else\{\s*\$\('clubProofIntro'\)\.hidden=true;\s*\$\('clubPublicProofFlow'\)\.hidden=false;/);
 assert.match(proof,/async function sendPrepared\(\)/);
 assert.match(proof,/await archivoPendiente/);
 assert.match(proof,/if\(enProceso\|\|!validadoOcr\|\|!acceso\)/);
 assert.match(booking,/showPayment\(result\.data\);[\s\S]*?await proof\.sendPrepared\(\)/);
});
test('reglamento sigue visible en pantalla principal del celular, sin duplicar formulario',()=>{
 const html=read('docs/casa-club.html'),booking=read('docs/assets/js/casa-club.js');
 const css=read('docs/assets/css/casa-club.css');
 assert.equal((html.match(/id="clubRegulationsAcceptance"/g)||[]).length,1);
 assert.equal((html.match(/id="clubForm"/g)||[]).length,1);
 assert.match(booking,/clubCalendarHint'\)\.insertAdjacentElement\('afterend',rulesCard\)/);
 assert.match(booking,/rulesAnchor\.parentNode\.insertBefore\(rulesCard,rulesAnchor\.nextSibling\)/);
 assert.match(booking,/mobileReservationDialog\.showModal\(\)/);
 assert.match(booking,/id="clubOpenRules"|\$\('clubOpenRules'\)/);
 assert.match(css,/#tab-reservar #clubRegulationsAcceptance\{display:grid/);
});
test('tres modos OCR y código compartido en los tres tipos de pago',()=>{
 const pagos=read('docs/assets/js/pagos.js');
 const proof=read('docs/assets/js/casa-club-publico-comprobante.js');
 const worker=read('backend/src/services/comprobante-ocr.worker.js');
 const controller=read('backend/src/controllers/pagos.controller.js');
 for(const code of [pagos,proof]){
  assert.match(code,/SPARSE_TEXT/);
  assert.match(code,/SINGLE_BLOCK/);
  assert.match(code,/createWorker\('eng'/);
 }
 assert.match(worker,/cuentaOficial\.obtener\(\)/);
 assert.match(controller,/\['MANTENIMIENTO', 'EXTRAORDINARIO', 'CASA_CLUB'\]/);
 assert.match(controller,/comprobarDestino\(/);
});
test('prueba de integración local: la foto se prepara sin servidor y se envía una vez al guardar',async()=>{
 const script=read('docs/assets/js/casa-club-publico-comprobante.js');
 const elems=new Map();
 const $=id=>{
  if(!elems.has(id))elems.set(id,{hidden:id==='clubPublicProofFlow',
   value:'',files:[],disabled:false,className:'',textContent:'',style:{},
   classList:{toggle(){}},handlers:{},addEventListener(event,fn){this.handlers[event]=fn},
   removeAttribute(){},scrollIntoView(){}});
  return elems.get(id);
 };
 class FileReader{
  readAsDataURL(){this.result='data:image/png;base64,aW1hZ2Vu';this.onload?.();}
 }
 class Image{
  set src(_){this.width=1200;this.height=1800;Promise.resolve().then(()=>this.onload?.());}
 }
 const document={getElementById:$,createElement:()=>({width:0,height:0,
  getContext:()=>({drawImage(){},getImageData:()=>({data:new Uint8ClampedArray(4)}),putImageData(){}}),
  toDataURL:()=>('data:image/jpeg;base64,aW1hZ2Vu')})};
 let hash='',uploads=0,payload=null;
 const payment=mercado.replace('$ 350 MXN','$ 2,000 MXN');
 const Tesseract={PSM:{AUTO:3,SPARSE_TEXT:11,SINGLE_BLOCK:6},
  createWorker:async()=>({setParameters:async()=>{},recognize:async()=>({data:{text:payment}}),terminate:async()=>{}})};
 const window={MJComprobante:browser,MJClubCuenta:{render(){}},MJ_API_URL:'https://test.invalid/api',Tesseract};
 const fetch=async(url,opts)=>{
  const body=JSON.parse(opts.body);
  if(url.endsWith('/estado'))return{ok:true,json:async()=>({ok:true,data:{
   total:2000,pagado:false,estatusReserva:'PENDIENTE',destinatario:owner,
   terminacionesCuenta:ends,datosTransferencia:{},
   comprobante:uploads?{estado:'PENDIENTE_VALIDACION'}:null}})};
  uploads++;payload=body;return{ok:true,json:async()=>({ok:true,data:{id:1}})};
 };
 const location={get hash(){return hash;}};
 const history={replaceState(_a,_b,next){hash=next;}};
 vm.runInNewContext(script,{window,document,location,history,fetch,Tesseract,Image,FileReader,
  setInterval:()=>1,clearInterval:()=>{},Uint8ClampedArray,console:{warn(){},error(){}}},{timeout:1200});
 window.MJClubPublicProof.setOfficialAccount({titular:owner,destinosUltimos4:ends});
 window.MJClubPublicProof.setExpectedAmount(2000);
 assert.equal($('clubPublicProofFlow').hidden,false);
 const file={name:'mercado.png',type:'image/png'};$('clubProofFile').files=[file];
 $('clubProofFile').handlers.change({target:{files:[file]}});
 const pre=await window.MJClubPublicProof.sendPrepared(); // espera a que termine la lectura local, sin token no envía
 assert.equal(uploads,0);
 assert.equal($('clubProofFolio').value,'188198047943',JSON.stringify({pre,ocr:$('clubProofOcrStatus').textContent,preview:$('clubProofPreviewWrap').hidden}));
 assert.equal($('clubProofAmount').value,'2000.00');
 window.MJClubPublicProof.open('#comprobante=91.'+'a'.repeat(64));
 const result=await window.MJClubPublicProof.sendPrepared();
 assert.equal(result.status,'sent');
 assert.equal(uploads,1);
 assert.equal(payload.reservaId,91);
 assert.equal(payload.folioOperacion,'188198047943');
 assert.equal(payload.monto,2000);
 assert.equal(payload.fechaOperacion,'2026-11-12');
});
