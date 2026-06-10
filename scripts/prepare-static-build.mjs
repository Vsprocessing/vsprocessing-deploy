import { access, mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = process.cwd();
const staticBuild = path.join(root, 'public/static/build');
const workbenchBundle = path.join(staticBuild, 'out/vs/workbench/workbench.web.main.internal.js');
const localVscodeRepo = process.env.VSCODE_REPO ?? '/home/cloudtron/vscode';

const originalWebviewOriginCheck = `if (hostname === parentOriginHash || hostname.startsWith(parentOriginHash + '.')) {`;
const sameOriginWebviewOriginCheck = `if (hostname === parentOriginHash || hostname.startsWith(parentOriginHash + '.') || location.origin === parentOrigin) {`;

await access(workbenchBundle).catch(() => {
	throw new Error(`Missing VS Code Web build. Drop the compiled build into ${staticBuild} before deploying.`);
});

const files = [
	'node_modules/vscode-oniguruma/release/main.js',
	'node_modules/vscode-oniguruma/release/onig.wasm',
	'node_modules/vscode-textmate/release/main.js'
];

for (const file of files) {
	const source = await firstExistingPath([
		path.join(root, file),
		path.join(localVscodeRepo, file)
	]);
	const target = path.join(staticBuild, file);
	await mkdir(path.dirname(target), { recursive: true });
	await copyFile(source, target);
}

const webviewPreload = path.join(staticBuild, 'out/vs/workbench/contrib/webview/browser/pre/index.html');
let html = await readFile(webviewPreload, 'utf8');
html = patchSameOriginWebviews(html);
html = updateInlineScriptCspHash(html);
await writeFile(webviewPreload, html);

async function firstExistingPath(paths) {
	for (const candidate of paths) {
		try {
			await access(candidate);
			return candidate;
		} catch {
			// Try the next candidate.
		}
	}

	throw new Error(`Unable to find required deploy asset. Checked:\n${paths.join('\n')}`);
}

function patchSameOriginWebviews(html) {
	if (html.includes(sameOriginWebviewOriginCheck)) {
		return html;
	}

	if (!html.includes(originalWebviewOriginCheck)) {
		throw new Error(`Unable to find webview origin check in ${webviewPreload}.`);
	}

	return html.replace(originalWebviewOriginCheck, sameOriginWebviewOriginCheck);
}

function updateInlineScriptCspHash(html) {
	const scriptMatch = html.match(/<script async type="module">([\s\S]*?)<\/script>/);
	if (!scriptMatch) {
		throw new Error(`Unable to find webview preloader inline module script in ${webviewPreload}.`);
	}

	const hash = createHash('sha256').update(scriptMatch[1]).digest('base64');
	const source = `'sha256-${hash}'`;

	if (/script-src 'sha256-[^']+' 'self'/.test(html)) {
		return html.replace(/script-src 'sha256-[^']+' 'self'/, `script-src ${source} 'self'`);
	}

	if (/script-src 'self'/.test(html)) {
		return html.replace(/script-src 'self'/, `script-src ${source} 'self'`);
	}

	throw new Error(`Unable to update webview CSP hash in ${webviewPreload}.`);
}
