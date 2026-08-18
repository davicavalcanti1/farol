import { FarolRealtimePage } from "./FarolRealtimePage";
import { MODALIDADE, SITUACAO } from "@/services/netris/client";

export default function FarolRessonancia() {
  return (
    <FarolRealtimePage
      modalidadeId={[MODALIDADE.RESSONANCIA, MODALIDADE.RESSONANCIA_CONTRASTE]}
      title="Ressonância Magnética"
      previsaoPorProtocolo
      familiaEsperada="rm"
      situacaoIds={[
        SITUACAO.ENCAMINHADO_EXAME,
        SITUACAO.ANAMNESE,
        SITUACAO.PACIENTE_PREPARADO,
        SITUACAO.PREPARADO_ENFERMAGEM,
        SITUACAO.ENCAMINHADO_RM_TC,
      ]}
    />
  );
}
