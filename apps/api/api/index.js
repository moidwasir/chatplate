// Vercel function: every request is rewritten here (see vercel.json) and handed to the
// Nest app compiled by the build step into dist/.
module.exports = require('../dist/serverless').default;
