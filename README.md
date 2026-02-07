# pi Ollama Web Search Extension

Adds two pi extension tools backed by Ollama's hosted web APIs:

- `ollama_web_search` → `POST https://ollama.com/api/web_search`
- `ollama_web_fetch` → `POST https://ollama.com/api/web_fetch`

## Requirements

- A free Ollama account
- API key from <https://ollama.com/settings/keys>
- `OLLAMA_API_KEY` exported in your shell

```bash
export OLLAMA_API_KEY="your_key_here"
```

Optional:

```bash
# Override API host (defaults to https://ollama.com)
export OLLAMA_WEB_BASE_URL="https://ollama.com"
```

## Install (project-local)

From this repository root:

```bash
pi install . -l
```

Or run directly:

```bash
pi -e ./extensions/ollama-web-search.ts
```

## Usage

Ask pi normally; the model can call:

- `ollama_web_search` with:
  - `query` (string, required)
  - `max_results` (integer, optional, 1-10)
- `ollama_web_fetch` with:
  - `url` (string, required)

## Notes

- Output is truncated to pi defaults (50KB / 2000 lines) to protect context window.
- Tool errors are surfaced directly if API key is missing or request fails.
