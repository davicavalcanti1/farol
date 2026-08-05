import { FarolRealtimePage } from "./FarolRealtimePage";
import { MODALIDADE, SITUACAO } from "@/services/netris/client";

export default function FarolTomografia() {
  return (
    <FarolRealtimePage
      modalidadeId={MODALIDADE.TOMOGRAFIA}
      title="Tomografia"
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
