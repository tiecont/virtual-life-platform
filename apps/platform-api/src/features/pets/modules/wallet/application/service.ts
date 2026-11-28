import type {Pool,PoolClient} from 'pg';
import {WalletConvertInputSchema,type FourResourceWallet,type WalletConvertReceipt} from '@aetheria/contracts';
import type {IdentityService} from '../../../../identity/modules/accounts/application/service';
import {WalletStore} from '../infrastructure/store';

export class WalletService{
  private readonly store=new WalletStore();
  constructor(
    private readonly db:Pick<Pool,'connect'>,
    private readonly identity:IdentityService,
    private readonly now:()=>number=Date.now,
  ){}

  private async transact<T>(credential:string,work:(tx:PoolClient,accountId:string)=>Promise<T>):Promise<T>{
    const tx=await this.db.connect();
    try{
      await tx.query('BEGIN');
      await tx.query("SET LOCAL statement_timeout='5000ms'");
      await tx.query("SET LOCAL lock_timeout='2000ms'");
      const {accountId}=await this.identity.contextInTransaction(tx,credential);
      await this.identity.lockAccounts(tx,[accountId]);
      await this.identity.contextInTransaction(tx,credential);
      const result=await work(tx,accountId);
      await tx.query('COMMIT');
      return result;
    }catch(error){
      await tx.query('ROLLBACK');
      throw error;
    }finally{
      tx.release();
    }
  }

  readWallet(credential:string):Promise<FourResourceWallet>{
    return this.transact(credential,(tx,accountId)=>this.store.readWalletInTx(tx,accountId,this.now()));
  }

  convertDiamondsToStones(credential:string,input:unknown):Promise<WalletConvertReceipt>{
    return this.transact(credential,(tx,accountId)=>{
      const parsed=WalletConvertInputSchema.parse(input);
      return this.store.convertDiamondsToStones(tx,accountId,parsed,this.now());
    });
  }

  exportAccount(tx:Pick<PoolClient,'query'>,accountId:string){
    return this.store.exportAccount(tx,accountId,this.now());
  }
}
