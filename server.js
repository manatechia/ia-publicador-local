import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, 'projects.json');
const PORT = process.env.PORT || 5173;

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- persistencia de proyectos ----------
function loadProjects() {
  try { return JSON.parse(fs.readFileSync(DATA, 'utf8')); }
  catch { return { projects: [], current: null }; }
}
function saveProjects(d) { fs.writeFileSync(DATA, JSON.stringify(d, null, 2)); }

app.get('/api/projects', (_req, res) => res.json(loadProjects()));
app.post('/api/projects', (req, res) => {
  const body = req.body;
  if (!body || !Array.isArray(body.projects)) {
    return res.status(400).json({ error: 'Formato inválido: se espera { current, projects: [] }.' });
  }
  const projects = body.projects.map(p => ({
    name: String(p?.name || '').trim(),
    voice: String(p?.voice || ''),
    url: String(p?.url || ''),
    provider: String(p?.provider || ''),
    model: String(p?.model || ''),
    mcpConfig: String(p?.mcpConfig || ''),
    allowedTools: String(p?.allowedTools || '')
  })).filter(p => p.name);
  saveProjects({ current: typeof body.current === 'string' ? body.current : null, projects });
  res.json({ ok: true });
});

// ---------- generacion ----------
app.post('/api/generate', async (req, res) => {
  try {
    const { topic, projectName, platforms, url } = req.body || {};
    if (!topic || !Array.isArray(platforms) || !platforms.length) {
      return res.status(400).json({ error: 'Falta el tema o las plataformas.' });
    }
    // El proyecto se resuelve por nombre desde projects.json: la config sensible
    // (mcpConfig, allowedTools) nunca se acepta directo del cliente.
    const name = projectName || req.body?.project?.name;
    const project = loadProjects().projects?.find(p => p.name === name) || {};
    const drafts = await generate({ topic, project, platforms, url });
    res.json({ drafts });
  } catch (e) {
    console.error('[generate]', e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

async function generate({ topic, project, platforms, url }) {
  const provider = project.provider || process.env.DEFAULT_PROVIDER || 'ollama';
  const sys = buildSystemPrompt(project);
  const user = buildUserPrompt(topic, platforms, url);
  const raw = await callLLM(provider, project, sys, user);
  const json = extractJson(raw);
  const drafts = {};
  for (const p of platforms) {
    const val = json?.[p.key] ?? json?.platforms?.[p.key] ?? '';
    drafts[p.key] = String(val).trim();
  }
  return drafts;
}

function buildSystemPrompt(project) {
  const name = project.name || 'la marca';
  const voice = project.voice || 'Tono profesional, claro y cercano.';
  return [
    `Sos un redactor experto en social media para "${name}".`,
    `Voz de marca: ${voice}`,
    `Escribís en español rioplatense, directo y sin relleno.`,
    `Nunca inventás datos, cifras ni citas: si no lo sabés con certeza, lo dejás genérico.`,
    `Respondés SIEMPRE con un objeto JSON válido y nada más.`
  ].join('\n');
}

function buildUserPrompt(topic, platforms, url) {
  const lines = platforms.map(p =>
    `- "${p.key}" (${p.label}): máximo ${p.charLimit} caracteres. Estilo: ${p.style || 'natural'}.`
  ).join('\n');
  return [
    `Tema del contenido: ${topic}`,
    url ? `Link del recurso a incluir cuando corresponda: ${url}` : '',
    ``,
    `Escribí un post adaptado a cada una de estas plataformas:`,
    lines,
    ``,
    `Reglas:`,
    `- Respetá el límite de caracteres de cada plataforma.`,
    `- Texto listo para publicar, sin encabezados tipo "Post:" ni comillas envolventes.`,
    `- Adaptá el tono y el formato a cada red (hashtags donde suma, saltos de línea en LinkedIn, etc.).`,
    ``,
    `Devolvé SOLO un objeto JSON donde cada clave es el id de la plataforma (${platforms.map(p => p.key).join(', ')}) y su valor es el texto del post.`
  ].filter(Boolean).join('\n');
}

function extractJson(s) {
  if (!s) return {};
  try { return JSON.parse(s); } catch {}
  const m = s.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return {};
}

// ---------- adaptadores LLM ----------
async function callLLM(provider, project, sys, user) {
  if (provider === 'claudecode') return callClaudeCode(project, sys, user);
  if (provider === 'anthropic') return callAnthropic(project, sys, user);
  if (provider === 'openai') return callOpenAI(project, sys, user);
  return callOllama(project, sys, user);
}

// Claude Code headless: usa la suscripción del usuario, sin API key.
// Soporta MCP opcional (mcpConfig + allowedTools por proyecto).
const CLAUDE_TIMEOUT_MS = parseInt(process.env.CLAUDE_TIMEOUT_MS) || 180000;

// En Windows el "claude" instalado por npm es un shim .cmd/.ps1 que spawn no
// puede ejecutar sin shell. Buscamos el cli.js real y lo corremos con node.
function resolveClaude() {
  const bin = process.env.CLAUDE_BIN || 'claude';
  if (process.platform !== 'win32' || bin.toLowerCase().endsWith('.exe')) return { cmd: bin, prefix: [] };
  if (bin.toLowerCase().endsWith('.js')) return { cmd: process.execPath, prefix: [bin] };
  const dirs = bin.includes(path.sep) ? [path.dirname(bin)] : (process.env.PATH || '').split(path.delimiter);
  for (const dir of dirs) {
    if (!dir) continue;
    const cli = path.join(dir, 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js');
    if (fs.existsSync(cli)) return { cmd: process.execPath, prefix: [cli] };
  }
  return { cmd: bin, prefix: [] };
}

function callClaudeCode(project, sys, user) {
  const { cmd, prefix } = resolveClaude();
  const model = project.model || process.env.CLAUDE_MODEL || 'sonnet';
  const args = [
    ...prefix,
    '-p', user,
    '--output-format', 'json',
    '--model', model,
    '--append-system-prompt', sys
  ];
  if (project.mcpConfig) args.push('--mcp-config', project.mcpConfig);
  if (project.allowedTools) args.push('--allowed-tools', project.allowedTools);

  return new Promise((resolve, reject) => {
    let out = '', err = '', done = false;
    const fail = e => { if (!done) { done = true; reject(e); } };
    let ps;
    try { ps = spawn(cmd, args, { cwd: process.cwd() }); }
    catch (e) { return fail(new Error('No se pudo ejecutar "' + cmd + '": ' + e.message)); }
    const timer = setTimeout(() => {
      ps.kill();
      fail(new Error('Claude Code no respondió en ' + Math.round(CLAUDE_TIMEOUT_MS / 1000) + 's y fue cancelado.'));
    }, CLAUDE_TIMEOUT_MS);
    ps.on('error', e => {
      clearTimeout(timer);
      fail(new Error(
        e.code === 'ENOENT'
          ? 'No encuentro el comando "' + cmd + '". Instalá Claude Code o seteá CLAUDE_BIN en .env.'
          : 'Error ejecutando Claude Code: ' + e.message
      ));
    });
    ps.stdout.on('data', d => (out += d));
    ps.stderr.on('data', d => (err += d));
    ps.on('close', code => {
      clearTimeout(timer);
      if (done) return;
      done = true;
      if (code !== 0) return reject(new Error('Claude Code salió con código ' + code + ': ' + (err || out).slice(0, 400)));
      let wrap;
      try { wrap = JSON.parse(out); } catch { return resolve(out); }
      if (wrap.is_error) return reject(new Error('Claude Code: ' + (wrap.result || 'error')));
      resolve(wrap.result || '');
    });
  });
}

async function callOllama(project, sys, user) {
  const base = process.env.OLLAMA_URL || 'http://localhost:11434';
  const model = project.model || process.env.OLLAMA_MODEL || 'llama3.1';
  const r = await fetch(base + '/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      format: 'json',
      messages: [{ role: 'system', content: sys }, { role: 'user', content: user }]
    })
  });
  if (!r.ok) throw new Error('Ollama ' + r.status + ': ' + (await r.text()).slice(0, 300));
  const d = await r.json();
  return d.message?.content || '';
}

async function callAnthropic(project, sys, user) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Falta ANTHROPIC_API_KEY en el archivo .env');
  const model = project.model || process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      system: sys,
      messages: [{ role: 'user', content: user }]
    })
  });
  if (!r.ok) throw new Error('Anthropic ' + r.status + ': ' + (await r.text()).slice(0, 300));
  const d = await r.json();
  return d.content?.[0]?.text || '';
}

async function callOpenAI(project, sys, user) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('Falta OPENAI_API_KEY en el archivo .env');
  const model = project.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: sys }, { role: 'user', content: user }]
    })
  });
  if (!r.ok) throw new Error('OpenAI ' + r.status + ': ' + (await r.text()).slice(0, 300));
  const d = await r.json();
  return d.choices?.[0]?.message?.content || '';
}

// Solo localhost: la app ejecuta procesos locales, no debe quedar expuesta a la LAN.
app.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  Publicador local corriendo en:  http://localhost:${PORT}\n`);
});
