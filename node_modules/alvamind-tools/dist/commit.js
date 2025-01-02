#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const args = process.argv.slice(2);
const commitMessage = args.join(' ');
if (!commitMessage) {
    console.error('Commit message is required.');
    process.exit(1);
}
try {
    // Ubah untuk menggunakan directory project yang menggunakan package
    const projectDir = process.cwd();
    process.chdir(projectDir);
    // Check if there are changes to commit
    const status = (0, child_process_1.execSync)('git status --porcelain').toString();
    if (!status) {
        console.log('No changes to commit.');
        // Try to push any unpushed commits
        try {
            (0, child_process_1.execSync)('git push', { stdio: 'inherit' });
            console.log('Existing commits pushed successfully.');
        }
        catch (pushError) {
            console.error('Error pushing commits:', pushError);
            process.exit(1);
        }
        process.exit(0);
    }
    // If there are changes, proceed with commit and push
    (0, child_process_1.execSync)('git add .', { stdio: 'inherit' });
    (0, child_process_1.execSync)(`git commit -m "${commitMessage}"`, { stdio: 'inherit' });
    (0, child_process_1.execSync)('git push', { stdio: 'inherit' });
    console.log('Changes committed and pushed successfully.');
}
catch (error) {
    console.error('Error during commit and push:', error);
    process.exit(1);
}
