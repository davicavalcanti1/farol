// Primeiro import de propósito: valida o ambiente e derruba o processo com
// mensagem legível se faltar o essencial, antes que qualquer outro módulo carregue
// e leia uma env undefined.
import { config, emProducao } from "./config.js";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import integracaoRoutes from "./routes/integracao.js";
import netrisRoutes from "./routes/netris.js";
import { rotaSaude } from "./routes/saude.js";

const app = express();

app.use(express.json({ limit: "2mb" }));

// /api/health é o path histórico — mantido para não quebrar o que já monitora.
// /health é o alias que o molde e o Hub da plataforma usam.
app.use("/api/health", rotaSaude);
app.use("/health", rotaSaude);

app.use("/api/netris", netrisRoutes);

// Painel de configuracao da integracao. Monta o router do @imago/integracoes;
// o gate de papel esta dentro da rota, nao aqui.
app.use("/api/integracao", integracaoRoutes);

// Em produção (container único) o Express também serve o build do Vite.
// Em dev quem serve o front é o Vite (:5173) com proxy /api pra cá.
if (emProducao) {
  const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../dist");
  app.use(express.static(distDir));
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api/")) return res.status(404).json({ error: "Not found" });
    res.sendFile(path.join(distDir, "index.html"));
  });
}

app.listen(config.PORT, () => {
  console.log(`[farol-api] http://localhost:${config.PORT} (${config.NODE_ENV})`);
});
