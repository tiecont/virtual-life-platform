import {Capacitor,registerPlugin} from '@capacitor/core';
import type {NativeSessionCustodyPort} from '@virtual-city/client-sdk';

const nativeSession=registerPlugin<NativeSessionCustodyPort>('NativeSession');
// No web/iOS emulation of credential custody. The Android plugin also requires
// its own fixed HTTPS build configuration; a JavaScript flag cannot enable it.
export function androidSession():NativeSessionCustodyPort{
 if(Capacitor.getPlatform()!=='android')throw Error('Native sign-in unavailable');
 return nativeSession;
}
