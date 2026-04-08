

# Build AI-Powered Natural Language Search

Add a search bar to the Properties page where users type natural language queries and get filters applied automatically using Azure OpenAI.

## Files to Create

### 1. `supabase/functions/ai-search/index.ts`
- Accepts `{ query: string }`, calls Azure OpenAI GPT-4o mini with tool calling
- Tool schema maps to LeadFilters fields: `state`, `cities`, `snapScoreRange`, `openViolationsOnly`, `multipleViolationsOnly`, `repeatOffenderOnly`, `lastSeenDays`, `violationType`, `sortBy`
- System prompt includes US state abbreviation mapping and field descriptions
- Returns structured JSON filters or `{ filters: {}, message: "..." }` for unrecognized queries
- CORS headers, input validation, error handling for Azure failures

### 2. `src/components/leads/AiSearchBar.tsx`
- Text input with sparkle icon, placeholder: "Ask AI: e.g. 'open violations in Florida, score 80+'"
- Submit on Enter, shows loading spinner (~1-2s)
- On success: calls `onFiltersApplied` callback with parsed filters
- On unrecognized query: shows toast with friendly message
- Example chips below input for first-time guidance
- Compact design that fits above existing filter controls

## Files to Modify

### 3. `src/pages/Leads.tsx`
- Import and render AiSearchBar above the filter controls area
- Wire callback to set filter state: `setSelectedState`, `setSelectedCity`, `setOpenViolationsOnly`, `setMultipleViolationsOnly`, `setRepeatOffenderOnly`, `setLastSeenDays`, `setSelectedSignal`, `setSortBy`
- Clear existing filters before applying AI results so they don't conflict

### 4. `supabase/config.toml`
- Add `[functions.ai-search]` with `verify_jwt = false` (auth checked in code)

### 5. `src/integrations/http/functions.ts`
- Add `"ai-search"` to the `callFn` union type

## How Guardrails Work

- Azure tool calling constrains output to the exact filter schema — no free-form JSON
- If user types nonsense, Azure returns no tool call → edge function returns `{ filters: {}, message: "I can help with property filters..." }`
- Frontend shows a toast with the message and suggested example queries
- Invalid filter values stripped by existing `cleanFilters()` utility

## Technical Notes

- Uses existing `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT` secrets
- ~60 lines edge function, ~80 lines component, ~15 lines Leads.tsx changes
- No database changes, no new tables, no new RPCs

