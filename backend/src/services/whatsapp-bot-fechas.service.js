'use strict';
const MONTHS={enero:1,ene:1,febrero:2,feb:2,marzo:3,mar:3,abril:4,abr:4,
 mayo:5,junio:6,jun:6,julio:7,jul:7,agosto:8,ago:8,
 septiembre:9,setiembre:9,sep:9,set:9,octubre:10,oct:10,
 noviembre:11,nov:11,diciembre:12,dic:12};
const clean=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toLowerCase().replace(/[,]+/g,' ').replace(/\s+/g,' ').trim();
function fechaISO(value){
 const raw=clean(value);
 let y,m,d;
 let match=/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(raw);
 if(match){[,y,m,d]=match;}
 else {
  match=/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(raw);
  if(match){const first=Number(match[1]),second=Number(match[2]);
   // DD/MM/AAAA por defecto, pero 12/31/2026 admite el formato estadounidense.
   if(first<=12&&second>12){y=match[3];m=first;d=second;}
   else{y=match[3];m=second;d=first;}
  }else{
   const words=raw.replace(/\bde\b/g,'').replace(/\s+/g,' ').trim().split(' ');
   const parts=words.length===3?words:[];
   if(parts.length===3&&MONTHS[parts[0]]&&/^\d{1,2}$/.test(parts[1])){
    m=MONTHS[parts[0]];d=Number(parts[1]);y=parts[2];
   }else if(parts.length===3&&MONTHS[parts[1]]&&/^\d{1,2}$/.test(parts[0])){
    m=MONTHS[parts[1]];d=Number(parts[0]);y=parts[2];
   }else return '';
  }
 }
 if(!/^20\d{2}$/.test(String(y)))return '';
 const iso=String(y)+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');
 const date=new Date(iso+'T12:00:00Z');
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===iso?iso:'';
}
module.exports={fechaISO};
