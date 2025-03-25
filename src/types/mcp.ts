import WebSocket from 'ws';

export interface MCPMessage {
  type: string;
  payload: any;
}

export interface MCPConfig {
  port: number;
  host: string;
}

export interface MCPClient {
  id: string;
  ws: WebSocket;
  send: (message: MCPMessage) => void;
}

export interface MCPCommand {
  name: string;
  description: string;
  execute: (args: string[]) => Promise<void>;
} 