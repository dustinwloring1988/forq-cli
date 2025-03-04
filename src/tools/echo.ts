/**
 * A simple echo tool for testing and demonstration purposes
 */

import { Tool, ToolContext, ToolParameters } from '../types/tools';

/**
 * The echo tool simply returns the parameters it receives
 */
export const tool: Tool = {
  name: 'echo',
  description: 'Echoes back the provided parameters. Used for testing the tool system.',
  parameterSchema: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'The message to echo back',
      },
    },
    required: ['message'],
  },
  requiresPermission: false,
  execute: async (parameters: ToolParameters, context: ToolContext): Promise<any> => {
    context.logger.logAction('Echo Tool', { message: parameters.message });
    return {
      message: parameters.message,
      timestamp: new Date().toISOString(),
    };
  },
};
