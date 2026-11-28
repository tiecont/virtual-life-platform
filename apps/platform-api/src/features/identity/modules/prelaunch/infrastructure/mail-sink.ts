export type PrelaunchMailMessage=Readonly<{
  kind:'confirmation'|'confirmed';
  idempotencyKey:string;
  to:string;
  subject:string;
  text:string;
}>;

export interface PrelaunchMailSink {
  send(message:PrelaunchMailMessage):Promise<void>;
}

export class UnavailableMailSink implements PrelaunchMailSink {
  async send():Promise<void>{throw Error('Prelaunch mail delivery is not configured');}
}
