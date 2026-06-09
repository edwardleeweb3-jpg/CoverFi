import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Hardhat is a standalone subproject with generated artifacts and
    // node:test suites; the root lint script is scoped to the Next app.
    "contracts/**",
  ]),
  {
    rules: {
      // This app intentionally uses effects for client-only hydration,
      // IntersectionObserver reveal state, and wallet-scoped DB reads.
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
