import { FarolRealtimePage } from "./FarolRealtimePage";
import { MODALIDADE, SITUACAO } from "@/services/netris/client";

export default function FarolDensitometria() {
  return (
    <FarolRealtimePage
      modalidadeId={MODALIDADE.DENSITOMETRIA}
      title="Densitometria"
      situacaoIds={[SITUACAO.ENCAMINHADO_EXAME]}
    />
  );
}
