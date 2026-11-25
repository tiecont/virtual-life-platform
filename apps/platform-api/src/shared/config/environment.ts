import { z } from 'zod';
const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SESSION_SECRET: z.string().min(32),
  SESSION_TTL_SECONDS: z.coerce.number().int().min(300).max(2592000).default(2592000),
  NATIVE_AUTH_ENABLED:z.enum(['0','1']).default('0'),
  NATIVE_AUTH_KEY:z.preprocess(value=>value===''?undefined:value,z.string().regex(/^[a-f0-9]{64}$/i).optional()),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4300),
  DATABASE_URL: z.string().url().refine(value => {
    const url = new URL(value);
    return ['postgres:', 'postgresql:'].includes(url.protocol);
  }),
  WEB_ORIGIN: z.string().url().default('http://127.0.0.1:3300'),
  DATABASE_POOL_MAX: z.coerce.number().int().min(2).max(50).default(10),
  DATABASE_MIGRATION_ROLE:z.preprocess(value=>value===''?undefined:value,z.string().regex(/^[a-z_][a-z0-9_]{0,62}$/).optional()),
  OPERATOR_AUTH_KEY:z.string().regex(/^[a-f0-9]{64}$/).optional(),
  ADMIN_ORIGIN:z.string().url().optional(),
  TRUSTED_PROXY_IP:z.ipv4().refine(value=>!['0.0.0.0','255.255.255.255'].includes(value)).optional(),
  OPERATOR_TELEMETRY_TOKEN:z.preprocess(value=>value===''?undefined:value,z.string().regex(/^[a-f0-9]{64}$/).optional()),
  SAFETY_EVIDENCE_KEY: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  SAFETY_EVIDENCE_KEY_ID: z.string().regex(/^[a-z0-9-]{1,32}$/).default('local-v1'),
  SAFETY_POLICY_FILE:z.string().min(1).max(4096).optional(),
  SCHEMA_COMPATIBILITY_FILE:z.string().min(1).max(4096).optional(),
  DURABLE_JOB_ROLE:z.enum(['api','worker']).default('api'),
  PROGRESSION_POLICY_FILE:z.string().min(1).max(4096).optional(),
  WORLD_FLAGS_FILE: z.string().min(1).max(4096).optional(),
  RELEASE_POLICY_FILE:z.string().min(1).max(4096).optional(),
  RUNTIME_WORLD_POLICY_FILE:z.string().min(1).max(4096).optional(),
  RELEASE_ENVIRONMENT:z.enum(['development','test','staging','production']).optional(),
  LOCAL_TRAVEL_FIXTURES: z.enum(['0', '1']).default('0'),
  LOCAL_ADMISSION_UX:z.enum(['0','1']).default('0'),
  LOCAL_LIBRARY_WORLD: z.enum(['0', '1']).default('0'),
  LOCAL_PARK_WORLD: z.enum(['0', '1']).default('0'),
  LOCAL_DEADLINE_WORLD:z.enum(['0','1']).default('0'),
  LOCAL_MAID_WORLD:z.enum(['0','1']).default('0'),
  LOCAL_LANTERN_LODGE_WORLD:z.enum(['0','1']).default('0'),
  LOCAL_GAME_LOBBY:z.enum(['0','1']).default('0'),
  LOCAL_GAME_JOURNAL:z.enum(['0','1']).default('0'),
  LOCAL_PET_ARENA_WAVE1:z.enum(['0','1']).default('0'),
  LOCAL_PET_ARTIFACTS:z.enum(['0','1']).default('0'),
  LOCAL_ARENA8:z.enum(['0','1']).default('0'),
  LOCAL_ARENA8_SUPERVISOR_URL:z.preprocess(value=>value===''?undefined:value,z.string().url().optional()),
  LOCAL_ARENA8_SUPERVISOR_TOKEN:z.preprocess(value=>value===''?undefined:value,z.string().min(32).max(256).optional()),
  LOCAL_ARENA8_NATIVE:z.enum(['0','1']).default('0'),
  LOCAL_ARENA8_NATIVE_BINARY:z.preprocess(value=>value===''?undefined:value,z.string().min(1).max(4096).optional()),
  LOCAL_ARENA8_NATIVE_DATABASE_URL:z.preprocess(value=>value===''?undefined:value,z.string().url().optional()),
  LOCAL_ARENA8_NATIVE_DB_ROLE:z.preprocess(value=>value===''?undefined:value,z.string().regex(/^[a-z_][a-z0-9_]{0,62}$/).optional()),
  LOCAL_ARENA8_NATIVE_CA_FILE:z.preprocess(value=>value===''?undefined:value,z.string().min(1).max(4096).optional()),
  LOCAL_ARENA8_NATIVE_STORAGE_KEY:z.preprocess(value=>value===''?undefined:value,z.string().regex(/^[a-f0-9]{64}$/i).optional()),
  LOCAL_ARENA8_NATIVE_STORAGE_KEY_ID:z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/).default('local-v1'),
  LOCAL_ARENA8_NATIVE_HTTPS_ORIGIN:z.preprocess(value=>value===''?undefined:value,z.string().url().optional()),
  LOCAL_ARENA8_NATIVE_TLS_CERT_FILE:z.preprocess(value=>value===''?undefined:value,z.string().min(1).max(4096).optional()),
  LOCAL_ARENA8_NATIVE_TLS_KEY_FILE:z.preprocess(value=>value===''?undefined:value,z.string().min(1).max(4096).optional()),
  LOCAL_COOP_ROOMS:z.enum(['0','1']).default('0'),
  // Absolute path to the Rust runtime binary used as the authoritative
  // gameplay-configuration validator. Absence disables publication (fail closed).
  GAMEPLAY_CONFIG_VALIDATOR_BINARY:z.preprocess(value=>value===''?undefined:value,z.string().min(1).max(4096).optional()),
  GAME_STATE_KEY:z.preprocess(value=>value===''?undefined:value,z.string().regex(/^[a-f0-9]{64}$/i).optional()),
  GAME_STATE_KEY_ID:z.string().regex(/^game-[a-z0-9-]{1,27}$/).default('game-local-v1'),
  LOCAL_DEADLINE_IDENTITY:z.enum(['0','1']).default('0'),
  DEADLINE_LEGACY_API_URL:z.preprocess(value=>value===''?undefined:value,z.string().url().optional()),
  LOCAL_RESTAURANT_WORLD: z.enum(['0', '1']).default('0'),
  LOCAL_LOUNGE_WORLD: z.enum(['0', '1']).default('0'),
  LOCAL_DATING_PROTOTYPE:z.enum(['0','1']).default('0'),
  DATING_TEST_PROOFS:z.enum(['0','1']).default('0'),
  DATING_PROFILE_KEY:z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  DATING_PROFILE_KEY_ID:z.string().regex(/^[a-z0-9-]{1,32}$/).default('local-v1'),
}).superRefine((env, ctx) => {
  const origin = new URL(env.WEB_ORIGIN);
  if(env.LOCAL_PET_ARENA_WAVE1==='1'&&(env.NODE_ENV==='production'||!['127.0.0.1','::1'].includes(env.HOST)||env.TRUSTED_PROXY_IP)){
    ctx.addIssue({code:'custom',path:['LOCAL_PET_ARENA_WAVE1'],message:'Wave 1 requires a local/test loopback listener'});
  }
  if(env.LOCAL_PET_ARTIFACTS==='1'&&(env.NODE_ENV==='production'||!['127.0.0.1','::1'].includes(env.HOST)||env.TRUSTED_PROXY_IP)){
    ctx.addIssue({code:'custom',path:['LOCAL_PET_ARTIFACTS'],message:'Wave A artifacts require a local/test loopback listener'});
  }
  if(env.LOCAL_ARENA8==='1'){
    if(env.NODE_ENV==='production'||!['127.0.0.1','::1'].includes(env.HOST)||env.TRUSTED_PROXY_IP)
      ctx.addIssue({code:'custom',path:['LOCAL_ARENA8'],message:'Arena8 requires a local/test loopback listener'});
    if(!env.LOCAL_ARENA8_SUPERVISOR_URL||!env.LOCAL_ARENA8_SUPERVISOR_TOKEN)
      ctx.addIssue({code:'custom',path:['LOCAL_ARENA8'],message:'Arena8 supervisor URL and token are required'});
    if(env.LOCAL_ARENA8_SUPERVISOR_URL){
      const supervisor=new URL(env.LOCAL_ARENA8_SUPERVISOR_URL);
      if(supervisor.protocol!=='http:'||!['127.0.0.1','[::1]'].includes(supervisor.hostname)||supervisor.username||supervisor.password||supervisor.search||supervisor.hash)
        ctx.addIssue({code:'custom',path:['LOCAL_ARENA8_SUPERVISOR_URL'],message:'Expected an exact loopback HTTP supervisor URL'});
    }
  }
  if(env.LOCAL_ARENA8_NATIVE==='1'){
    if(env.NODE_ENV==='production'||!['127.0.0.1','::1'].includes(env.HOST)||env.TRUSTED_PROXY_IP)
      ctx.addIssue({code:'custom',path:['LOCAL_ARENA8_NATIVE'],message:'Native Arena8 requires a local/test loopback listener'});
    const requiredNative:readonly [string,string|undefined][]=[
      ['LOCAL_ARENA8_NATIVE_BINARY',env.LOCAL_ARENA8_NATIVE_BINARY],
      ['LOCAL_ARENA8_NATIVE_DATABASE_URL',env.LOCAL_ARENA8_NATIVE_DATABASE_URL],
      ['LOCAL_ARENA8_NATIVE_DB_ROLE',env.LOCAL_ARENA8_NATIVE_DB_ROLE],
      ['LOCAL_ARENA8_NATIVE_CA_FILE',env.LOCAL_ARENA8_NATIVE_CA_FILE],
      ['LOCAL_ARENA8_NATIVE_STORAGE_KEY',env.LOCAL_ARENA8_NATIVE_STORAGE_KEY],
      ['LOCAL_ARENA8_NATIVE_HTTPS_ORIGIN',env.LOCAL_ARENA8_NATIVE_HTTPS_ORIGIN],
      ['LOCAL_ARENA8_NATIVE_TLS_CERT_FILE',env.LOCAL_ARENA8_NATIVE_TLS_CERT_FILE],
      ['LOCAL_ARENA8_NATIVE_TLS_KEY_FILE',env.LOCAL_ARENA8_NATIVE_TLS_KEY_FILE],
    ];
    for(const [field,value] of requiredNative)
      if(!value)ctx.addIssue({code:'custom',path:[field],message:'Native Arena8 runtime configuration is required'});
    if(env.LOCAL_ARENA8_NATIVE_DATABASE_URL){
      let runtime:URL|undefined;
      try{runtime=new URL(env.LOCAL_ARENA8_NATIVE_DATABASE_URL);}catch{ctx.addIssue({code:'custom',path:['LOCAL_ARENA8_NATIVE_DATABASE_URL'],message:'Expected a loopback PostgreSQL URL'});}
      if(runtime&&(!['postgres:','postgresql:'].includes(runtime.protocol)||!['127.0.0.1','localhost','[::1]'].includes(runtime.hostname)||runtime.search||runtime.hash||!runtime.username||!runtime.password||runtime.password.length<16||!/^[a-z][a-z0-9_]{2,63}$/.test(runtime.pathname.slice(1))))
        ctx.addIssue({code:'custom',path:['LOCAL_ARENA8_NATIVE_DATABASE_URL'],message:'Expected an exact loopback PostgreSQL URL with restricted credentials'});
      let runtimeUser:string|undefined;
      try{runtimeUser=runtime&&env.LOCAL_ARENA8_NATIVE_DB_ROLE?decodeURIComponent(runtime.username):undefined;}
      catch{runtimeUser=undefined;}
      if(runtime&&env.LOCAL_ARENA8_NATIVE_DB_ROLE&&runtimeUser!==env.LOCAL_ARENA8_NATIVE_DB_ROLE)
        ctx.addIssue({code:'custom',path:['LOCAL_ARENA8_NATIVE_DB_ROLE'],message:'Restricted role must match the database URL user'});
    }
    if(env.LOCAL_ARENA8_NATIVE_HTTPS_ORIGIN){
      let origin:URL|undefined;
      try{origin=new URL(env.LOCAL_ARENA8_NATIVE_HTTPS_ORIGIN);}catch{ctx.addIssue({code:'custom',path:['LOCAL_ARENA8_NATIVE_HTTPS_ORIGIN'],message:'Expected an exact loopback HTTPS origin'});}
      if(origin&&(origin.protocol!=='https:'||origin.origin!==env.LOCAL_ARENA8_NATIVE_HTTPS_ORIGIN||!['127.0.0.1','[::1]'].includes(origin.hostname)))
        ctx.addIssue({code:'custom',path:['LOCAL_ARENA8_NATIVE_HTTPS_ORIGIN'],message:'Expected an exact loopback HTTPS origin'});
    }
    if(env.LOCAL_ARENA8_NATIVE_STORAGE_KEY&&[env.SESSION_SECRET,env.NATIVE_AUTH_KEY,env.OPERATOR_AUTH_KEY,env.SAFETY_EVIDENCE_KEY,env.DATING_PROFILE_KEY,env.GAME_STATE_KEY].some(value=>value?.toLowerCase()===env.LOCAL_ARENA8_NATIVE_STORAGE_KEY?.toLowerCase()))
      ctx.addIssue({code:'custom',path:['LOCAL_ARENA8_NATIVE_STORAGE_KEY'],message:'Separate native storage key required'});
  }
  if(env.LOCAL_GAME_LOBBY==='1'&&env.LOCAL_LANTERN_LODGE_WORLD!=='1')ctx.addIssue({code:'custom',path:['LOCAL_GAME_LOBBY'],message:'Local Lodge installation required'});
  if(env.LOCAL_GAME_JOURNAL==='1'&&(env.LOCAL_GAME_LOBBY!=='1'||!env.GAME_STATE_KEY||env.NODE_ENV==='production'))ctx.addIssue({code:'custom',path:['LOCAL_GAME_JOURNAL'],message:'Local lobby and separate journal encryption key required'});
  if(env.GAME_STATE_KEY&&[env.SESSION_SECRET,env.NATIVE_AUTH_KEY,env.OPERATOR_AUTH_KEY,env.SAFETY_EVIDENCE_KEY,env.DATING_PROFILE_KEY].some(value=>value?.toLowerCase()===env.GAME_STATE_KEY?.toLowerCase()))ctx.addIssue({code:'custom',path:['GAME_STATE_KEY'],message:'Separate game-state encryption key required'});
  if(env.NODE_ENV==='production'&&(env.LOCAL_LANTERN_LODGE_WORLD==='1'||env.LOCAL_GAME_LOBBY==='1'))ctx.addIssue({code:'custom',path:['LOCAL_GAME_LOBBY'],message:'Local Lodge cannot run in production'});
  if(env.NATIVE_AUTH_ENABLED==='1'){
    if(!env.NATIVE_AUTH_KEY)ctx.addIssue({code:'custom',path:['NATIVE_AUTH_KEY'],message:'Separate native encryption key required'});
    if(env.WEB_ORIGIN==='https://localhost'||env.ADMIN_ORIGIN==='https://localhost')ctx.addIssue({code:'custom',path:['NATIVE_AUTH_ENABLED'],message:'Installed native origin must remain separate from browser/admin origins'});
    if(env.NATIVE_AUTH_KEY&&[env.SESSION_SECRET,env.OPERATOR_AUTH_KEY,env.SAFETY_EVIDENCE_KEY,env.DATING_PROFILE_KEY].some(value=>value?.toLowerCase()===env.NATIVE_AUTH_KEY?.toLowerCase()))ctx.addIssue({code:'custom',path:['NATIVE_AUTH_KEY'],message:'Distinct native encryption key required'});
  }
  if(Boolean(env.OPERATOR_AUTH_KEY)!==Boolean(env.ADMIN_ORIGIN))ctx.addIssue({code:'custom',path:['ADMIN_ORIGIN'],message:'Operator key and exact admin origin required together'});
  if(env.ADMIN_ORIGIN){const admin=new URL(env.ADMIN_ORIGIN);if(admin.origin!==env.ADMIN_ORIGIN||!['http:','https:'].includes(admin.protocol)||admin.origin===env.WEB_ORIGIN||(env.NODE_ENV==='production'&&admin.protocol!=='https:'))ctx.addIssue({code:'custom',path:['ADMIN_ORIGIN'],message:'Separate exact admin origin required; HTTPS in production'});}
  if(env.OPERATOR_AUTH_KEY===env.SESSION_SECRET)ctx.addIssue({code:'custom',path:['OPERATOR_AUTH_KEY'],message:'Separate operator key required'});
  if(env.RELEASE_POLICY_FILE||env.RUNTIME_WORLD_POLICY_FILE||env.RELEASE_ENVIRONMENT){
    if(!env.RELEASE_POLICY_FILE||!env.RUNTIME_WORLD_POLICY_FILE||!env.RELEASE_ENVIRONMENT)ctx.addIssue({code:'custom',path:['RELEASE_POLICY_FILE'],message:'Explicit release/runtime files and environment required together'});
    if(env.WORLD_FLAGS_FILE||Object.entries(env).some(([name,value])=>name.startsWith('LOCAL_')&&value==='1')||env.DATING_TEST_PROOFS==='1')ctx.addIssue({code:'custom',path:['RELEASE_POLICY_FILE'],message:'Versioned installation cannot mix legacy fixture controls'});
    if((env.NODE_ENV==='production'&&!['staging','production'].includes(env.RELEASE_ENVIRONMENT??''))||(env.NODE_ENV!=='production'&&env.RELEASE_ENVIRONMENT!==env.NODE_ENV))ctx.addIssue({code:'custom',path:['RELEASE_ENVIRONMENT'],message:'Release environment must match runtime mode'});
  }
  if (origin.origin !== env.WEB_ORIGIN || !['http:', 'https:'].includes(origin.protocol)) {
    ctx.addIssue({ code: 'custom', path: ['WEB_ORIGIN'], message: 'Expected an exact HTTP origin' });
  }
  if (env.NODE_ENV === 'production' && origin.protocol !== 'https:') {
    ctx.addIssue({ code: 'custom', path: ['WEB_ORIGIN'], message: 'HTTPS required in production' });
  }
  if (env.NODE_ENV === 'production' && env.LOCAL_TRAVEL_FIXTURES === '1') ctx.addIssue({ code: 'custom', path: ['LOCAL_TRAVEL_FIXTURES'], message: 'Local travel fixtures cannot run in production' });
  if(env.NODE_ENV==='production'&&env.LOCAL_ADMISSION_UX==='1')ctx.addIssue({code:'custom',path:['LOCAL_ADMISSION_UX'],message:'Queue preview cannot run in production'});
  if(env.NODE_ENV==='production'&&env.LOCAL_COOP_ROOMS==='1')ctx.addIssue({code:'custom',path:['LOCAL_COOP_ROOMS'],message:'Cooperative rooms are local/test only'});
  if (env.NODE_ENV === 'production' && env.LOCAL_LIBRARY_WORLD === '1') ctx.addIssue({ code: 'custom', path: ['LOCAL_LIBRARY_WORLD'], message: 'Local library activation cannot run in production' });
  if (env.NODE_ENV === 'production' && env.LOCAL_PARK_WORLD === '1') ctx.addIssue({ code: 'custom', path: ['LOCAL_PARK_WORLD'], message: 'Local park activation cannot run in production' });
  if(env.NODE_ENV==='production'&&env.LOCAL_DEADLINE_WORLD==='1')ctx.addIssue({code:'custom',path:['LOCAL_DEADLINE_WORLD'],message:'Local Deadline activation cannot run in production'});
  if(env.NODE_ENV==='production'&&env.LOCAL_MAID_WORLD==='1')ctx.addIssue({code:'custom',path:['LOCAL_MAID_WORLD'],message:'Local Maid activation cannot run in production'});
  if(env.NODE_ENV==='production'&&env.LOCAL_DEADLINE_IDENTITY==='1')ctx.addIssue({code:'custom',path:['LOCAL_DEADLINE_IDENTITY'],message:'Local Deadline identity cannot run in production'});
  if(env.LOCAL_DEADLINE_IDENTITY==='1'&&!env.DEADLINE_LEGACY_API_URL)ctx.addIssue({code:'custom',path:['DEADLINE_LEGACY_API_URL'],message:'Explicit local Deadline endpoint required'});
  if(env.DEADLINE_LEGACY_API_URL){const legacy=new URL(env.DEADLINE_LEGACY_API_URL);if(legacy.protocol!=='http:'||legacy.hostname!=='127.0.0.1'||!legacy.port||legacy.username||legacy.password||legacy.pathname!=='/'||legacy.search||legacy.hash)ctx.addIssue({code:'custom',path:['DEADLINE_LEGACY_API_URL'],message:'Expected an exact loopback Deadline origin'});}
  if (env.NODE_ENV === 'production' && env.LOCAL_RESTAURANT_WORLD === '1') ctx.addIssue({ code: 'custom', path: ['LOCAL_RESTAURANT_WORLD'], message: 'Local restaurant activation cannot run in production' });
  if (env.NODE_ENV === 'production' && env.LOCAL_LOUNGE_WORLD === '1') ctx.addIssue({ code: 'custom', path: ['LOCAL_LOUNGE_WORLD'], message: 'Local lounge activation cannot run in production' });
  if(env.NODE_ENV==='production'&&env.LOCAL_DATING_PROTOTYPE==='1')ctx.addIssue({code:'custom',path:['LOCAL_DATING_PROTOTYPE'],message:'Local dating prototype cannot run in production'});
  if(env.GAMEPLAY_CONFIG_VALIDATOR_BINARY&&!env.GAMEPLAY_CONFIG_VALIDATOR_BINARY.startsWith('/'))ctx.addIssue({code:'custom',path:['GAMEPLAY_CONFIG_VALIDATOR_BINARY'],message:'Absolute validator binary path required'});
  if(env.DATING_TEST_PROOFS==='1'){const url=new URL(env.DATABASE_URL);if(env.NODE_ENV!=='test'||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||!/^aetheria_soulbound_test(?:_|$)/.test(url.pathname.slice(1)))ctx.addIssue({code:'custom',path:['DATING_TEST_PROOFS'],message:'Synthetic proofs require disposable local test runtime'});}
});
export type Config = z.infer<typeof Env>;
export function readConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success) throw new Error('Invalid environment fields: ' + [...new Set(parsed.error.issues.map(i => i.path.join('.')))].join(', '));
  return parsed.data;
}
