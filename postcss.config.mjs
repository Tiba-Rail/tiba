// Tailwind v4 emits no utilities without this plugin; without it the whole app
// shipped unstyled (the CSS chunk contained only the raw @import line).
const config = { plugins: { "@tailwindcss/postcss": {} } };
export default config;
