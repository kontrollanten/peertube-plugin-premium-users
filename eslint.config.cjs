const globals = require('globals')
const eslintParser = require('@typescript-eslint/parser')

module.exports = [
  {
    ...import('eslint-config-love'),
    "files": [
      "**/*.ts"
    ],
    "languageOptions": {
        "globals": {
            ...globals.browser
        },
        "parser": eslintParser,
        "parserOptions": {
            "ecmaVersion": 2018,
            "project": [
                "./demo/tsconfig.json",
                "./server/tsconfig.json",
                "./server/tsconfig.test.json",
                "./client/tsconfig.json"
            ]
        },
    },
    "plugins": {
        "@typescript-eslint": require('@typescript-eslint/eslint-plugin')
    },
    "rules": {
        "@typescript-eslint/no-unused-vars": [2, {"argsIgnorePattern": "^_"}],
        "@typescript-eslint/no-floating-promises": "error",
        "@typescript-eslint/no-misused-promises": "error",
        "@typescript-eslint/no-var-requires": "off",
        "@typescript-eslint/strict-boolean-expressions": "off",
        "@typescript-eslint/return-await": [2, "in-try-catch"], // FIXME: correct?
        "@typescript-eslint/no-invalid-void-type": "off",
        "@typescript-eslint/triple-slash-reference": "off",
        "max-len": [
          "error",
          {
            "code": 120,
            "comments": 120
          }
        ],
        "@typescript-eslint/no-unused-vars": ["error", { "caughtErrorsIgnorePattern": "^ignore" }],
        "indent": [2, 2]
    }
  },
  {
    "ignores": [
      "tests/docker-volume/*"
    ]
  }
]
