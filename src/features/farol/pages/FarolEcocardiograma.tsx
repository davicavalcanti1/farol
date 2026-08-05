import { FarolRealtimePage } from "./FarolRealtimePage";
import { MODALIDADE, SITUACAO } from "@/services/netris/client";

export default function FarolEcocardiograma() {
  return (
    <FarolRealtimePage
      modalidadeId={MODALIDADE.ECOCARDIOGRAMA}
      title="Ecocardiograma"
      situacaoIds={[SITUACAO.ENCAMINHADO_EXAME]}
    />
  );
}
