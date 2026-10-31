import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';

// Real-time WebSocket gateway — Socket.IO rooms per branch/station
@Module({
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
