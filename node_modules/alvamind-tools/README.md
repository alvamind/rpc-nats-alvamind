# alvamind-tools

Utility tools for TypeScript projects that provide source code generation and git commit automation.

## Installation

```bash
npm install ts-project-utils --save-dev
```

## Usage

Add these scripts to your package.json:
```json
{
  "scripts": {
    "generate-source": "generate-source",
    "commit": "commit"
  }
}
```

### Generate Source Code

This utility generates a markdown file containing all your project's source code, with options to include or exclude specific files.

```bash
npm run generate-source [options]
```

Options:
- `output=filename.md`: Specify output filename (default: source-code.md)
- `include=file1.ts,file2.ts`: Files to include (supports glob patterns)
- `exclude=file1.ts,*.test.ts`: Files to exclude (supports glob patterns)

Example:
```bash
npm run generate-source output=docs.md include=main.ts,utils/*.ts exclude=*.test.ts,*.spec.ts
```

Default excludes:
- node_modules
- .git
- build directories
- test files
- and more (see source code for complete list)

### Git Commit

Quick git add, commit, and push in one command.

```bash
npm run commit "your commit message"
```

This will:
1. Add all changes (`git add .`)
2. Commit with your message (`git commit -m "your message"`)
3. Push to the current branch (`git push`)

If there are no changes to commit, it will try to push any unpushed commits.

## Features

- 📝 Source code documentation generation
- 🔄 Automated git workflow
- ⚡ Simple CLI interface
- 🎯 Customizable file inclusion/exclusion
- 💡 Comment removal in generated docs

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - feel free to use this in your projects!

## Author

Alvamind

## Support

If you encounter any issues or have questions, please file an issue on the GitHub repository.
