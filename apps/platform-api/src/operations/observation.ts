import {OperationalObservationSchema} from '@virtual-city/contracts';
import type {OperationalTelemetry} from './telemetry';
type Snapshot=Awaited<ReturnType<OperationalTelemetry['snapshot']>>;
// Project only fixed aggregate fields: never forward raw trace identifiers, room pseudonyms or private input.
export function observation(snapshot:Snapshot){
 const histogram=(item:{count:number;totalMs:number;buckets:{upperMs:number|null;count:number}[];p95UpperBoundMs:number|null})=>({count:item.count,totalMs:item.totalMs,buckets:item.buckets,p95UpperBoundMs:item.p95UpperBoundMs});
 return OperationalObservationSchema.parse({schemaVersion:2,source:'platform-api',scope:'PROCESS_LOCAL',sampledAt:snapshot.serverTime,processStartedAt:snapshot.startedAt,
  coverage:{dating:'EXCLUDED',cluster:'NOT_OBSERVED',databaseHealth:'NOT_OBSERVED',workerBacklog:'NOT_OBSERVED'},
  durations:{method:'FIXED_BUCKET_UPPER_BOUND_APPROXIMATION',window:'PROCESS_LIFETIME',overflow:'NULL_UPPER_BOUND',since:snapshot.startedAt},
  http:{requests:snapshot.http.requests,errors:snapshot.http.errors,series:snapshot.http.series.map(item=>({group:item.group,method:item.method,errors:item.errors,histogram:histogram(item)}))},
  rooms:{commands:Object.entries(snapshot.rooms.commands).map(([command,item])=>({command,outcomes:Object.entries(item.errors).map(([outcome,count])=>({outcome,count})),histogram:histogram(item)})),pendingCommands:snapshot.rooms.pendingCommands,droppedDeltas:snapshot.rooms.droppedDeltas,slowConsumerDisconnects:snapshot.rooms.slowConsumerDisconnects},
  eventLoop:{status:snapshot.rooms.eventLoop.status,source:snapshot.rooms.eventLoop.source,method:'NODE_HISTOGRAM_APPROXIMATION',window:'MONITOR_LIFETIME',resolutionMs:snapshot.rooms.eventLoop.resolutionMs,samples:snapshot.rooms.eventLoop.count,p95Ms:snapshot.rooms.eventLoop.p95Ms},
  online:snapshot.gauges.online,orders:{sampledAt:snapshot.gauges.orders.observedAt,phases:Object.entries(snapshot.gauges.orders.phases).map(([phase,count])=>({phase,count}))},
  tracing:{retentionMs:300000,maxCompleted:100,maxInFlight:128,active:snapshot.http.activeTraces,dropped:snapshot.http.droppedTraces,identifiersInMetricLabels:false},
 });
}
