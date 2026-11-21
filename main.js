const {app,BrowserWindow,Menu,dialog,shell,nativeImage}=require('electron');
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto'),os=require('os');
const PORT=4455;
let CFG_FILE,CFG,DATA,DB,sessions={};
const uid=()=>crypto.randomBytes(6).toString('hex');
const hash=(p,s=crypto.randomBytes(8).toString('hex'))=>s+':'+crypto.scryptSync(p,s,32).toString('hex');
const check=(p,h)=>hash(p,h.split(':')[0])===h;
const MOD=(id,name,icon,fields)=>({id,name,icon,hidden:false,fields:fields.map(([l,t,o])=>({id:uid(),label:l,type:t||'text',options:o||[],hidden:false}))});
function seed(){return{
 modules:[
  MOD('students','الطلاب','🎓',[['الاسم الكامل'],['الرقم الجامعي'],['الفرقة','select',['الأولى','الثانية','الثالثة','الرابعة']],['الهاتف'],['البريد الإلكتروني'],['تاريخ الالتحاق','date'],['ملاحظات','textarea']]),
  MOD('courses','المقررات الدراسية','📚',[['اسم المقرر'],['الكود'],['الفصل','select',['الأول','الثاني']],['الساعات المعتمدة','number'],['أستاذ المقرر'],['الوصف','textarea']]),
  MOD('activities','الأنشطة','🎯',[['عنوان النشاط'],['النوع','select',['ندوة','ورشة عمل','رحلة','مسابقة','أخرى']],['التاريخ','date'],['المكان'],['المسؤول'],['التفاصيل','textarea']]),
  MOD('staff','أعضاء هيئة التدريس','👤',[['الاسم'],['الدرجة العلمية'],['التخصص'],['الهاتف'],['البريد الإلكتروني']]),
  MOD('docs','المرفقات والمستندات','📎',[['عنوان المستند'],['التصنيف','select',['قرار','محضر','خطاب','نموذج','أخرى']],['التاريخ','date'],['وصف','textarea']])],
 records:{},users:[{id:'u1',username:'admin',name:'مدير النظام',admin:true,pass:hash('admin123'),perms:{},hiddenFields:[],active:true}],
 audit:[],settings:{title:'قسم إدارة الأعمال',sub:'المعهد العالي للعلوم الإدارية – جنكليس',accent:'#e8b04a'}}}
function save(){DB.v=(DB.v||0)+1;const t=path.join(DATA,'db.json.tmp');fs.writeFileSync(t,JSON.stringify(DB));fs.renameSync(t,path.join(DATA,'db.json'))}
function load(){fs.mkdirSync(path.join(DATA,'attachments'),{recursive:true});fs.mkdirSync(path.join(DATA,'backups'),{recursive:true});
 const f=path.join(DATA,'db.json');DB=fs.existsSync(f)?JSON.parse(fs.readFileSync(f)):seed();if(!fs.existsSync(f))save()}
const log=(u,a,d,m,k)=>{DB.audit.unshift({t:Date.now(),user:u?u.username:'-',a,d,m:m||'',k:k||'other'});DB.audit=DB.audit.slice(0,50000)};
const can=(u,m,act)=>u.admin||!!(u.perms[m]&&u.perms[m][act]);
const ip=()=>Object.values(os.networkInterfaces()).flat().filter(i=>i.family==='IPv4'&&!i.internal).map(i=>i.address);
function body(req){return new Promise(r=>{const c=[];req.on('data',d=>c.push(d));req.on('end',()=>r(Buffer.concat(c)))})}
const J=(res,o,c=200)=>{res.writeHead(c,{'Content-Type':'application/json'});res.end(JSON.stringify(o))};
const safeUser=u=>({id:u.id,username:u.username,name:u.name,admin:u.admin,perms:u.perms,hiddenFields:u.hiddenFields,active:u.active});
function view(u){ // schema filtered for user
 const mods=DB.modules.filter(m=>u.admin||(can(u,m.id,'view')&&!m.hidden)).map(m=>({...m,fields:m.fields.filter(f=>u.admin||!u.hiddenFields.includes(f.id))}));return mods}
async function api(req,res,url){
 const raw=await body(req);let b={};try{if(req.headers['content-type']?.includes('json'))b=JSON.parse(raw)}catch{}
 const p=url.pathname,q=url.searchParams;
 if(p==='/api/login'){const u=DB.users.find(x=>x.username===b.username&&x.active);
  if(!u||!check(b.password||'',u.pass))return J(res,{error:'بيانات الدخول غير صحيحة'},401);
  const t=uid()+uid();sessions[t]={uid:u.id,ip:(req.socket.remoteAddress||'').replace('::ffff:',''),seen:Date.now(),since:Date.now(),busy:null};log(u,'تسجيل دخول','',null,'login');save();return J(res,{token:t})}
 if(p==='/api/info')return J(res,{settings:DB.settings,addr:ip().map(a=>`http://${a}:${PORT}`),dataDir:DATA});
 const s=sessions[(req.headers.authorization||'').replace('Bearer ','')];const u=s&&DB.users.find(x=>x.id===s.uid&&x.active);
 if(!u)return J(res,{error:'auth'},401);s.seen=Date.now();
 const m=DB.modules.find(x=>x.id===(q.get('m')||b.m));
 if(p==='/api/ping')return J(res,{v:DB.v||0});
 if(p==='/api/me')return J(res,{user:safeUser(u),modules:view(u),settings:DB.settings,dataDir:DATA,addr:ip().map(a=>`http://${a}:${PORT}`)});
 if(p==='/api/logout'){log(u,'تسجيل خروج','',null,'logout');delete sessions[(req.headers.authorization||'').replace('Bearer ','')];return J(res,{})}
 if(p==='/api/records'&&req.method==='GET'){if(!m||!can(u,m.id,'view'))return J(res,{error:'ممنوع'},403);
  const hid=u.admin?[]:u.hiddenFields;const rs=(DB.records[m.id]||[]).map(r=>({...r,d:Object.fromEntries(Object.entries(r.d).filter(([k])=>!hid.includes(k)))}));return J(res,rs)}
 if(p==='/api/record'){if(!m)return J(res,{error:'?'},400);
  if(req.method==='POST'){const act=b.id?'edit':'add';if(!can(u,m.id,act))return J(res,{error:'ليست لديك صلاحية'},403);
   const arr=DB.records[m.id]=DB.records[m.id]||[];let r=b.id&&arr.find(x=>x.id===b.id);
   if(r){Object.keys(b.d).forEach(k=>{if(u.admin||!u.hiddenFields.includes(k))r.d[k]=b.d[k]});r.upd=Date.now()}else{r={id:uid(),d:b.d,files:[],cr:Date.now(),upd:Date.now(),by:u.username};arr.push(r)}
   log(u,act==='add'?'إضافة سجل':'تعديل سجل',m.name+' — '+(Object.values(r.d).find(Boolean)||''),m.id,act);save();return J(res,r)}
  if(req.method==='DELETE'){if(!can(u,m.id,'delete'))return J(res,{error:'ليست لديك صلاحية'},403);
   DB.records[m.id]=(DB.records[m.id]||[]).filter(x=>x.id!==q.get('id'));log(u,'حذف سجل',m.name,m.id,'del');save();return J(res,{})}}
 if(p==='/api/import'){if(!m||!can(u,m.id,'add'))return J(res,{error:'ممنوع'},403);const arr=DB.records[m.id]=DB.records[m.id]||[];
  b.rows.forEach(d=>arr.push({id:uid(),d,files:[],cr:Date.now(),upd:Date.now(),by:u.username}));log(u,'استيراد '+b.rows.length+' سجل',m.name,m.id,'import');save();return J(res,{n:b.rows.length})}
 if(p==='/api/upload'){if(!m||!can(u,m.id,'files'))return J(res,{error:'ليست لديك صلاحية رفع المرفقات'},403);
  const r=(DB.records[m.id]||[]).find(x=>x.id===q.get('id'));if(!r)return J(res,{error:'?'},404);
  const dir=path.join(DATA,'attachments',m.id);fs.mkdirSync(dir,{recursive:true});const name=decodeURIComponent(q.get('name'));const fid=uid()+path.extname(name);
  s.busy='رفع: '+name;fs.writeFileSync(path.join(dir,fid),raw);s.busy=null;r.files.push({fid,name,size:raw.length,by:u.username,t:Date.now()});log(u,'رفع مرفق',m.name+' — '+name,m.id,'up');save();return J(res,r)}
 if(p==='/api/file'){if(!m||!can(u,m.id,'view'))return J(res,{error:'ممنوع'},403);const r=(DB.records[m.id]||[]).find(x=>x.id===q.get('id'));const f=r&&r.files.find(x=>x.fid===q.get('fid'));
  if(!f)return J(res,{error:'?'},404);log(u,'تنزيل مرفق',m.name+' — '+f.name,m.id,'down');res.writeHead(200,{'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(f.name)});return res.end(fs.readFileSync(path.join(DATA,'attachments',m.id,f.fid)))}
 if(p==='/api/delfile'){if(!can(u,m.id,'files'))return J(res,{error:'ممنوع'},403);const r=(DB.records[m.id]||[]).find(x=>x.id===b.id);
  r.files=r.files.filter(x=>{if(x.fid===b.fid){try{fs.unlinkSync(path.join(DATA,'attachments',m.id,x.fid))}catch{}return false}return true});log(u,'حذف مرفق',m.name,m.id,'delfile');save();return J(res,r)}
 // ---- admin only
 if(!u.admin)return J(res,{error:'للمدير فقط'},403);
 if(p==='/api/admin/schema'){DB.modules=b.modules;DB.settings=b.settings||DB.settings;log(u,'تعديل هيكل القاعدة','');save();return J(res,{})}
 if(p==='/api/admin/settings'){DB.settings=Object.assign(DB.settings,b.settings);log(u,'تعديل المظهر والهوية','',null,'other');save();applyBrand();return J(res,{})}
 if(p==='/api/admin/shortcut'){try{const ico=icoPath();if(!ico)return J(res,{error:'ارفع الشعار أولاً من صفحة المظهر'},400);
  const lnk=path.join(app.getPath('desktop'),(DB.settings.title||'DeptDB')+'.lnk');
  const ok=shell.writeShortcutLink(lnk,'create',{target:process.execPath,icon:ico,iconIndex:0,description:DB.settings.title});return J(res,{ok,lnk})}catch(e){return J(res,{error:String(e)},500)}}
 if(p==='/api/admin/users'){if(req.method==='GET')return J(res,DB.users.map(safeUser));
  let x=b.id&&DB.users.find(y=>y.id===b.id);
  if(!x){if(DB.users.some(y=>y.username===b.username))return J(res,{error:'اسم المستخدم موجود'},400);x={id:uid(),admin:false};DB.users.push(x)}
  Object.assign(x,{username:b.username,name:b.name,perms:b.perms||{},hiddenFields:b.hiddenFields||[],active:b.active!==false,admin:x.id==='u1'?true:!!b.admin});
  if(b.password)x.pass=hash(b.password);else if(!x.pass)x.pass=hash('123456');log(u,'حفظ مستخدم',b.username);save();return J(res,{})}
 if(p==='/api/admin/deluser'){if(b.id==='u1')return J(res,{error:'لا يمكن حذف المدير الرئيسي'},400);DB.users=DB.users.filter(x=>x.id!==b.id);save();return J(res,{})}
 if(p==='/api/admin/online'){const now=Date.now();Object.keys(sessions).forEach(k=>{if(now-sessions[k].seen>8000)delete sessions[k]});
  return J(res,Object.values(sessions).map(x=>{const y=DB.users.find(z=>z.id===x.uid);return{user:y.name,username:y.username,ip:x.ip,since:x.since,seen:x.seen,busy:x.busy,canUpload:y.admin||Object.values(y.perms).some(v=>v.files||v.add)}}))}
 if(p==='/api/admin/report'){const f=new Date(q.get('from')||'1970-01-01').getTime(),t2=new Date(q.get('to')||'2999-01-01').getTime()+86399999,mods=(q.get('mods')||'').split(',').filter(Boolean);
  const E=DB.audit.filter(e=>e.t>=f&&e.t<=t2),inM=e=>!e.m||mods.includes(e.m);
  const users=DB.users.map(x=>{const es=E.filter(e=>e.user===x.username&&inM(e));const c=k=>es.filter(e=>e.k===k).length;
   return{name:x.name,username:x.username,logins:c('login'),add:c('add'),edit:c('edit'),del:c('del'),up:c('up'),down:c('down'),imp:c('import'),total:es.length,last:es.length?es[0].t:0}});
  const modsR=DB.modules.filter(m=>mods.includes(m.id)).map(m=>{const rs=DB.records[m.id]||[];const inr=x=>x>=f&&x<=t2;
   return{name:m.name,total:rs.length,created:rs.filter(r=>inr(r.cr)).length,edited:rs.filter(r=>inr(r.upd)&&!inr(r.cr)).length,files:rs.reduce((a,r)=>a+r.files.filter(x=>inr(x.t)).length,0),deleted:E.filter(e=>e.m===m.id&&e.k==='del').length}});
  const ops=E.filter(e=>e.m&&mods.includes(e.m)&&['add','edit','del','up','down','delfile','import'].includes(e.k)).slice(0,1000);
  return J(res,{users,mods:modsR,ops})}
 if(p==='/api/admin/audit')return J(res,DB.audit.slice(0,500));
 if(p==='/api/admin/backup'){const d=path.join(DATA,'backups','نسخة-'+new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(d,{recursive:true});
  fs.copyFileSync(path.join(DATA,'db.json'),path.join(d,'db.json'));fs.cpSync(path.join(DATA,'attachments'),path.join(d,'attachments'),{recursive:true});log(u,'نسخة احتياطية','');save();return J(res,{dir:d})}
 if(p==='/api/admin/open'){shell.openPath(b.what==='backups'?path.join(DATA,'backups'):path.join(DATA,'attachments'));return J(res,{})}
 J(res,{error:'404'},404)}
function icoPath(){const l=DB.settings.logo;if(!l)return null;const png=Buffer.from(l.split(',')[1],'base64');const h=Buffer.alloc(22);
 h.writeUInt16LE(1,2);h.writeUInt16LE(1,4);h[6]=0;h[7]=0;h.writeUInt16LE(1,10);h.writeUInt16LE(32,12);h.writeUInt32LE(png.length,14);h.writeUInt32LE(22,18);
 const f=path.join(DATA,'logo.ico');fs.writeFileSync(f,Buffer.concat([h,png]));fs.writeFileSync(path.join(DATA,'logo.png'),png);return f}
function applyBrand(){try{const w=global.WIN;if(!w)return;w.setTitle(DB.settings.title||'');if(DB.settings.logo)w.setIcon(nativeImage.createFromDataURL(DB.settings.logo))}catch{}}
function startServer(){http.createServer(async(req,res)=>{try{res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');res.setHeader('Access-Control-Allow-Methods','GET, POST, DELETE, OPTIONS');if(req.method==='OPTIONS'){res.writeHead(204);return res.end()}const url=new URL(req.url,'http://x');
 if(url.pathname.startsWith('/api/'))return await api(req,res,url);
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(fs.readFileSync(path.join(__dirname,'ui','index.html')))}catch(e){J(res,{error:String(e)},500)}}).listen(PORT,'0.0.0.0')}
app.whenReady().then(()=>{
 CFG_FILE=path.join(app.getPath('userData'),'config.json');CFG=fs.existsSync(CFG_FILE)?JSON.parse(fs.readFileSync(CFG_FILE)):{};
 const win=new BrowserWindow({width:1366,height:850,title:'قاعدة بيانات قسم إدارة الأعمال',backgroundColor:'#0d1117'});
 const connect=()=>{ if(CFG.server){win.loadURL(CFG.server)}else{DATA=CFG.dataDir||path.join(app.getPath('documents'),'DeptDB-Data');load();if(!global.srv){global.srv=1;startServer()}win.loadURL('http://localhost:'+PORT)}};
 Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'الاتصال',submenu:[
  {label:'تشغيل كخادم (هذا الجهاز يحوي القاعدة)',click(){CFG.server='';fs.writeFileSync(CFG_FILE,JSON.stringify(CFG));app.relaunch();app.exit()}},
  {label:'الاتصال بجهاز خادم آخر…',click(){const {execFile}=require('child_process');
    const w=new BrowserWindow({width:460,height:200,parent:win,modal:true,autoHideMenuBar:true,webPreferences:{nodeIntegration:true,contextIsolation:false}});
    w.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(`<body dir=rtl style="font-family:Tahoma;padding:20px;background:#161b22;color:#fff"><p>أدخل عنوان الخادم (مثال: http://192.168.1.10:4455)</p><input id=a style="width:100%;padding:8px" value="http://"><br><br><button onclick="require('electron').ipcRenderer.send('srv',document.getElementById('a').value)" style="padding:8px 20px">اتصال</button>`))}},
  {label:'تغيير مجلد حفظ البيانات…',click(){const r=dialog.showOpenDialogSync(win,{properties:['openDirectory','createDirectory']});if(r){CFG.dataDir=r[0];fs.writeFileSync(CFG_FILE,JSON.stringify(CFG));app.relaunch();app.exit()}}},
  {label:'فتح مجلد البيانات',click(){shell.openPath(DATA||'')}}]},{role:'viewMenu',label:'عرض'}]));
 require('electron').ipcMain.on('srv',(e,a)=>{CFG.server=a;fs.writeFileSync(CFG_FILE,JSON.stringify(CFG));app.relaunch();app.exit()});
  global.WIN=win;connect();win.webContents.once('did-finish-load',()=>{if(DB)applyBrand()})});
app.on('window-all-closed',()=>app.quit());
