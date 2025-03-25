import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { MCPClient, MCPConfig, MCPMessage } from '../types/mcp';
import chalk from 'chalk';

interface MathOperation {
  operation: 'add' | 'subtract' | 'multiply' | 'divide';
  a: number;
  b: number;
}

export class MCPServer {
  private wss: WebSocket.Server;
  private clients: Map<string, MCPClient> = new Map();
  private config: MCPConfig;

  constructor(config: MCPConfig) {
    this.config = config;
    this.wss = new WebSocket.Server({ port: config.port, host: config.host });
    this.setupWebSocketServer();
  }

  private setupWebSocketServer() {
    this.wss.on('connection', (ws: WebSocket) => {
      const clientId = uuidv4();
      const client: MCPClient = {
        id: clientId,
        ws,
        send: (message: MCPMessage) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
          }
        }
      };

      this.clients.set(clientId, client);
      console.log(chalk.green(`New client connected: ${clientId}`));

      ws.on('message', (data: string) => {
        try {
          const message: MCPMessage = JSON.parse(data);
          this.handleMessage(client, message);
        } catch (error: unknown) {
          console.error(chalk.red('Error parsing message:', error));
          client.send({ type: 'error', payload: 'Invalid message format' });
        }
      });

      ws.on('close', () => {
        this.clients.delete(clientId);
        console.log(chalk.yellow(`Client disconnected: ${clientId}`));
      });

      // Send welcome message with available operations
      client.send({
        type: 'welcome',
        payload: {
          clientId,
          message: 'Connected to Forq CLI MCP Server',
          availableOperations: {
            math: {
              operations: ['add', 'subtract', 'multiply', 'divide'],
              example: {
                type: 'math',
                payload: {
                  operation: 'add',
                  a: 5,
                  b: 3
                }
              }
            }
          }
        }
      });
    });

    this.wss.on('error', (error: Error) => {
      console.error(chalk.red('WebSocket Server Error:', error));
    });
  }

  private handleMessage(client: MCPClient, message: MCPMessage) {
    switch (message.type) {
      case 'ping':
        client.send({ type: 'pong', payload: { timestamp: Date.now() } });
        break;
      case 'command':
        this.handleCommand(client, message.payload);
        break;
      case 'math':
        this.handleMathOperation(client, message.payload);
        break;
      default:
        client.send({ type: 'error', payload: 'Unknown message type' });
    }
  }

  private handleMathOperation(client: MCPClient, payload: MathOperation) {
    try {
      const { operation, a, b } = payload;
      let result: number;

      switch (operation) {
        case 'add':
          result = a + b;
          break;
        case 'subtract':
          result = a - b;
          break;
        case 'multiply':
          result = a * b;
          break;
        case 'divide':
          if (b === 0) {
            throw new Error('Division by zero');
          }
          result = a / b;
          break;
        default:
          throw new Error('Invalid operation');
      }

      client.send({
        type: 'math_response',
        payload: {
          operation,
          a,
          b,
          result
        }
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      client.send({
        type: 'error',
        payload: {
          message: 'Math operation failed',
          error: errorMessage
        }
      });
    }
  }

  private async handleCommand(client: MCPClient, payload: any) {
    try {
      // Here you would implement command handling logic
      // This is a placeholder for the actual implementation
      client.send({
        type: 'command_response',
        payload: {
          success: true,
          message: 'Command received'
        }
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      client.send({
        type: 'error',
        payload: {
          message: 'Command execution failed',
          error: errorMessage
        }
      });
    }
  }

  public broadcast(message: MCPMessage, excludeClientId?: string) {
    this.clients.forEach((client) => {
      if (client.id !== excludeClientId) {
        client.send(message);
      }
    });
  }

  public getConnectedClients(): string[] {
    return Array.from(this.clients.keys());
  }

  public stop() {
    this.wss.close(() => {
      console.log(chalk.yellow('MCP Server stopped'));
    });
  }
} 