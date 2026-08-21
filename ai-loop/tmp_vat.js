const fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..');
const {corpusFiles}=require('./_corpus_files.js');
const CORPUS=process.env.BIZPAGE_CORPUS||path.join(process.env.USERPROFILE,'Desktop','견적서 모음');
const RE=/부가세|부가가치세|\bVAT\b|세금계산서/i;
(async()=>{
 const pdfParse=require('pdf-parse');
 const X=require(path.join(ROOT,'api','_lib','pdf_extract.js'));
 const files=corpusFiles(CORPUS).files;
 let hit=0;
 const rows=[];
 for(const f of files){
  let r; try{r=await X.extractQuote(new Uint8Array(fs.readFileSync(path.join(CORPUS,f))),pdfParse,{});}catch(e){continue;}
  const lines=String(r.text||'').split('\n').map(l=>l.trim()).filter(l=>RE.test(l));
  if(lines.length){hit++;rows.push({f,lines:lines.slice(0,3)});}
 }
 console.log('부가세를 언급하는 견적서: '+hit+'/'+files.length+'건\n');
 rows.forEach(x=>{console.log('▪ '+x.f.slice(0,50));x.lines.forEach(l=>console.log('    · '+l.slice(0,96)));});
})();
