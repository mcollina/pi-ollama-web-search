import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	formatSize,
	truncateHead,
} from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

type OllamaSearchResult = {
	title: string;
	url: string;
	content: string;
};

type OllamaWebSearchResponse = {
	results?: OllamaSearchResult[];
};

type OllamaWebFetchResponse = {
	title?: string;
	content?: string;
	links?: string[];
};

type OllamaWebSearchConfig = {
	apiKey?: string;
	baseUrl?: string;
};

type PiSettingsShape = {
	ollamaWebSearch?: OllamaWebSearchConfig;
};

function truncateForContext(text: string): string {
	const truncation = truncateHead(text, {
		maxBytes: DEFAULT_MAX_BYTES,
		maxLines: DEFAULT_MAX_LINES,
	});

	if (!truncation.truncated) return truncation.content;

	return `${truncation.content}\n\n[Output truncated: ${truncation.outputLines} of ${truncation.totalLines} lines (${formatSize(
		truncation.outputBytes,
	)} of ${formatSize(truncation.totalBytes)}).]`;
}

function readSettingsFile(path: string): PiSettingsShape {
	if (!existsSync(path)) return {};

	try {
		const raw = readFileSync(path, "utf8");
		const parsed = JSON.parse(raw) as PiSettingsShape;
		return parsed ?? {};
	} catch {
		return {};
	}
}

function resolveConfig(cwd: string): Required<OllamaWebSearchConfig> {
	const globalPath = join(homedir(), ".pi", "agent", "settings.json");
	const projectPath = join(cwd, ".pi", "settings.json");

	const globalSettings = readSettingsFile(globalPath).ollamaWebSearch ?? {};
	const projectSettings = readSettingsFile(projectPath).ollamaWebSearch ?? {};

	const apiKey =
		projectSettings.apiKey ?? globalSettings.apiKey ?? process.env.OLLAMA_API_KEY ?? "";
	const baseUrl = (
		projectSettings.baseUrl ??
		globalSettings.baseUrl ??
		process.env.OLLAMA_WEB_BASE_URL ??
		"https://ollama.com"
	).replace(/\/$/, "");

	if (!apiKey) {
		throw new Error(
			"Missing Ollama API key. Set ollamaWebSearch.apiKey in .pi/settings.json or ~/.pi/agent/settings.json, or export OLLAMA_API_KEY.",
		);
	}

	return { apiKey, baseUrl };
}

async function ollamaRequest<T>(
	endpoint: "/api/web_search" | "/api/web_fetch",
	payload: Record<string, unknown>,
	config: Required<OllamaWebSearchConfig>,
	signal?: AbortSignal,
): Promise<T> {
	const response = await fetch(`${config.baseUrl}${endpoint}`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			authorization: `Bearer ${config.apiKey}`,
		},
		body: JSON.stringify(payload),
		signal,
	});

	const body = await response.text();
	if (!response.ok) {
		throw new Error(`Ollama request failed (${response.status}): ${body || response.statusText}`);
	}

	try {
		return JSON.parse(body) as T;
	} catch {
		throw new Error(`Ollama returned non-JSON response: ${body.slice(0, 500)}`);
	}
}

function formatSearchResults(results: OllamaSearchResult[]): string {
	if (results.length === 0) return "No results returned.";

	const lines: string[] = ["Search results:", ""];
	for (let i = 0; i < results.length; i++) {
		const result = results[i];
		lines.push(`${i + 1}. ${result.title}`);
		lines.push(`   URL: ${result.url}`);
		lines.push(`   Snippet: ${result.content}`);
		lines.push("");
	}

	return lines.join("\n").trim();
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "ollama_web_search",
		label: "Ollama Web Search",
		description:
			"Search the web via Ollama's web_search API. Configure credentials via ollamaWebSearch.apiKey in pi settings (or OLLAMA_API_KEY). Returns up to 10 results.",
		parameters: Type.Object({
			query: Type.String({ description: "Search query" }),
			max_results: Type.Optional(
				Type.Integer({
					description: "Maximum results (1-10). Default: 5",
					minimum: 1,
					maximum: 10,
				}),
			),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const config = resolveConfig(ctx.cwd);
			const data = await ollamaRequest<OllamaWebSearchResponse>(
				"/api/web_search",
				{
					query: params.query,
					...(params.max_results ? { max_results: params.max_results } : {}),
				},
				config,
				signal,
			);

			const results = Array.isArray(data.results) ? data.results : [];
			const formatted = formatSearchResults(results);
			const text = truncateForContext(formatted);

			return {
				content: [{ type: "text", text }],
				details: { query: params.query, max_results: params.max_results ?? 5, results },
			};
		},
	});

	pi.registerTool({
		name: "ollama_web_fetch",
		label: "Ollama Web Fetch",
		description:
			"Fetch a webpage via Ollama's web_fetch API. Configure credentials via ollamaWebSearch.apiKey in pi settings (or OLLAMA_API_KEY).",
		parameters: Type.Object({
			url: Type.String({ description: "Absolute URL to fetch" }),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const config = resolveConfig(ctx.cwd);
			const data = await ollamaRequest<OllamaWebFetchResponse>("/api/web_fetch", { url: params.url }, config, signal);

			const title = data.title ?? "(no title)";
			const links = Array.isArray(data.links) ? data.links : [];
			const content = data.content ?? "";

			const text = truncateForContext(
				[
					`Title: ${title}`,
					`URL: ${params.url}`,
					links.length > 0 ? `Links (${links.length}):\n${links.map((link) => `- ${link}`).join("\n")}` : "Links: (none)",
					"",
					"Content:",
					content,
				].join("\n"),
			);

			return {
				content: [{ type: "text", text }],
				details: { title, url: params.url, links },
			};
		},
	});
}
