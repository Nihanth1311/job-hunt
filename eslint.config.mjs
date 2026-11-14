import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// The three layers (see docs/HOW-IT-WORKS.md, "Folder map"). Breaking a boundary is a lint error,
// so the separation can't quietly erode.
const restrict = (patterns, opts = {}) => ({
  "@typescript-eslint/no-restricted-imports": ["error", { patterns: patterns.map((p) => ({ ...p, ...opts })) }],
});

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Frontend: talks to the backend only through server actions.
    files: ["src/client/**"],
    rules: restrict([
      {
        // Anything under server/ except server/actions/ (by alias or by ../ path).
        regex: "^(@/|(\\.\\./)+)server/(?!actions/)",
        message: "Frontend code may only use the backend through src/server/actions. Shared types go in src/shared/types.ts.",
      },
    ]),
  },
  {
    // Shared: pure logic used by both sides. It may name backend types (erased at build), nothing else.
    files: ["src/shared/**"],
    rules: restrict(
      [{ group: ["@/server/**", "@/client/**", "**/server/**", "**/client/**"], message: "src/shared can't depend on the backend or the frontend." }],
      { allowTypeImports: true },
    ),
  },
  {
    // Backend: never imports screens.
    files: ["src/server/**"],
    rules: restrict([{ group: ["@/client/**", "**/client/**", "@/app/**"], message: "Backend code can't import frontend code or pages." }]),
  },
  {
    // The laptop helper runs outside the site: it may share pure logic, never the site's code.
    files: ["helper/**"],
    rules: restrict([{ group: ["@/server/**", "@/client/**", "@/app/**", "**/src/server/**", "**/src/client/**", "**/src/app/**"], message: "The helper talks to the site only through its /api/helper addresses; it may import src/shared." }], { allowTypeImports: false }),
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
