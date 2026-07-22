import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier/flat";

export default tseslint.config(
  { ignores: ["dist", "coverage", "src/convex/_generated"] },
  {
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      eslintConfigPrettier,
    ],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
      "react-refresh/only-export-components": [
        "warn",
        {
          allowConstantExport: true,
          allowExportNames: [
            "badgeVariants",
            "buttonVariants",
            "buttonGroupVariants",
            "useFormField",
            "navigationMenuTriggerStyle",
            "SIDEBAR_WIDTH",
            "useSidebar",
            "toggleVariants",
          ],
        },
      ],
    },
  },
  // Suppress react-refresh warnings for entry point and vendor toolbar (must be last to override)
  {
    files: ["src/main.tsx", "vly-toolbar-readonly.tsx"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
);
