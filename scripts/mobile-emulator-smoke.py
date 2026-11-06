"""Task-owned Android Emulator only; no USB/physical/iOS/performance claim."""
from pathlib import Path
import datetime,hashlib,json,os,re,struct,subprocess,time,uuid,xml.etree.ElementTree as ET
adb=os.environ['ADB_PATH'];serial=os.environ['VLP_EMULATOR_SERIAL'];apk=Path(os.environ['VLP_EMULATOR_APK']);app='life.virtualcity.spike'
assert serial=='emulator-5580'and apk.is_file()
output=Path('artifacts/vnext/n10-05')/('emulated-preview-'+uuid.uuid4().hex[:8]);output.mkdir(mode=0o700);commands=[];scenarios=[]
def run(name,args,allow=False,timeout=30):
 r=subprocess.run([adb,'-s',serial,*args],capture_output=True,timeout=timeout);p=output/(str(len(commands))+'-'+name+'.log');p.write_bytes(r.stdout+r.stderr);p.chmod(0o600);commands.append({'label':name,'argv':['adb','-s',serial,*args],'exitCode':r.returncode,'log':str(p)})
 if r.returncode and not allow:raise RuntimeError(name+' failed; see private log')
 return r
def focus():
 text=run('own-focus',['shell','dumpsys','window']).stdout.decode();assert any(app+'/'in s for s in text.splitlines()if'mCurrentFocus='in s),'Own app must have focus'
def label(n):return n.get('text')or n.get('content-desc','')
def snapshot(name,expected,image=True):
 for attempt in range(4):
  focus();temporary='/data/local/tmp/vlp-emulated-'+uuid.uuid4().hex+'.xml';nodes=[]
  try:
   r=run('dump-'+name,['shell','uiautomator','dump',temporary],allow=True)
   if not r.returncode:
    xml=run('read-'+name,['exec-out','cat',temporary]).stdout;tree=ET.fromstring(xml);nodes=[n for n in tree.iter('node')if n.get('package')==app];(output/(name+'-'+str(attempt)+'.xml')).write_bytes(xml)
    if nodes and all(any(label(n)==text for n in nodes)for text in expected):
     size=None
     if image:
      data=run('image-'+name,['exec-out','screencap','-p']).stdout;(output/(name+'.png')).write_bytes(data);size=list(struct.unpack('>II',data[16:24]))
     return nodes,tree.get('rotation'),size
  finally:run('remove-own-dump',['shell','rm','-f',temporary])
  time.sleep(.5)
 raise RuntimeError('Own-app content unavailable: '+name)
def tap(nodes,text=None,edit=False):
 focus()
 for n in nodes:
  if (edit and n.get('class')!='android.widget.EditText')or(not edit and label(n)!=text)or n.get('enabled')!='true':continue
  match=re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]',n.get('bounds',''))
  if match:
   x1,y1,x2,y2=map(int,match.groups())
   if x2>x1 and y2>y1:run('tap-own-control',['shell','input','touchscreen','tap',str((x1+x2)//2),str((y1+y2)//2)]);return
 raise RuntimeError('Owned control missing: '+(text or 'seat search'))
facts={'scope':'EMULATED_ANDROID_LOCAL_PREVIEW_NOT_PHYSICAL_N10_04_3D_OR_IOS','observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'commands':commands,'scenarios':scenarios,'apkSHA256':hashlib.sha256(apk.read_bytes()).hexdigest(),'sourceRevision':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'distributed':False}
try:
 assert run('emulator-property',['shell','getprop','ro.kernel.qemu']).stdout.decode().strip()=='1'
 assert run('owned-avd',['emu','avd','name']).stdout.decode().splitlines()[0]=='vlp_n10_05_api35'
 run('unlock-owned-emulator',['shell','input','keyevent','82']);run('install-own-apk',['install','-r',str(apk)],timeout=90)
 package=run('own-package',['shell','pm','path',app]).stdout.decode().strip();assert re.fullmatch(r'package:/data/app/[^\s]+/base\.apk',package)
 assert run('installed-hash',['shell','sha256sum',package.removeprefix('package:')]).stdout.decode().split()[0]==facts['apkSHA256']
 run('launch-own-preview',['shell','am','start','-W','-n',app+'/.MainActivity'],timeout=45);time.sleep(1)
 nodes,rotation,size=snapshot('entry',['Local Test Cafe','Room actions','Rotate view']);assert size[0]>size[1];scenarios.append({'name':'actual emulated APK landscape entry','result':'PASS','screenPx':size})
 tap(nodes,'Room actions');nodes,_,_=snapshot('actions',['Find a seat','Window table 01','Close room actions']);seats=[n for n in nodes if re.fullmatch(r'(Window|Garden) table \d\d',label(n))];assert len(seats)==8 and all(n.get('enabled')=='false'for n in seats)
 tap(nodes,edit=True);run('type-seat-label',['shell','input','text','Window']);nodes,_,_=snapshot('keyboard',['Window','Close room actions'],image=False);ime=run('keyboard-observation',['shell','dumpsys','input_method']).stdout.decode();facts['keyboardShown']=bool(re.search(r'(mInputShown|isInputViewShown|mIsInputViewShown)=true',ime));assert facts['keyboardShown'];tap(nodes,'Close room actions');nodes,_,_=snapshot('after-keyboard',['Local Test Cafe','Room actions']);scenarios.append({'name':'emulated IME and touch-close without granting a seat','result':'PASS'})
 tap(nodes,'Room actions');nodes,_,_=snapshot('retained-filter',['Window','Close room actions']);run('panel-back',['shell','input','keyevent','4']);nodes,_,_=snapshot('after-back',['Local Test Cafe','Room actions']);rotations=[]
 for name in ['secondary','primary']:
  tap(nodes,'Rotate view');nodes,rotation,size=snapshot(name,['Local Test Cafe','Room actions','Rotate view']);assert size[0]>size[1];rotations.append(rotation)
 assert len(set(rotations))==2;scenarios.append({'name':'emulated panel Back/filter and opposite landscape rotations','result':'PASS','rotations':rotations})
 tap(nodes,'People, safety & options');nodes,_,_=snapshot('people',['Identity','Close people and safety']);tap(nodes,'Identity');snapshot('fallback',["You're offline",'Return to preview']);run('fallback-back',['shell','input','keyevent','4']);snapshot('restored',['Local Test Cafe','Room actions']);scenarios.append({'name':'emulated fallback/Back','result':'PASS'})
 focus();run('background',['shell','input','keyevent','3']);time.sleep(.5);window=run('background-window',['shell','dumpsys','window']).stdout.decode();assert not any(app+'/'in s for s in window.splitlines()if'mCurrentFocus='in s)
 run('foreground',['shell','am','start','-W','-n',app+'/.MainActivity']);snapshot('resumed',['Local Test Cafe','Room actions']);scenarios.append({'name':'emulated Home/resume','result':'PASS'});facts['result']='PASS'
except Exception as error:facts['result']='FAIL';facts['error']=str(error)
finally:
 for p in output.iterdir():p.chmod(0o600)
 facts['artifacts']=[{'ref':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}for p in sorted(output.iterdir())];(output/'facts.json').write_text(json.dumps(facts,indent=2)+'\n');print(json.dumps({'result':facts['result'],'scope':facts['scope'],'scenarios':scenarios,'error':facts.get('error'),'artifactDirectory':str(output)}))
if facts['result']!='PASS':raise SystemExit(1)
