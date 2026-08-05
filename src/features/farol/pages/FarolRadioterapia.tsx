import { FarolRealtimePage } from "./FarolRealtimePage";
import { MODALIDADE, SITUACAO } from "@/services/netris/client";

export default function FarolRadioterapia() {
  return (
    <FarolRealtimePage
      modalidadeId={MODALIDADE.RAIO_X}
      title="Radiografia"
      situacaoIds={[SITUACAO.ENCAMINHADO_EXAME]}
    />
  );
}
