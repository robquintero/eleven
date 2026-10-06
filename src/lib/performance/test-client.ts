import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types.ts";

/** Network-free query recorder. Unexpected reads fail instead of reaching Supabase. */
export interface RecordedQuery {
  table: string;
  operation: string;
  selection?: string;
  payload?: unknown;
  filters: Array<{ method: string; column: string; value: unknown }>;
  range?: [number, number];
  limit?: number;
  orders: string[];
}
export interface TestResponse { data: unknown; error: { message: string } | null; count?: number }
export function testClient(respond: (query: RecordedQuery) => TestResponse | Promise<TestResponse>) {
  const calls: RecordedQuery[] = [];
  function builder(table: string, operation = "select", payload?: unknown) {
    const q: RecordedQuery = { table, operation, payload, filters: [], orders: [] };
    const chain = {
      select(selection: string) { q.selection = selection; return chain; },
      eq(column: string, value: unknown) { q.filters.push({ method: "eq", column, value }); return chain; },
      neq(column: string, value: unknown) { q.filters.push({ method: "neq", column, value }); return chain; },
      in(column: string, value: unknown) { q.filters.push({ method: "in", column, value }); return chain; },
      is(column: string, value: unknown) { q.filters.push({ method: "is", column, value }); return chain; },
      not(column: string, operator: string, value: unknown) { q.filters.push({ method: operator, column, value }); return chain; },
      gte(column: string, value: unknown) { q.filters.push({ method: "gte", column, value }); return chain; },
      lt(column: string, value: unknown) { q.filters.push({ method: "lt", column, value }); return chain; },
      lte(column: string, value: unknown) { q.filters.push({ method: "lte", column, value }); return chain; },
      ilike(column: string, value: unknown) { q.filters.push({ method: "ilike", column, value }); return chain; },
      or(value: string) { q.filters.push({ method: "or", column: "", value }); return chain; },
      order(column: string) { q.orders.push(column); return chain; },
      range(from: number, to: number) { q.range = [from, to]; return chain; },
      limit(limit: number) { q.limit = limit; return chain; },
      maybeSingle() { return chain; },
      single() { return chain; },
      upsert(value: unknown) { q.operation = "upsert"; q.payload = value; return chain; },
      insert(value: unknown) { q.operation = "insert"; q.payload = value; return chain; },
      update(value: unknown) { q.operation = "update"; q.payload = value; return chain; },
      then(resolve: (response: TestResponse) => unknown, reject?: (reason: unknown) => unknown) {
        calls.push(q);
        return Promise.resolve().then(() => respond(q)).then(resolve, reject);
      },
    };
    return chain;
  }
  const client = {
    from: builder,
    rpc: (name: string, args: unknown) => builder(name, "rpc", args),
    auth: { getUser: () => { throw new Error("Unexpected auth lookup in request with resolved user"); } },
  } as unknown as SupabaseClient<Database>;
  return { client, calls };
}
export function result(data: unknown): TestResponse { return { data, error: null }; }
export function filter(q: RecordedQuery, column: string) { return q.filters.find((f) => f.column === column)?.value; }
