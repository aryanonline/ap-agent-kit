// @ts-check
import js from "@eslint/js";
import comments from "@eslint-community/eslint-plugin-eslint-comments/configs";
import prettier from "eslint-config-prettier/flat";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

const PURE_CORE = "src/core is pure (CLAUDE.md rule 2):";
const NO_FLOATS = "Money is never a float (CLAUDE.md rule 3):";

export default defineConfig(
  globalIgnores(["coverage/", "dist/", ".next/"]),

  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
    rules: {
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true },
      ],
    },
  },

  // CLAUDE.md: no `any` without a comment saying why. Every eslint-disable must give its
  // reason after "--", e.g. `// eslint-disable-next-line @typescript-eslint/no-explicit-any -- <why>`.
  comments.recommended,
  {
    rules: {
      "@eslint-community/eslint-comments/require-description": "error",
    },
  },

  // Plain JavaScript files (this config) are outside tsconfig, so lint them without types.
  {
    files: ["**/*.js"],
    extends: [tseslint.configs.disableTypeChecked],
  },

  // src/core is pure: no I/O, no clock, no randomness, no floats. Tests may read fixtures.
  {
    files: ["src/core/**/*.ts"],
    ignores: ["src/core/**/*.test.ts", "src/core/__tests__/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/db",
                "**/db/**",
                "**/integrations",
                "**/integrations/**",
              ],
              message: `${PURE_CORE} no imports from db/ or integrations/.`,
            },
            {
              group: ["**/app", "**/app/**", "**/pipeline", "**/pipeline/**"],
              message: `${PURE_CORE} no imports from app/ or pipeline/.`,
            },
            {
              group: ["node:*"],
              message: `${PURE_CORE} no Node.js built-ins.`,
            },
          ],
          paths: [
            "child_process",
            "cluster",
            "crypto",
            "dgram",
            "dns",
            "fs",
            "fs/promises",
            "http",
            "http2",
            "https",
            "net",
            "os",
            "path",
            "process",
            "timers",
            "tls",
            "url",
            "worker_threads",
          ].map((name) => ({
            name,
            message: `${PURE_CORE} no Node.js built-ins.`,
          })),
        },
      ],
      "no-restricted-globals": [
        "error",
        {
          name: "process",
          message: `${PURE_CORE} pass settings in as arguments.`,
        },
        { name: "fetch", message: `${PURE_CORE} no network.` },
        {
          name: "parseFloat",
          message: `${NO_FLOATS} use parseMoney from src/core/money.ts.`,
        },
      ],
      "no-restricted-properties": [
        "error",
        {
          object: "Date",
          property: "now",
          message: `${PURE_CORE} take \`now\` as an argument.`,
        },
        {
          object: "Math",
          property: "random",
          message: `${PURE_CORE} no randomness.`,
        },
        {
          object: "Number",
          property: "parseFloat",
          message: `${NO_FLOATS} use parseMoney from src/core/money.ts.`,
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: `${PURE_CORE} take \`now\` as an argument.`,
        },
        {
          selector: "CallExpression[callee.property.name='toNumber']",
          message: `${NO_FLOATS} keep decimal values as Money.`,
        },
      ],
    },
  },

  // Last: turn off every stylistic rule that Prettier owns.
  prettier,
);
