# Publicador local — iteración 1

Generador de contenido multi-red, 100% local. Escribís un **tema**, la IA arma el **post adaptado a cada red**, lo revisás/ajustás y con un botón se **abre el compositor de esa red con el texto ya cargado**. Vos das el OK final y publicás.

Sin APIs de redes, sin app review, sin automatización: solo abre la pestaña lista.

## Requisitos
- Node.js 18 o superior.
- Un motor de IA (elegís por proyecto, con el botón ⚙):
  - **Claude Code (recomendado, local)**: usa tu suscripción, sin API key. Requiere Claude Code instalado y autenticado (`claude setup-token`). Dejá `ANTHROPIC_API_KEY` vacío en `.env` para que use la suscripción y no la API.
  - **Ollama** (local, gratis): instalá desde ollama.com y bajá un modelo, ej. `ollama pull llama3.1`.
  - o una **API key** de Anthropic u OpenAI en `.env`.

### Usar un MCP en la generación (solo con Claude Code)
En el proyecto podés indicar un **MCP config** (ruta a un `.mcp.json`) y las **tools permitidas** (ej. `mcp__notion__search mcp__notion__fetch`). El motor las pasa a `claude -p` con `--mcp-config` y `--allowed-tools`, así la IA puede consultar tu MCP mientras redacta (ej. traer datos reales de Notion).

## Puesta en marcha
```bash
npm install
cp .env.example .env      # editá lo que uses
npm start
```
Abrí http://localhost:5173

## Cómo se usa
1. Elegí el **proyecto** (Gentrix, Mana, Mavera… o creá uno con su voz de marca).
2. Escribí el **tema** y, si querés, el **link del recurso**.
3. Marcá las **redes** (podés agregar más con "+ agregar red").
4. **Generar posts** → revisás y editás cada uno.
5. Botón de cada red:
   - **Abrir para postear**: abre el compositor con el texto cargado (LinkedIn, X, Threads, Bluesky, WhatsApp).
   - **Copiar y abrir**: copia el texto y abre la red (Instagram, Medium, Facebook: no permiten precargar).

## Imágenes
Cada post generado tiene un botón **🖼 Imagen**: arma un prompt a partir del tema y la voz de marca (editable), genera la imagen (cuadrada para Instagram, apaisada para el resto) y te deja descargarla para subirla al compositor de la red. Proveedores soportados (usa el primero configurado en `.env`, o forzá con `IMAGE_PROVIDER`):
- **Gemini** (`GEMINI_API_KEY`): free tier generoso, key gratis en aistudio.google.com/apikey. Recomendado para empezar.
- **OpenAI** (`OPENAI_API_KEY`): `gpt-image-1`.
- **Stable Diffusion local** (`SD_URL`): AUTOMATIC1111 corriendo con `--api`. 100% local, requiere GPU.

## Configuración
- **Proyectos y voz de marca**: `projects.json` (o desde el botón ⚙ en la web).
- **Claves y modelos**: `.env`.
- **Redes personalizadas**: se guardan en tu navegador (localStorage).

## Roadmap
- **Iter. 1 (esta):** generar posts + imagen, y abrir cada red manualmente. ✅
- **Iter. 2:** publicación automática. Dos caminos según la red:
  - **Instagram/Facebook**: la web no permite precargar nada, así que la única vía sin automatizar el navegador es la **Meta Graph API** (cuenta Business/Creator vinculada a una página; la imagen debe estar en una URL pública). Funciona en modo desarrollo para cuentas propias sin app review.
  - **Resto (y alternativa general)**: navegador automatizado (Playwright) con **sesión persistente** — iniciás sesión una vez y el bot sube el post por vos. Cubre Instagram sin cuenta Business.
- **Iter. 3:** programar ("mañana a las 9") y que publique solo en las redes elegidas.
