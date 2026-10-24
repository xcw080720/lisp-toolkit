const fs=require('fs');
const src=fs.readFileSync('.verify/target.lisp','utf8').split('\n');
let d=0,inBlock=false;
const end=[];
for(let ln=0;ln<src.length;ln++){
  const s=src[ln]; let i=0,inStr=false;
  while(i<s.length){
    const c=s[i];
    if(inStr){ if(c==='\\'){i+=2;continue;} if(c==='"'){inStr=false;i++;continue;} i++;continue; }
    if(c===';'){break;}
    if(c==='"'){inStr=true;i++;continue;}
    if(c==='#'&&s[i+1]==='\\'){ i+=2; if(/[A-Za-z]/.test(s[i]||'')){while(i<s.length&&/[A-Za-z0-9-]/.test(s[i]))i++;} else i++; continue;}
    if(c==='('){d++;i++;continue;}
    if(c===')'){d--;i++;continue;}
    i++;
  }
  end.push(d);
}
const zero=[]; for(let ln=0;ln<end.length;ln++) if(end[ln]===0) zero.push(ln+1);
console.log('lines ending at depth 0:', zero.join(' '));
console.log('tail depths:', end.slice(440).map((v,k)=>`${441+k}:${v}`).join(' '));
