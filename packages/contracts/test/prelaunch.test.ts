import {describe,expect,it} from 'vitest';
import {
  OperatorPrelaunchSummarySchema,
  PrelaunchAcceptedSchema,
  PrelaunchConfirmSchema,
  PrelaunchRegisterSchema,
  PrelaunchResendSchema,
  PrelaunchWithdrawSchema,
} from '../src';

const campaignId='11111111-1111-4111-8111-111111111111';
const requestId='22222222-2222-4222-8222-222222222222';

describe('prelaunch registration contracts',()=>{
  it('normalizes email input and rejects unknown, private, or game-account fields',()=>{
    const input={schemaVersion:1,requestId,campaignId,email:' Owner@Example.COM ',marketingConsent:false};
    expect(PrelaunchRegisterSchema.parse(input).email).toBe('owner@example.com');
    for(const extra of [{accountId:campaignId},{entitlement:true},{password:'private-password'},{subject:'private'}])expect(PrelaunchRegisterSchema.safeParse({...input,...extra}).success).toBe(false);
    expect(PrelaunchRegisterSchema.safeParse({...input,email:'not-an-email'}).success).toBe(false);
    expect(PrelaunchRegisterSchema.safeParse({...input,marketingConsent:undefined}).success).toBe(false);
  });

  it('keeps confirmation tokens out of query-shaped and unbounded contracts',()=>{
    const token='a'.repeat(64);
    expect(PrelaunchConfirmSchema.safeParse({schemaVersion:1,token}).success).toBe(true);
    expect(PrelaunchConfirmSchema.safeParse({schemaVersion:1,token,url:'https://example.invalid/?token='+token}).success).toBe(false);
    expect(PrelaunchConfirmSchema.safeParse({schemaVersion:1,token:token.slice(1)}).success).toBe(false);
    expect(PrelaunchWithdrawSchema.safeParse({schemaVersion:1,requestId,expectedVersion:0}).success).toBe(true);
    expect(PrelaunchWithdrawSchema.safeParse({schemaVersion:1,requestId,expectedVersion:-1}).success).toBe(false);
    expect(PrelaunchResendSchema.safeParse({schemaVersion:1,requestId,campaignId,email:'owner@example.com'}).success).toBe(true);
    expect(PrelaunchAcceptedSchema.parse({schemaVersion:1,accepted:true})).toEqual({schemaVersion:1,accepted:true});
  });

  it('operator aggregate output contains no personal or mail fields',()=>{
    const value={schemaVersion:1,campaignId,slug:'launch-5000',state:'OPEN',capacity:5000,confirmed:12,currentConfirmed:11,remaining:4988,pending:3,withdrawn:1,suppressed:0,outbox:{pending:2,sent:12,failed:0,suppressed:0},recentAudit:[{action:'registration.requested',actor:'system',occurredAt:'2026-11-24T00:00:00.000Z'}]};
    expect(OperatorPrelaunchSummarySchema.safeParse(value).success).toBe(true);
    for(const extra of [{email:'private@example.com'},{registrations:[]},{token:'a'.repeat(64)}])expect(OperatorPrelaunchSummarySchema.safeParse({...value,...extra}).success).toBe(false);
  });
});
