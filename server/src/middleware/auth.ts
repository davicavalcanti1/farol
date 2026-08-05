// Auth por Bearer do Supabase — o frontend manda o access_token da sessão.
// O sistema de origem também aceitava sessão Express ("FromAny"); aqui não há
// sessão, então requireAuthFromAny valida só o Bearer. O nome foi mantido para
// as rotas copiadas não precisarem mudar.

import type { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../lib/supabase.js";

export async function requireAuthFromAny(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (!error && user) return next();
  }
  return res.status(401).json({ error: "Não autorizado." });
}

export const requireSupabaseAuth = requireAuthFromAny;
