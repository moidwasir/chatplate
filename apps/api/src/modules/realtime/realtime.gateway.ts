import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import type { SocketEvent } from '@safi/types';

@WebSocketGateway({
  cors: { origin: '*' }, // Restrict in production
  namespace: '/',
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(RealtimeGateway.name);

  handleConnection(client: Socket) {
    this.logger.debug(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  /**
   * Staff clients join their branch room on connect.
   * KDS clients also join a station room.
   */
  @SubscribeMessage('join')
  handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { branchId: string; stationId?: string },
  ) {
    client.join(`branch:${data.branchId}`);
    if (data.stationId) {
      client.join(`station:${data.stationId}`);
    }
    this.logger.debug(`${client.id} joined branch:${data.branchId}`);
    return { joined: true };
  }

  /**
   * Emit a typed event to all clients in a branch room.
   */
  emitToBranch(branchId: string, event: SocketEvent) {
    this.server.to(`branch:${branchId}`).emit(event.event, event.payload);
  }

  /**
   * Emit a typed event to a specific kitchen station.
   */
  emitToStation(stationId: string, event: SocketEvent) {
    this.server.to(`station:${stationId}`).emit(event.event, event.payload);
  }

  /**
   * KDS heartbeat — clients ping every 15 seconds.
   * Dashboard monitors which stations have gone silent.
   */
  @SubscribeMessage('kds.heartbeat')
  handleKdsHeartbeat(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { branchId: string; stationId: string },
  ) {
    // Forward heartbeat to branch room so dashboard can monitor
    this.server.to(`branch:${data.branchId}`).emit('kds.heartbeat', {
      stationId: data.stationId,
      timestamp: new Date().toISOString(),
    });
    return { ack: true };
  }
}
