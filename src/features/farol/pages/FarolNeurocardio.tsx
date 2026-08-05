import { FarolRealtimePage } from "./FarolRealtimePage";
import { MODALIDADE, SITUACAO } from "@/services/netris/client";

export default function FarolNeurocardio() {
  return (
    <FarolRealtimePage
      modalidadeId={[
        MODALIDADE.ELETROCARDIOGRAMA,
        MODALIDADE.ELETROENCEFALOGRAMA,
        MODALIDADE.ESPIROMETRIA,
        MODALIDADE.HOLTER,
        MODALIDADE.RETORNO_MAPA,
        MODALIDADE.RETORNO_HOLTER,
      ]}
      title="Neurocardio & Espirometria"
      situacaoIds={[SITUACAO.ENCAMINHADO_EXAME]}
      modalidadesInfo={[
        { id: MODALIDADE.ELETROCARDIOGRAMA,   label: "Eletrocardiograma",   icon: "🫀" },
        { id: MODALIDADE.ELETROENCEFALOGRAMA, label: "Eletroencefalograma", icon: "🧠" },
        { id: MODALIDADE.ESPIROMETRIA,        label: "Espirometria",        icon: "🫁" },
        { id: MODALIDADE.HOLTER,              label: "Holter",              icon: "📟" },
        { id: MODALIDADE.RETORNO_MAPA,        label: "Retorno MAPA",        icon: "🩺" },
        { id: MODALIDADE.RETORNO_HOLTER,      label: "Retorno Holter",      icon: "🩺" },
      ]}
    />
  );
}
