const fs = require('node:fs');
const path = require('node:path');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Set SUPABASE_URL and SUPABASE_ANON_KEY in the Netlify environment.');
    process.exit(1);
}

let parsedUrl;
try {
    parsedUrl = new URL(supabaseUrl);
} catch {
    console.error('SUPABASE_URL must be a valid absolute URL.');
    process.exit(1);
}

if (parsedUrl.protocol !== 'https:') {
    console.error('SUPABASE_URL must use HTTPS.');
    process.exit(1);
}

const configuration = {
    url: supabaseUrl,
    anonKey: supabaseAnonKey
};
const output = `window.NAPHUTECH_SUPABASE_CONFIG = ${JSON.stringify(configuration)};\n`;
const projectRoot = path.join(__dirname, '..');
const outputDirectory = path.join(projectRoot, 'dist');
fs.rmSync(outputDirectory, { recursive: true, force: true });
fs.mkdirSync(outputDirectory, { recursive: true });

for (const fileName of ['index.html', 'script.js', 'style.css']) {
    fs.copyFileSync(path.join(projectRoot, fileName), path.join(outputDirectory, fileName));
}

fs.writeFileSync(path.join(outputDirectory, 'supabase-config.js'), output, 'utf8');
