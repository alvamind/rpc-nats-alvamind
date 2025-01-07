#!/usr/bin/env node

import chalk from 'chalk';

console.log(chalk.green('\n✨ Thank you for installing rpc-nats-alvamind! ✨\n'));

console.log(chalk.cyan('To generate RPC services, use the following command:'));
console.log(
  chalk.yellow('\nrpc-nats generate --includes="src/**/*.controller.ts" --output="src/common/rpc/rpc-services.ts"\n'),
);

console.log(chalk.cyan('Options:'));
console.log(chalk.white('  --includes    Glob patterns for including files (required)'));
console.log(chalk.white('  --excludes    Glob patterns for excluding files'));
console.log(chalk.white('  --output      Output file path'));
console.log(chalk.white('  --watch       Watch for file changes and regenerate'));
console.log(chalk.white('  --logLevel    Log level (debug, info, warn, error)\n'));

console.log(chalk.cyan('Example with multiple includes and excludes:'));
console.log(
  chalk.yellow(
    'rpc-nats generate \\\n  --includes="src/**/*.controller.ts" "src/**/*.service.ts" \\\n  --excludes="src/**/*.spec.ts" "src/**/*.test.ts" \\\n  --output="src/common/rpc/rpc-services.ts" \\\n  --watch\n',
  ),
);

console.log(chalk.cyan('Documentation:'));
console.log(chalk.white('  https://github.com/alvamind/rpc-nats-alvamind\n'));

console.log(chalk.green('Happy coding! 🚀\n'));
