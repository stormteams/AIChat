module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  extends: [
    'eslint:recommended',
    'google',
  ],
  parserOptions: {
    'ecmaVersion': 2018,
  },
  rules: {
    'no-restricted-globals': ['error', 'name', 'length'],
    'prefer-arrow-callback': 'error',
    'quotes': ['error', 'single', {'allowTemplateLiterals': true}],
    'max-len': ['error', {'code': 120}],
    'indent': ['error', 2],
    'linebreak-style': 'off',
    'valid-jsdoc': 'off',
    'require-jsdoc': 'off',
    'no-trailing-spaces': 'error',
    'object-curly-spacing': ['error', 'never'],
    'comma-dangle': ['error', 'always-multiline'],
    'arrow-parens': ['error', 'always'],
  },
  overrides: [
    {
      files: ['**/*.spec.*'],
      env: {
        mocha: true,
      },
      rules: {},
    },
  ],
  globals: {},
};
