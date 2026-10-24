const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process');
const pkg=fs.readFileSync(process.argv[2],'utf8');
const f=path.join(require('os').tmpdir(),'show.json'); fs.writeFileSync(f,pkg,'utf8');
const r=spawnSync(process.env.SBCL,['--script','impl.lisp',f],{encoding:'utf8'});
if(!r.stdout.trim()){console.log('STDERR',r.stderr.slice(0,800));process.exit(1);}
const o=JSON.parse(r.stdout);
console.log('log:'); o.log.forEach((l,i)=>console.log('  ['+i+'] '+l));
console.log('courses:',o.courses.map(c=>c.name+'@d'+c.day+':'+c.periodFrom+'-'+c.periodTo).join(' | '));
console.log('n:',o.n);
