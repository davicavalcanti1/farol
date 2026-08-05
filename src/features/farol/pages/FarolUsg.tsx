import { FarolRealtimePage } from "./FarolRealtimePage";
import { MODALIDADE, SITUACAO } from "@/services/netris/client";

export default function FarolUsg() {
  return (
    <FarolRealtimePage
      modalidadeId={MODALIDADE.USG}
      title="Ultrassonografia"
      situacaoIds={[SITUACAO.ENCAMINHADO_EXAME]}
    />
  );
}
