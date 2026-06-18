# Changelog

All notable changes to **DeepSeek Pilot** are recorded here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] — 2026-06-18

Aligns the provider with the current DeepSeek V4 API (re-verified against [api-docs.deepseek.com](https://api-docs.deepseek.com/) on 2026-06-18) and adds two cost/quality features. The `deepseek-v4-pro` / `deepseek-v4-flash` model IDs this extension targets are confirmed current; the legacy `deepseek-chat` / `deepseek-reasoner` IDs are deprecated and retire 2026-07-24, so this extension is unaffected by that sunset.

### Added
- **Auto-disable thinking on Copilot's utility flows.** When a `(thinking)` variant is the active model, lightweight Copilot requests (chat titles, commit messages, branch names, rename suggestions, prompt categorization) are detected by their system-prompt signature and sent with thinking off — saving reasoning tokens and latency on work that gets no benefit from extended reasoning. Gated to the official endpoint; the agentic loop (which carries tools) is never affected. Controlled by the new `deepseek-pilot.optimizeUtilityRequests` setting (default on) and logged when it fires. See [`src/provider/request-kind.ts`](src/provider/request-kind.ts).
- **Native price display in the model picker.** Each variant now carries `inputCost` / `outputCost` / `cacheCost`, so DeepSeek's per-Mtok prices render in Copilot's native cost slots in addition to the existing `detail` hint.
- **Clearer network-error guidance.** A connection failure now surfaces a single actionable message (with the underlying error code) pointing at the network, any VPN/proxy, and the `deepseek-pilot.baseUrl` setting, instead of a raw `fetch failed`.

### Changed
- **Context-window sizes corrected to DeepSeek V4's documented limits** — a 1M-token shared window (input + output ≤ 1,048,576) with a 384K output ceiling. Thinking variants are now 655,360 in / 393,216 out (previously 720,896 / 262,144, which under-reported both the input budget and the real reasoning-output ceiling); non-thinking variants are 983,040 in / 65,536 out.
- **Per-request timeout raised from 5 to 10 minutes** to match DeepSeek's own connection policy, so a slow-but-healthy max-effort reasoning stream is no longer truncated client-side.
- **`LanguageModelChatToolMode.Required` with multiple tools** now sends `tool_choice: "required"` instead of erroring; a single required tool still maps to a named choice.
- **`frequency_penalty` / `presence_penalty` are no longer sent** — the DeepSeek V4 API dropped support for them. Host-supplied `temperature` / `top_p` are clamped to the documented ranges and `stop` is capped at 16 sequences.

### Fixed
- **Model picker overstated DeepSeek V4 Pro's price 4x** — it showed `$1.74/$3.48` per Mtok (the pre-discount rate) instead of the current `$0.435/$0.87`. Cost estimation in the status bar was already correct; only the picker hint was stale.
- **Tool calls whose names require sanitization** (for example MCP tools such as `server.tool`) are now routed back to the host under their original name, so agent-mode tool invocation works for them. Previously the sanitized name was emitted and the host could not match it to the tool it registered.

## [0.3.0] — 2026-06-02

Adds a full Chinese (Simplified) interface. The extension now follows VS Code's display language: set it to Chinese and the commands, settings, Manage Provider menu, dialogs, notifications, and getting-started walkthrough appear in Chinese; English stays the default everywhere else.

### Added

- **Chinese (`zh-cn`) localization** of the entire user-facing surface — the 13 commands, every setting description, the Manage Provider quick-pick, the API-key and reasoning-cache dialogs, error notifications, the streaming "thinking" hint, and the four walkthrough steps. Built on VS Code's manifest NLS (`package.nls.json` / `package.nls.zh-cn.json`) and the `vscode.l10n` runtime bundle (`l10n/bundle.l10n.json` / `l10n/bundle.l10n.zh-cn.json`); no new dependencies, and English is unchanged. Original translation contributed by [@XiaoZ-0218](https://github.com/XiaoZ-0218) ([#1](https://github.com/setsey/deepseek-pilot/pull/1)).

## [0.2.2] — 2026-05-25

### Changed
- **V4-Pro pricing baked in as permanent.** DeepSeek announced on **2026-05-22** that the previously-promotional 75% off on `deepseek-v4-pro` is now the permanent regular price ("It is officially set to 1/4 of the original price!" — confirmed by Bloomberg, Engadget, the-decoder, DataConomy). Cost estimation now uses the new figures directly: cache-hit $0.003625/M, cache-miss $0.435/M, output $0.87/M (USD); ¥0.025/M, ¥3.0/M, ¥6.0/M (CNY).
- **V4-Flash cache-hit dropped to 1/10 of cache-miss**, effective **2026-04-26 12:15 UTC** (per DeepSeek's cache-pricing announcement; this change applies to all models — Pro's cache-hit was already at 1/12, the new 1/10 ratio means Flash's hit dropped from $0.028 to $0.0028/M while miss + output stayed at $0.14 / $0.28 per M). CNY mirrors at ¥0.02 / ¥1.0 / ¥2.0.
- Status-bar tooltip no longer renders the "Pro 75% discount available until …" line — the discount is the price.

### Removed
- **`deepseek-pilot.applyProDiscount` setting** plus the date-gated `PRO_DISCOUNT_END_UTC` / `PRO_DISCOUNT_FACTOR` logic in `src/provider/balance.ts`. The opt-in toggle is unnecessary now that the discounted rates are the regular rates. Users who had it set in their settings.json will see VS Code mark it as "Unknown configuration setting" — safe to delete the line; the cost estimator will use the new rates either way.
- `getApplyProDiscount()` helper in `src/config.ts`.
- `applyProDiscount` entry from the one-shot `deepseek-qa.*` → `deepseek-pilot.*` migration list in `src/migrate.ts` (the old namespace is long gone, but tidy is tidy).

## [0.2.1] — 2026-05-23

### Fixed
- VS Code 1.120's built-in chat-view context-window widget now reflects real usage after each turn. The earlier `application/vnd.llm.usage+json` MIME on the `LanguageModelDataPart` was speculative — the bundled Copilot Chat BYOK consumer matches on the literal MIME `"usage"` and silently dropped anything else, leaving the widget pegged at `0 / <window>` indefinitely.

### Changed
- `DSUsage` type now declares `total_tokens?` to match DeepSeek's response surface (the BYOK consumer requires the field).

## [0.2.0] — 2026-05-23

First public-facing release after a substantial rewrite. Original code surveyed two MIT-licensed prior-art projects ([Vizards/deepseek-v4-for-copilot](https://github.com/Vizards/deepseek-v4-for-copilot), [Laurent00TT/deepseek-v4-vscode-chat](https://github.com/Laurent00TT/deepseek-v4-vscode-chat)) — both credited in the README.

### Added
- Modernization for VS Code 1.120 / 1.121: registration via `languageModelChatProviders`, `LanguageModelDataPart` sidecar for usage, per-variant `detail` / `tooltip` / `statusIcon` metadata, `toolCalling: 128`, `imageInput`, and a BYOK context-window widget feed.
- Wire as Copilot's utility model: one-click commands set `chat.utilityModel` / `chat.utilitySmallModel` to a DeepSeek Flash variant for background flows (titles, summaries, commit messages, intent detection).
- KV-cache-aware compaction guidance rendered in the status-bar tooltip and a dedicated **Show Context Window Details** view.
- Persistent reasoning cache (`reasoning_content` fingerprinted, replayed across multi-turn agent loops, survives VS Code restarts) with a **Clear Reasoning Cache** diagnostic command.
- Vision proxy with per-image-hash description caching so the same screenshot doesn't re-cost on every turn.
- Currency-aware billing: USD / CNY auto-detect from `user/balance`, with a 75% Pro promo opt-in that auto-expires 2026-05-31.
- One-shot migration shim ([`src/migrate.ts`](src/migrate.ts)) that ports API key, reasoning cache, welcome flag, and settings from the previous `deepseek-qa.*` namespace on first activation.

### Changed
- Renamed from `deepseek-v4-qa` → `deepseek-pilot` across npm package, publisher, vendor, command IDs, setting keys, secret key, and global-state keys. The migration shim handles existing installs transparently.
