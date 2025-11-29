import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      ".tamagui/**",
      ".expo/**",
      ".eslintrc.js",
      "app.config.js",
      "metro.config.js",
      "babel.config.js",
      "release.config.js"
    ]
  },
  ...tseslint.configs.recommended,
  defineConfig({
    files: ["**/*.{ts,tsx,js,jsx}"],
    rules: {
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-empty-object-type": "off"
    }
  })
);
