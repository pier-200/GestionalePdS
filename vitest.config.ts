import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // la Edge Function (runtime Deno) importa supabase-js con uno specificatore "npm:"
    alias: { 'npm:@supabase/supabase-js@2': '@supabase/supabase-js' },
  },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/sql/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
