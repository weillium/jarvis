import js from "@eslint/js";
import tseslint from "typescript-eslint";

const withTypeInfo = tseslint.configs.recommendedTypeChecked.map((config) => ({
  ...config,
  files: ["**/*.ts", "**/*.tsx"],
  languageOptions: {
    ...config.languageOptions,
    parserOptions: {
      ...config.languageOptions?.parserOptions,
      project: "./tsconfig.json",
      tsconfigRootDir: import.meta.dirname
    }
  }
}));

export default tseslint.config(
  {
    ignores: ["node_modules/**", "dist/**", "build/**"]
  },
  {
    ...js.configs.recommended,
    files: ["**/*.{js,cjs,mjs}"]
  },
  ...withTypeInfo,
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-explicit-any": "warn"
    }
  }
);

