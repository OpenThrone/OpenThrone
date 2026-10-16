/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  main: ['src'],
  extends: 'dependency-cruiser/configs/recommended',
  options: {
    exclude: {
      path: 'node_modules|dist|\\.next|\\.cypress-cache|prisma/generated',
    },
  },
  forbidden: [],
  allowed: [],
};
