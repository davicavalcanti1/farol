/* As áreas comuns. Cada uma é uma fábrica que recebe a sua fonte de dados: a
   área sabe desenhar, o produto sabe de onde vem o dado. É o mesmo princípio
   das três tomadas do Shell, um nível abaixo. */

export {
  configParaSalvar,
  desligarDeixaSemValor,
  essenciaisFaltando,
  podeAtivar,
  quando,
  rotuloOrigem,
  statusEhSaudavel,
  type CampoPublico,
  type CamposIntegracao,
  type Origem,
  type RetratoIntegracao,
} from './logica.js';

export {
  CartaoSaude,
  criarAreaSaude,
  obterSaudeHttp,
  type OpcoesAreaSaude,
  type SaudeModulo,
} from './saude.js';

export { criarAreaVisaoGeral, type OpcoesAreaVisaoGeral } from './visaoGeral.js';

export {
  clienteIntegracaoHttp,
  criarAreaIntegracoes,
  PainelIntegracoes,
  type ClienteIntegracao,
  type OpcoesAreaIntegracoes,
  type ResultadoImportar,
  type ResultadoTeste,
} from './integracoes.js';
