import ctypes as c
from ctypes import c_int,c_uint,c_ulong,c_void_p,c_char_p,POINTER,byref
from pathlib import Path
from os import environ
from PIL import ImageGrab
import sys,time
directory=Path(environ.get('PACKAGED_QA_RUN','artifacts/packaged-qa'))
display=directory.joinpath('display').read_text().strip()
x=c.CDLL('libX11.so.6')
xt=c.CDLL('libXtst.so.6')
def sig(lib,name,result,*args):
 f=getattr(lib,name);f.restype=result;f.argtypes=args;return f
d=sig(x,'XOpenDisplay',c_void_p,c_char_p)(display.encode())
assert d,display
root=sig(x,'XDefaultRootWindow',c_ulong,c_void_p)(d)
tree=sig(x,'XQueryTree',c_int,c_void_p,c_ulong,POINTER(c_ulong),POINTER(c_ulong),POINTER(POINTER(c_ulong)),POINTER(c_uint))
fetch=sig(x,'XFetchName',c_int,c_void_p,c_ulong,POINTER(c_char_p))
def locate(window):
 name=c_char_p()
 if fetch(d,window,byref(name)) and name.value==b'Aetheria':
  return window
 base,parent,children,total=c_ulong(),c_ulong(),POINTER(c_ulong)(),c_uint()
 tree(d,window,byref(base),byref(parent),byref(children),byref(total))
 for i in range(total.value):
  if found:=locate(children[i]):return found
 return None
window=locate(root)
translate=sig(x,"XTranslateCoordinates",c_int,c_void_p,c_ulong,c_ulong,c_int,c_int,POINTER(c_int),POINTER(c_int),POINTER(c_ulong))
assert window,'Unity X11 window not found'
if sys.argv[1]=='capture':
 im=ImageGrab.grab(xdisplay=display,window=window)
 print(im.size)
 im.save(directory/sys.argv[2])
else:
 sync=sig(x,'XSync',c_int,c_void_p,c_int)
 sig(x,'XSetInputFocus',c_int,c_void_p,c_ulong,c_int,c_ulong)(d,window,1,0)
 if sys.argv[1]=='click':
  pos=list(map(int,sys.argv[2:]))
  x_pos,y_pos,child = c_int(),c_int(),c_ulong()
  assert translate(d,window,root,*pos,byref(x_pos),byref(y_pos),byref(child))
  pos=[x_pos.value,y_pos.value]
  sig(xt,'XTestFakeMotionEvent',c_int,c_void_p,c_int,c_int,c_int,c_ulong)(d,-1,*pos,0)
  button=sig(xt,'XTestFakeButtonEvent',c_int,c_void_p,c_uint,c_int,c_ulong)
  sync(d,0); time.sleep(.10); button(d,1,1,0); sync(d,0); time.sleep(.15);button(d,1,0,0)
 elif sys.argv[1]=='scroll':
  x_pos,y_pos,child = c_int(),c_int(),c_ulong()
  assert translate(d,window,root,280,400,byref(x_pos),byref(y_pos),byref(child))
  sig(xt,'XTestFakeMotionEvent',c_int,c_void_p,c_int,c_int,c_int,c_ulong)(d,-1,x_pos.value,y_pos.value,0)
  sync(d,0); time.sleep(.10)
  button=sig(xt,'XTestFakeButtonEvent',c_int,c_void_p,c_uint,c_int,c_ulong)
  wheel=4 if sys.argv[2]=='up' else 5
  for _ in range(5):
   button(d,wheel,1,0);button(d,wheel,0,0);sync(d,0);time.sleep(.05)
 elif sys.argv[1] in ('text','replace-text'):
  keysym=sig(x,'XStringToKeysym',c_ulong,c_char_p)
  keycode=sig(x,'XKeysymToKeycode',c_uint,c_void_p,c_ulong)
  fake=sig(xt,'XTestFakeKeyEvent',c_int,c_void_p,c_uint,c_int,c_ulong)
  if sys.argv[1]=='replace-text':
   ctrl=keycode(d,keysym(b'Control_L')); a=keycode(d,keysym(b'a'))
   fake(d,ctrl,1,0);fake(d,a,1,0);fake(d,a,0,0);fake(d,ctrl,0,0);sync(d,0);time.sleep(.1)
  for char in sys.argv[2]:
   code=keycode(d,keysym(('minus' if char=='-' else char).encode()))
   assert code,char
   fake(d,code,1,0);sync(d,0);time.sleep(.025);fake(d,code,0,0);sync(d,0);time.sleep(.025)
 else:
  sym=sig(x,'XStringToKeysym',c_ulong,c_char_p)(sys.argv[2].encode())
  code=sig(x,'XKeysymToKeycode',c_uint,c_void_p,c_ulong)(d,sym)
  fake=sig(xt,'XTestFakeKeyEvent',c_int,c_void_p,c_uint,c_int,c_ulong)
  fake(d,code,1,0);sync(d,0);time.sleep(float(sys.argv[3]));fake(d,code,0,0)
 sync(d,0)
