#!/usr/bin/env node
import { Command } from 'commander';
import { startServer } from './index';

const program = new Command();

program
  .name('agent-trace')
  .description('CLI for AgentTrace: A local server to ingest and visualize agent execution traces.')
  .version('1.0.0');

program
  .command('start')
  .description('Start the AgentTrace local server')
  .option('-p, --port <port>', 'Port to run the server on', '3000')
  .action((options) => {
    const port = parseInt(options.port, 10);

    if (isNaN(port) || port <= 0 || port > 65535) {
      console.error('Error: Invalid port number specified. Must be between 1 and 65535.');
      process.exit(1);
    }

    try {
      startServer(port);
    } catch (error) {
      console.error('Fatal error initializing the AgentTrace server:', error);
      process.exit(1);
    }
  });

program.parse(process.argv);