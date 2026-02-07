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

const OLLAMA_WEB_BASE_URL = (process.env.OLLAMA_WEB_BASE_URL ?? "https://ollama.com").replace(/\/$/, "");

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

async function ollamaRequest<T>(endpoint: "/api/web_search" | "/api/web_fetch", payload: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
	const apiKey = process.env.OLLAMA_API_KEY;
	if (!apiKey) {
		throw new Error("OLLAMA_API_KEY is not set. Generate a key at https://ollama.com/settings/keys and export it first.");
	}

	const response = await fetch(`${OLLAMA_WEB_BASE_URL}${endpoint}`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			authorization: `Bearer ${apiKey}`,
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
			"Search the web via Ollama's web_search API. Requires OLLAMA_API_KEY. Returns up to 10 results with title, URL, and snippet.",
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
		async execute(_toolCallId, params, signal) {
			const data = await ollamaRequest<OllamaWebSearchResponse>(
				"/api/web_search",
				{
					query: params.query,
					...(params.max_results ? { max_results: params.max_results } : {}),
				},
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
			"Fetch a single webpage via Ollama's web_fetch API. Requires OLLAMA_API_KEY. Returns page title, main content, and discovered links.",
		parameters: Type.Object({
			url: Type.String({ description: "Absolute URL to fetch" }),
		}),
		async execute(_toolCallId, params, signal) {
			const data = await ollamaRequest<OllamaWebFetchResponse>("/api/web_fetch", { url: params.url }, signal);

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
