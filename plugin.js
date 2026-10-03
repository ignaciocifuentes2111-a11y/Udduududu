// Kino plugin: Addon Latam TV. Lee un addon de Stremio estático (catalog/tv/*.json y stream/tv/*.json)
// publicado en GitHub y lo muestra en la pestaña En vivo.
const GENRE = {
  musica: "musica", cine: "peliculas", deportes: "deportes", documentales: "documentales",
  noticias: "noticias", infantil: "infantil", entretenimiento: "entretenimiento", comedia: "entretenimiento",
};
const SAFE = /^[A-Za-z0-9._-]+$/;
let cache = null;

function base() {
  const repo = String(kino.config.get("repo") || "Droydr13/Addon-Latam-TV").trim();
  const branch = String(kino.config.get("branch") || "main").trim();
  const [owner, name] = repo.split("/");
  if (!SAFE.test(owner || "") || !SAFE.test(name || "") || !SAFE.test(branch)) {
    throw kino.error("not_found", "repositorio o rama inválidos");
  }
  return "https://raw.githubusercontent.com/" + owner + "/" + name + "/" + branch;
}

async function getJson(url) {
  const r = await kino.fetch(url);
  if (!r.ok) throw new Error("GitHub respondió " + r.status);
  return r.json();
}

async function catalog() {
  if (cache) return cache;
  const data = await getJson(base() + "/catalog/tv/addonlatam-canales.json");
  cache = Array.isArray(data.metas) ? data.metas : [];
  return cache;
}

const slug = (g) => String(g).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const genresOf = (m) => (Array.isArray(m.genres) && m.genres.length ? m.genres : ["General"]).map(String);

export async function liveCategories() {
  const metas = await catalog();
  const names = new Map();
  for (const m of metas) for (const g of genresOf(m)) names.set(slug(g), g);
  return [...names].map(([id, title]) => {
    const c = { id, title };
    const genre = GENRE[id];
    if (genre) c.genre = genre;
    return c;
  });
}

export async function liveChannels({ categoryId }) {
  const metas = await catalog();
  const items = metas
    .filter((m) => SAFE.test(m.id || "") && genresOf(m).some((g) => slug(g) === categoryId))
    .map((m) => {
      const ch = { id: m.id, title: String(m.name || m.id), ref: m.id, categoryId };
      if (typeof m.poster === "string" && m.poster.startsWith("https://")) ch.logo = m.poster;
      return ch;
    });
  return { items: items.slice(0, 500), next: null };
}

export async function resolve(ref) {
  if (!SAFE.test(ref)) throw kino.error("not_found", "canal inválido");
  const data = await getJson(base() + "/stream/tv/" + ref + ".json");
  const s = (Array.isArray(data.streams) ? data.streams : []).find((x) => x && typeof x.url === "string" && /^https?:\/\//.test(x.url));
  if (!s) throw kino.error("not_found", "este canal no tiene señal disponible");
  const out = { url: s.url };
  if (/\.m3u8(\?|$)/i.test(s.url)) out.mime = "application/x-mpegURL";
  return out;
}

const squash = (t) => String(t).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

export async function search(query) {
  const q = squash(query.q || "");
  if (q.length < 2) return [];
  const metas = await catalog();
  return metas
    .filter((m) => SAFE.test(m.id || "") && squash(m.name || "").includes(q))
    .slice(0, 30)
    .map((m) => ({
      id: m.id,
      ref: m.id,
      title: String(m.name || m.id),
      kind: "live",
      poster: typeof m.poster === "string" && m.poster.startsWith("https://") ? m.poster : undefined,
    }));
}
