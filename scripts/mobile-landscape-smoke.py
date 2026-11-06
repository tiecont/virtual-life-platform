"""Own-app physical landscape/keyboard/panel check; not native auth or N10-04 spike."""
from pathlib import Path
import datetime,hashlib,json,os,re,struct,subprocess,time,uuid,xml.etree.ElementTree as ET
app='life.virtualcity.spike';adb=os.environ.get('ADB_PATH')
if not adb or not Path(adb).is_file():raise SystemExit('Set ADB_PATH to the reviewed ADB executable')
output=Path('artifacts')/('mobile-landscape-'+uuid.uuid4().hex[:8]);output.mkdir(mode=0o700)
r=subprocess.run([adb,'devices','-l'],capture_output=True,timeout=10);(output/'devices.log').write_bytes(r.stdout+r.stderr)
devices=[s.split()[0]for s in r.stdout.decode().splitlines()[1:]if len(s.split())>1 and s.split()[1]=='device'and'usb:'in s]
if r.returncode or len(devices)!=1:raise SystemExit('Exactly one authorized USB device is required')
serial=devices[0];commands=[];scenarios=[];captures=[]
def run(label,args,timeout=30,allow_error=False):
 r=subprocess.run([adb,'-s',serial,*args],capture_output=True,timeout=timeout);p=output/(str(len(commands))+'-'+label+'.log');p.write_bytes(r.stdout+r.stderr);p.chmod(0o600);commands.append({'label':label,'argv':['adb','-s','<private-usb-device>',*args],'exitCode':r.returncode,'log':str(p)})
 if r.returncode and not allow_error:raise RuntimeError(label+' failed; see private log')
 return r

def focus():
 text=run('own-focus',['shell','dumpsys','window']).stdout.decode();assert any(app+'/'in s for s in text.splitlines()if'mCurrentFocus='in s),'Own app must have focus; no other-app UI will be inspected'
def label(n):return n.get('text')or n.get('content-desc','')
def has(nodes,text):return any(label(n)==text for n in nodes)
def snapshot(name,expected,image=True):
 deadline=time.monotonic()+30
 for attempt in range(4):
  focus();temporary='/data/local/tmp/vlp-landscape-'+uuid.uuid4().hex+'.xml';nodes=[];rotation=None
  try:
   dumped=run('dump-'+name,['shell','uiautomator','dump',temporary],allow_error=True)
   if not dumped.returncode:
    xml=run('read-'+name,['exec-out','cat',temporary]).stdout;tree=ET.fromstring(xml);rotation=tree.get('rotation');nodes=[n for n in tree.iter('node')if n.get('package')==app];(output/(name+'-'+str(attempt)+'.xml')).write_bytes(xml)
   ready=bool(nodes)and all(has(nodes,text)for text in expected);captures.append({'name':name,'attempt':attempt,'ready':ready,'dumpExitCode':dumped.returncode,'rotation':rotation})
  finally:run('remove-own-dump',['shell','rm','-f',temporary])
  if ready:
   dimensions=None
   if image:
    data=run('screen-'+name,['exec-out','screencap','-p']).stdout;(output/(name+'.png')).write_bytes(data);dimensions=list(struct.unpack('>II',data[16:24]))
   return nodes,rotation,dimensions
  if time.monotonic()>=deadline:break
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
 raise RuntimeError('Owned visible control missing: '+(text or 'seat search'))

facts={'scope':'PHYSICAL_ANDROID_LANDSCAPE_LOCAL_PREVIEW_ONLY_NOT_N10_04','observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceRevision':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'trackedDiffSha256':hashlib.sha256(subprocess.check_output(['git','diff','--binary','HEAD'])).hexdigest(),'commands':commands,'scenarios':scenarios,'captures':captures,'distributed':False}
try:
 package=run('own-package',['shell','pm','path',app]).stdout.decode().strip();assert re.fullmatch(r'package:/data/app/[^\s]+/base\.apk',package);facts['installedApkSHA256']=run('installed-hash',['shell','sha256sum',package.removeprefix('package:')]).stdout.decode().split()[0]
 run('stop-own-preview',['shell','am','force-stop',app]);run('launch-own-preview',['shell','am','start','-W','-n',app+'/.MainActivity'],45)
 nodes,rotation,size=snapshot('initial',['Local Test Cafe','Room actions','Rotate view']);assert size[0]>size[1],'Actual app must enter landscape';scenarios.append({'name':'actual own-app landscape entry','outcome':'PASS','screenPx':size,'rotation':rotation})
 tap(nodes,'Room actions');nodes,_,_=snapshot('actions',['Find a seat','Window table 01','Close room actions']);seats=[n for n in nodes if re.fullmatch(r'(Window|Garden) table \d\d',label(n))];assert len(seats)==8 and all(n.get('enabled')=='false'for n in seats),'Logged-out controls must not grant a seat'
 tap(nodes,edit=True);run('type-public-seat-label',['shell','input','text','Window']);nodes,_,_=snapshot('keyboard',['Window','Close room actions'],image=False)
 ime=run('ime-observation',['shell','dumpsys','input_method']).stdout.decode();shown=any(re.search(r'(mInputShown|isInputViewShown|mIsInputViewShown)=true',s)for s in ime.splitlines());facts['keyboardShown']=shown
 assert shown,'Actual virtual-keyboard visibility required';tap(nodes,'Close room actions');nodes,_,_=snapshot('after-keyboard',['Local Test Cafe','Room actions'],image=False)
 tap(nodes,'Room actions');nodes,_,_=snapshot('filter-retained',['Window','Close room actions']);run('native-panel-back',['shell','input','keyevent','4']);nodes,_,_=snapshot('after-panel-back',['Local Test Cafe','Room actions']);scenarios.append({'name':'native keyboard, touch-close, panel Back and retained local filter','outcome':'PASS'})
 rotations=[]
 for name in ['secondary','primary']:
  nodes,_,_=snapshot('before-'+name,['Rotate view']);tap(nodes,'Rotate view');nodes,rotation,size=snapshot(name,['Local Test Cafe','Room actions','Rotate view']);assert size[0]>size[1];rotations.append(rotation)
 assert len(set(rotations))==2,'Two actual opposite landscape orientations required';scenarios.append({'name':'both native landscape policies','outcome':'PASS','rotations':rotations})
 tap(nodes,'People, safety & options');nodes,_,_=snapshot('people',['No confirmed visible visitors.','Identity','Close people and safety']);tap(nodes,'Identity');nodes,_,size=snapshot('fallback',["You're offline",'Return to preview']);facts['fallbackScreenPx']=size
 run('back-fallback',['shell','input','keyevent','4']);nodes,_,size=snapshot('back-landscape',['Local Test Cafe','Room actions']);assert size[0]>size[1];scenarios.append({'name':'fallback cleanup and native Back re-entry','outcome':'PASS','fallbackScreenPx':facts['fallbackScreenPx']})
 focus();run('background-home',['shell','input','keyevent','3']);time.sleep(.5);window=run('background-own-window-check',['shell','dumpsys','window']).stdout.decode();assert not any(app+'/'in s for s in window.splitlines()if'mCurrentFocus='in s)
 run('foreground-return',['shell','am','start','-W','-n',app+'/.MainActivity'],45);snapshot('foreground',['Local Test Cafe','Room actions']);scenarios.append({'name':'actual background/foreground with layout recovery','outcome':'PASS'});facts['result']='PASS'
except Exception as error:facts['result']='FAIL';facts['error']=str(error)
finally:
 for p in output.iterdir():p.chmod(0o600)
 facts['artifacts']=[{'ref':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}for p in sorted(output.iterdir())];p=output/'facts.json';p.write_text(json.dumps(facts,indent=2)+'\n');p.chmod(0o600);print(json.dumps({'result':facts['result'],'scope':facts['scope'],'scenarios':scenarios,'error':facts.get('error'),'artifactDirectory':str(output)}))
if facts['result']!='PASS':raise SystemExit(1)
