import { FarolRealtimePage } from "./FarolRealtimePage";
import { MODALIDADE, SITUACAO } from "@/services/netris/client";

export default function FarolMamografia() {
  return (
    <FarolRealtimePage
      modalidadeId={MODALIDADE.MAMOGRAFIA}
      title="Mamografia"
      situacaoIds={[SITUACAO.ENCAMINHADO_EXAME]}
    />
  );
}
