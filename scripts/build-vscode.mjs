// Builds VS Code Web (with the Processing and isomorphic-git extensions) from the
// vsprocessing repo and replaces public/static/build with the result.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { cp, rm } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const repo = path.resolve(process.env.VSPROCESSING_REPO ?? path.join(root, '../vsprocessing'));
const buildOutput = path.join(path.dirname(repo), 'vscode-web');
const staticBuild = path.join(root, 'public/static/build');
const isomorphicGit = path.join(repo, 'extensions/isomorphic-git');
const webprocessing = path.join(repo, 'extensions/webprocessing');

function run(command, args, cwd, env = {}) {
	console.log(`\n> (${path.relative(root, cwd) || '.'}) ${command} ${args.join(' ')}`);
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { cwd, stdio: 'inherit', env: { ...process.env, ...env } });
		child.on('error', reject);
		child.on('close', code => code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`)));
	});
}

function assert(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

function hasGitHubClientSecret() {
	if (process.env.GITHUB_CLIENT_SECRET) {
		return true;
	}
	const envFile = path.join(isomorphicGit, '.env');
	return existsSync(envFile) && /^\s*GITHUB_CLIENT_SECRET\s*=\s*\S+/m.test(readFileSync(envFile, 'utf8'));
}

assert(existsSync(path.join(repo, 'product.json')), `vsprocessing repo not found at ${repo} (set VSPROCESSING_REPO).`);
assert(existsSync(path.join(repo, 'node_modules/gulp')), `Run npm install in ${repo} first.`);
assert(existsSync(path.join(webprocessing, 'node_modules/@worldeditaxe/teavm-javac/compiler.wasm')), `webprocessing dependencies missing: run git submodule update --init --recursive and npm install in ${webprocessing}.`);
assert(hasGitHubClientSecret(), `GITHUB_CLIENT_SECRET is not set (environment or ${path.join(isomorphicGit, '.env')}); GitHub sign-in would not work.`);

if (!existsSync(path.join(isomorphicGit, 'node_modules'))) {
	await run('npm', ['install'], isomorphicGit);
}
await run('npx', ['webpack', '--mode', 'production'], isomorphicGit);

await run(process.execPath, ['node_modules/gulp/bin/gulp.js', 'vscode-web-min'], repo, {
	NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --max-old-space-size=16384`.trim()
});

for (const required of [
	'out/vs/workbench/workbench.web.main.internal.js',
	'auth.html',
	'extensions/webprocessing/dist/browser/extension.js',
	'extensions/webprocessing/node_modules/@worldeditaxe/teavm-javac/compiler.wasm',
	'extensions/webprocessing/node_modules/eclipse-jdt-ls-web/wasm/teavm/classes.wasm',
	'extensions/isomorphic-git/dist/main.js',
	'extensions/vscode-virtualfs/dist/browser/extension.js',
	'extensions/OneDark-Pro/package.json',
]) {
	assert(existsSync(path.join(buildOutput, required)), `Build output is missing ${required} (in ${buildOutput}).`);
}

await rm(staticBuild, { recursive: true, force: true });
await cp(buildOutput, staticBuild, { recursive: true });
console.log(`\nVS Code Web build copied to ${path.relative(root, staticBuild)}. Deploy with: vercel build --prod && vercel deploy --prebuilt --prod`);
