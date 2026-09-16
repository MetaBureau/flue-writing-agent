'use agent';
import { createProvider, envApiKeyAuth } from '@earendil-works/pi-ai';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';
import { setProvider, useInitialData, useModel, useTool } from '@flue/runtime';
import { mkdir, writeFile } from 'node:fs/promises';
import * as v from 'valibot';
import { gatherResearch } from '../notes.ts';
import { STYLE_NAMES, styleFromData, styleSystemPrompt } from '../skills/styles.ts';

const openAI = openAICompletionsApi();

export const writerProviders = [
	createProvider({
		id: 'mercury',
		auth: { apiKey: envApiKeyAuth('Mercury key', ['FAST_MODEL_KEY']) },
		models: [
			{
				id: 'mercury-2.5',
				name: 'Mercury 2.5',
				api: 'openai-completions',
				provider: 'mercury',
				baseUrl: 'https://api.inceptionlabs.ai/v1',
				reasoning: false,
				input: ['text'],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 128000,
				maxTokens: 8192,
			},
		],
		api: openAI,
	}),
	createProvider({
		id: 'haimaker',
		auth: { apiKey: envApiKeyAuth('HaiMaker key', ['HAIMAKER_API_KEY']) },
		models: [
			{
				id: 'google/gemini-3.1-flash-lite',
				name: 'Gemini 3.1 Flash Lite',
				api: 'openai-completions',
				provider: 'haimaker',
				baseUrl: 'https://api.haimaker.ai/v1',
				reasoning: false,
				input: ['text'],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 128000,
				maxTokens: 8192,
			},
		],
		api: openAI,
	}),
];

for (const provider of writerProviders) setProvider(provider);

const MODEL_FOR_PROVIDER = {
	haimaker: 'haimaker/google/gemini-3.1-flash-lite',
	mercury: 'mercury/mercury-2.5',
} as const;

async function searchNotes(query: string): Promise<string> {
	const research = await gatherResearch(query);
	if (!research.text) return 'No sources. Write only from the user topic, and say the search returned nothing.';
	return research.text;
}

async function readPage(url: string): Promise<string> {
	const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
	if (!response.ok) return `Fetch failed (HTTP ${response.status})`;
	const raw = await response.text();
	const text = raw.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
	return text.slice(0, 8000);
}

type WriterData = { style?: string; provider?: 'haimaker' | 'mercury'; outputPath?: string } | undefined;

function modelFor(data: WriterData): string {
	return data?.provider === 'haimaker' ? MODEL_FOR_PROVIDER.haimaker : MODEL_FOR_PROVIDER.mercury;
}

function savePathFrom(data: WriterData): string | undefined {
	return data?.outputPath;
}

function slug(topic: string): string {
	return topic.trim().split(/\s+/).slice(0, 6).join(' ').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

Writer.initialData = v.optional(v.object({
	style: v.optional(v.picklist(STYLE_NAMES)),
	provider: v.optional(v.picklist(['haimaker', 'mercury'])),
	outputPath: v.optional(v.pipe(v.string(), v.minLength(1))),
}));

export function Writer() {
	const data = useInitialData<WriterData>();
	const style = styleFromData(data);
	const outputPath = savePathFrom(data);
	useModel(modelFor(data), { thinkingLevel: 'off' });

	useTool({
		name: 'search_notes',
		description: 'Search for claims about the topic. Returns source snippets with ads, biographies, and page chrome removed. Call this once before writing.',
		input: v.object({ query: v.pipe(v.string(), v.minLength(1)) }),
		run: ({ data }) => searchNotes(data.query),
	});

	useTool({
		name: 'read_page',
		description: 'Fetch one documentation URL and return its text. Prefer this when the user gives a URL.',
		input: v.object({ url: v.pipe(v.string(), v.url()) }),
		run: ({ data }) => readPage(data.url),
	});

	useTool({
		name: 'save_essay',
		description: 'Save the finished essay. Call this once after the essay is written, then stop.',
		input: v.object({
			title: v.pipe(v.string(), v.minLength(1)),
			markdown: v.pipe(v.string(), v.minLength(1)),
		}),
		async run({ data }) {
			const path = outputPath ?? `output/${slug(data.title)}.md`;
			await mkdir('output', { recursive: true });
			await writeFile(path, `# ${data.title}\n\n## Style: ${style.key}\n\n---\n\n${data.markdown}`);
			return `Saved ${path}`;
		},
	});

	return [
		'Write a publishable essay from the user topic.',
		'Call read_page when the user gives a URL. Otherwise call search_notes once. The query is the subject, not the instruction to write.',
		'Use only claims in those notes. Do not add a closer, a roadmap, or a fact the notes do not contain.',
		styleSystemPrompt(style.rules),
		'No ads, author biographies, or view counts.',
		'About 900 words unless the user names another count. Then call save_essay with the full markdown and stop.',
	].join(' ');
}
