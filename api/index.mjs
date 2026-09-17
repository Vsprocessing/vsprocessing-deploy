export default function handler(req, res) {
	const host = req.headers['x-forwarded-host'] || req.headers.host;
	const proto = req.headers['x-forwarded-proto'] || 'https';
	const origin = `${proto}://${host}`;

	if (new URL(req.url, origin).pathname === '/callback') {
		res.setHeader('content-type', 'text/html; charset=utf-8');
		res.end(callbackHtml());
		return;
	}

	const configuration = {
		workspaceUri: { scheme: 'tmp', path: '/default.code-workspace' },
		webviewEndpoint: `${origin}/static/build/out/vs/workbench/contrib/webview/browser/pre/`,
		configurationDefaults: {
			'workbench.colorTheme': 'One Dark Pro',
			'workbench.preferredDarkColorTheme': 'One Dark Pro',
			'workbench.preferredLightColorTheme': 'One Dark Pro'
		},
		productConfiguration: {
			enableTelemetry: false
		}
	};

	res.setHeader('content-type', 'text/html; charset=utf-8');
	res.end(workbenchHtml(origin, configuration));
}

function workbenchHtml(origin, configuration) {
	const config = escapeAttribute(JSON.stringify(configuration));
	const main = browserMain(`${origin}/static/build/out/vs/workbench/workbench.web.main.internal.js`);

	return `<!DOCTYPE html>
<html>
	<head>
		<script>performance.mark('code/didStartRenderer')</script>
		<meta charset="utf-8">
		<meta name="mobile-web-app-capable" content="yes">
		<meta name="apple-mobile-web-app-capable" content="yes">
		<meta name="apple-mobile-web-app-title" content="Code">
		<link rel="apple-touch-icon" href="${origin}/static/build/code-192.png">
		<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no">
		<meta id="vscode-workbench-web-configuration" data-settings="${config}">
		<meta id="vscode-workbench-builtin-extensions" data-settings="[]">
		<link rel="icon" href="${origin}/static/build/favicon.ico" type="image/x-icon">
		<link rel="manifest" href="${origin}/static/build/manifest.json">
		<link data-name="vs/workbench/workbench.web.main" rel="stylesheet" href="${origin}/static/build/out/vs/workbench/workbench.web.main.css">
		<style id="vscode-css-modules" type="text/css" media="screen"></style>
	</head>
	<body aria-label=""></body>
	<script>
		const baseUrl = new URL('${origin}/static/build', window.location.origin).toString();
		globalThis._VSCODE_FILE_ROOT = baseUrl + '/out/';
	</script>
	<script>performance.mark('code/willLoadWorkbenchMain')</script>
	<script src="${origin}/static/build/out/nls.messages.js"></script>
	<script type="module">${main}</script>
</html>`;
}

function browserMain(workbenchApiUrl) {
	return `import { create, URI, Emitter } from '${workbenchApiUrl}';

class WorkspaceProvider {
	static QUERY_PARAM_EMPTY_WINDOW = 'ew';
	static QUERY_PARAM_FOLDER = 'folder';
	static QUERY_PARAM_WORKSPACE = 'workspace';
	static QUERY_PARAM_PAYLOAD = 'payload';

	static create(config) {
		let foundWorkspace = false;
		let workspace;
		let payload = Object.create(null);
		const query = new URL(document.location.href).searchParams;
		query.forEach((value, key) => {
			switch (key) {
				case WorkspaceProvider.QUERY_PARAM_FOLDER:
					workspace = { folderUri: URI.parse(value) };
					foundWorkspace = true;
					break;
				case WorkspaceProvider.QUERY_PARAM_WORKSPACE:
					workspace = { workspaceUri: URI.parse(value) };
					foundWorkspace = true;
					break;
				case WorkspaceProvider.QUERY_PARAM_EMPTY_WINDOW:
					workspace = undefined;
					foundWorkspace = true;
					break;
				case WorkspaceProvider.QUERY_PARAM_PAYLOAD:
					try {
						payload = JSON.parse(value);
					} catch (error) {
						console.error(error);
					}
					break;
			}
		});
		if (!foundWorkspace) {
			if (config.folderUri) {
				workspace = { folderUri: URI.revive(config.folderUri) };
			} else if (config.workspaceUri) {
				workspace = { workspaceUri: URI.revive(config.workspaceUri) };
			}
		}
		// Open a folder inside the temporary workspace rather than as the workspace itself, so
		// that switching to another folder later does not need a page load.
		let initialFolders;
		if (workspace && 'folderUri' in workspace && config.workspaceUri) {
			initialFolders = [workspace.folderUri];
			workspace = { workspaceUri: URI.revive(config.workspaceUri) };
		}
		return new WorkspaceProvider(workspace, payload, initialFolders);
	}

	trusted = true;

	constructor(workspace, payload, initialFolders) {
		this.workspace = workspace;
		this.payload = payload;
		this.initialFolders = initialFolders;
	}

	updateAddressBar(workspace) {
		const targetHref = this.createTargetUrl(workspace);
		if (targetHref) {
			window.history.replaceState(null, '', targetHref);
		}
	}

	async open(workspace, options) {
		if (options?.reuse && !options.payload && this.isSame(this.workspace, workspace)) {
			return true;
		}
		const targetHref = this.createTargetUrl(workspace, options);
		if (!targetHref) {
			return false;
		}
		if (options?.reuse) {
			window.location.href = targetHref;
			return true;
		}
		return !!window.open(targetHref);
	}

	createTargetUrl(workspace, options) {
		let targetHref;
		if (!workspace) {
			targetHref = \`\${document.location.origin}\${document.location.pathname}?\${WorkspaceProvider.QUERY_PARAM_EMPTY_WINDOW}=true\`;
		} else if ('folderUri' in workspace) {
			targetHref = \`\${document.location.origin}\${document.location.pathname}?\${WorkspaceProvider.QUERY_PARAM_FOLDER}=\${encodeURIComponent(workspace.folderUri.toString(true))}\`;
		} else if ('workspaceUri' in workspace) {
			targetHref = \`\${document.location.origin}\${document.location.pathname}?\${WorkspaceProvider.QUERY_PARAM_WORKSPACE}=\${encodeURIComponent(workspace.workspaceUri.toString(true))}\`;
		}
		if (targetHref && options?.payload) {
			targetHref += \`&\${WorkspaceProvider.QUERY_PARAM_PAYLOAD}=\${encodeURIComponent(JSON.stringify(options.payload))}\`;
		}
		return targetHref;
	}

	isSame(workspaceA, workspaceB) {
		if (!workspaceA || !workspaceB) {
			return workspaceA === workspaceB;
		}
		if ('folderUri' in workspaceA && 'folderUri' in workspaceB) {
			return this.isEqualURI(workspaceA.folderUri, workspaceB.folderUri);
		}
		if ('workspaceUri' in workspaceA && 'workspaceUri' in workspaceB) {
			return this.isEqualURI(workspaceA.workspaceUri, workspaceB.workspaceUri);
		}
		return false;
	}

	isEqualURI(a, b) {
		return a.scheme === b.scheme && a.authority === b.authority && a.path === b.path;
	}
}

class LocalStorageURLCallbackProvider {
	static REQUEST_ID = 0;
	static QUERY_KEYS = ['scheme', 'authority', 'path', 'query', 'fragment'];

	constructor(callbackRoute) {
		this.callbackRoute = callbackRoute;
		this.onCallbackEmitter = new Emitter();
		this.onCallback = this.onCallbackEmitter.event;
		this.pendingCallbacks = new Set();
		this.lastTimeChecked = Date.now();
	}

	create(options = {}) {
		const id = ++LocalStorageURLCallbackProvider.REQUEST_ID;
		const queryParams = [\`vscode-reqid=\${id}\`];
		for (const key of LocalStorageURLCallbackProvider.QUERY_KEYS) {
			if (options[key]) {
				queryParams.push(\`vscode-\${key}=\${encodeURIComponent(options[key])}\`);
			}
		}
		const storageKey = \`vscode-web.url-callbacks[\${id}]\`;
		localStorage.removeItem(storageKey);
		this.pendingCallbacks.add(id);
		this.startListening();
		return URI.parse(window.location.href).with({ path: this.callbackRoute ?? '/callback', query: queryParams.join('&') });
	}

	startListening() {
		if (this.storageListener) {
			return;
		}
		this.storageListener = () => this.onDidChangeLocalStorage();
		window.addEventListener('storage', this.storageListener);
	}

	stopListening() {
		if (this.storageListener) {
			window.removeEventListener('storage', this.storageListener);
			this.storageListener = undefined;
		}
	}

	onDidChangeLocalStorage() {
		const elapsed = Date.now() - this.lastTimeChecked;
		if (elapsed > 1000) {
			this.checkCallbacks();
		} else if (this.checkCallbacksTimeout === undefined) {
			this.checkCallbacksTimeout = setTimeout(() => {
				this.checkCallbacksTimeout = undefined;
				this.checkCallbacks();
			}, 1000 - elapsed);
		}
	}

	checkCallbacks() {
		for (const id of Array.from(this.pendingCallbacks)) {
			const key = \`vscode-web.url-callbacks[\${id}]\`;
			const result = localStorage.getItem(key);
			if (result !== null) {
				try {
					this.onCallbackEmitter.fire(URI.revive(JSON.parse(result)));
				} catch (error) {
					console.error(error);
				}
				this.pendingCallbacks.delete(id);
				localStorage.removeItem(key);
			}
		}
		if (this.pendingCallbacks.size === 0) {
			this.stopListening();
		}
		this.lastTimeChecked = Date.now();
	}

	dispose() {
		this.stopListening();
		this.onCallbackEmitter.dispose();
	}
}

const configElement = window.document.getElementById('vscode-workbench-web-configuration');
const configElementAttribute = configElement?.getAttribute('data-settings');
if (!configElementAttribute) {
	throw new Error('Missing web configuration element');
}
const config = JSON.parse(configElementAttribute);
create(window.document.body, {
	...config,
	workspaceProvider: WorkspaceProvider.create(config),
	urlCallbackProvider: new LocalStorageURLCallbackProvider(config.callbackRoute)
});`;
}

function callbackHtml() {
	return `<!DOCTYPE html>
<html>
	<body>
		<script>
			const query = new URL(location.href).searchParams;
			const requestId = query.get('vscode-reqid');
			if (requestId) {
				// Merge params appended by redirects (e.g. OAuth code/state) into the callback URI query.
				const params = new URLSearchParams(query.get('vscode-query') || '');
				query.forEach((value, key) => {
					if (!key.startsWith('vscode-')) {
						params.set(key, value);
					}
				});
				localStorage.setItem('vscode-web.url-callbacks[' + requestId + ']', JSON.stringify({
					scheme: query.get('vscode-scheme'),
					authority: query.get('vscode-authority'),
					path: query.get('vscode-path'),
					query: params.toString() || null,
					fragment: query.get('vscode-fragment')
				}));
			}
			close();
		</script>
	</body>
</html>`;
}

function escapeAttribute(value) {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('"', '&quot;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;');
}
