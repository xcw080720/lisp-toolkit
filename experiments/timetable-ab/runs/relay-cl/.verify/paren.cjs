const fs=require('fs');
const src=fs.readFileSync('.verify/target.lisp','utf8');
let d=0,i=0,line=1,inStr=false;
const marks=[];
while(i<src.length){
  const c=src[i];
  if(c==='\n'){line++; marks.push([line,d]); i++; continue;}
  if(inStr){
    if(c==='\\'){i+=2;continue;}
    if(c==='"'){inStr=false;i++;continue;}
    i++;continue;
  }
  if(c===';'){while(i<src.length&&src[i]!=='\n')i++;continue;}
  if(c==='"'){inStr=true;i++;continue;}
  if(c==='#'&&src[i+1]==='\\'){
    i+=2;
    if(/[A-Za-z]/.test(src[i])){while(i<src.length&&/[A-Za-z0-9-]/.test(src[i]))i++;}
    else i++;
    continue;
  }
  if(c==='('){d++;i++;continue;}
  if(c===')'){d--; if(d<0){console.log('EXTRA ) at line',line);process.exit(0);} i++;continue;}
  i++;
}
console.log('final depth',d,'lines',line);
