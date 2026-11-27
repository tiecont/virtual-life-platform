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
assert window,'Unity X11 window not found'
print(hex(window))
