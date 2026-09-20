'use strict';
const sharp = require('sharp');
const { createHash } = require('crypto');
function bad(message){const e=new Error(message);e.status=400;throw e}
function validateQuote(input){
 if(!input||typeof input!=='object'||Array.isArray(input))bad('Nieprawidłowe zgłoszenie.');
 const limits={service:80,route:300,date:200,description:3500,clientName:140,phone:40,requestId:80};
 for(const [key,max] of Object.entries(limits))if(typeof input[key]!=='string'||input[key].length>max)bad('Nieprawidłowe pole: '+key);
 if(input.website)bad('Nie udało się przyjąć zgłoszenia. Skontaktuj się telefonicznie.');
 const raw=input.phone.trim();let digits=raw.replace(/\D/g,'');if(raw.startsWith('00'))digits=digits.slice(2);
 if(!/^[+\d\s()-]+$/.test(raw)||digits.length<7||digits.length>15)bad('Wpisz prawidłowy numer telefonu. Dla numerów zagranicznych dodaj prefiks.');
 if(!/^[a-zA-Z0-9-]{16,80}$/.test(input.requestId)||!input.service.trim())bad('Sprawdź usługę i spróbuj ponownie.');
 const photos=input.photos===undefined?[]:input.photos;
 if(!Array.isArray(photos)||photos.length>3)bad('Maksymalnie 3 zdjęcia.');
 for(const photo of photos)if(!photo||typeof photo.data!=='string'||photo.data.length>1400000||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(photo.data))bad('Nieprawidłowy plik zdjęcia.');
 const details=input.details===undefined?{}:input.details;
 if(!details||typeof details!=='object'||Array.isArray(details)||Object.keys(details).length>20)bad('Nieprawidłowe szczegóły zlecenia.');
 const cleanDetails={};for(const [k,v] of Object.entries(details)){if(k.length>80||/[.$]/.test(k)||['__proto__','constructor','prototype'].includes(k)||typeof v!=='string'||v.length>200)bad('Nieprawidłowe szczegóły zlecenia.');cleanDetails[k]=v.trim()}
 return {...Object.fromEntries(Object.keys(limits).map(k=>[k,input[k].trim()])),phone:(raw.startsWith('+')||raw.startsWith('00')?'+':'')+digits,details:cleanDetails,photos};
}
async function preparePhotos(photos){const output=[];for(const p of photos){try{const bytes=Buffer.from(p.data.split(',')[1],'base64');const img=sharp(bytes,{limitInputPixels:24000000,failOn:'warning'});const meta=await img.metadata();if(!['jpeg','png','webp'].includes(meta.format)||meta.pages>1)bad('Obsługiwane są statyczne zdjęcia JPG, PNG i WebP.');const data=await img.rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).flatten({background:'#ffffff'}).jpeg({quality:80}).toBuffer();output.push({data,contentType:'image/jpeg'})}catch(e){if(e.status)throw e;bad('Nie można odczytać zdjęcia. Wybierz inny plik JPG, PNG lub WebP.')}}return output}
function fingerprint(input){return createHash('sha256').update(JSON.stringify([input.service,input.route,input.date,input.description,input.clientName,input.phone,input.details,input.photos.map(p=>createHash('sha256').update(p.data).digest('hex'))])).digest('hex')}
module.exports={validateQuote,preparePhotos,fingerprint};
