// Ensure TS path aliases work in Vitest
import 'tsconfig-paths/register';

// Basic env defaults for tests
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.DATABASE_PATH = process.env.DATABASE_PATH || './data/test.db';
// Cast to any to avoid TS readonly typing during Next.js type checking
;(process.env as any).NODE_ENV = 'test';


