import * as dotenv from 'dotenv';
import { logger } from './logger';

// Load environment variables from .env file
dotenv.config();

export function validateEnvironment(requireApiKey = true): void {
  if (requireApiKey && !process.env.ANTHROPIC_API_KEY) {
    logger.logError(new Error('ANTHROPIC_API_KEY environment variable is required'), 'Environment validation failed');
    throw new Error('ANTHROPIC_API_KEY environment variable is required. Set it in .env file.');
  }
} 