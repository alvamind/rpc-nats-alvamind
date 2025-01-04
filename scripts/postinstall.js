#!/usr/bin/env node

const chalk = require('chalk');

console.log(chalk.green('🎉 rpc-nats-alvamind installed!'));
console.log(chalk.yellow('To generate types for your services:'));
console.log(chalk.cyan('  1. Navigate to your project directory.'));
console.log(chalk.cyan('  2. Run: ') + chalk.bold('rpc-nats-alvamind generate <scanPath> <outputPath>'));
console.log(
  chalk.yellow('  Example: ') +
    chalk.bold('rpc-nats-alvamind generate ./src/services ./src/generated/exposed-methods.d.ts'),
);
console.log(chalk.yellow('Remember to replace the example scan path and output path with your own.'));
