# Certificados sob demanda

## Funcionamento

- A primeira emissão reserva o número no banco e preserva os dados usados no documento.
- Repetir a operação reutiliza esse número e os dados originais. Não renova a validade.
- Nome, documento, nota, carga horária, programação e opções do verso ficam no registro da emissão.
- O modelo completo fica em uma configuração compartilhada identificada por SHA-256. As imagens não são repetidas em cada participante.
- A data da emissão usa o calendário de São Paulo, inclusive perto da meia-noite UTC.
- Baixar ou enviar gera um PDF temporário. Não há upload de um PDF por emissão ou reenvio.
- Certificados antigos usam o arquivo original. A aplicação não tenta reconstruí-los com dados atuais.
- Arquivo ou modelo indisponível gera erro explícito, sem substituir o conteúdo silenciosamente.

O campo `certificate_issued` indica que a emissão foi registrada. `certificate_sent_date` registra o envio por e-mail; um erro de envio não libera outro número.

## Banco

Aplicar `supabase/reserve_certificate_issue.sql` antes de publicar a aplicação. A função usa as permissões existentes do usuário, exige autenticação e serializa a reserva entre participantes e equipe. Não altera certificados existentes.

A rotina foi aplicada e testada no projeto Gestão Oftalmo em 16/11/2026. Os testes no banco usaram uma transação revertida: confirmaram reutilização de número e metadados, preservação de validade, numeração diferente entre participante/equipe ausência de duplicação em tentativas repetidas e separação de homônimos com e-mails diferentes. Nenhum registro de teste foi mantido.

## Verificação local

```text
node scripts/test-certificates.mjs
npm run build
npx eslint src/components/trainings/CertificateManager.jsx src/components/trainings/CertificateGenerator.jsx src/components/professionals/StaffCertificatesPanel.jsx src/components/professionals/CertificatesPanel.jsx src/components/professionals/TrainingHistory.jsx src/pages/ParticipantProfile.jsx src/pages/Reports.jsx src/components/communication/CommunicationChatWidget.jsx --quiet
```

Os testes usam dados fictícios e não fazem chamadas ao Supabase nem enviam e-mails. Cobrem os quatro tipos de PDF, verso, número/data/validade originais, alterações posteriores nos dados, compartilhamento de modelos e falhas na recuperação de originais.

## Acervo anterior

`supabase/inventory_certificate_files.sql` exporta um inventário completo em uma célula JSON. A ausência de referência em tabelas não autoriza apagar um arquivo: links em e-mails e outros sistemas podem continuar em uso.

`scripts/prepare-certificate-archive.py` faz download e prepara cópias comprimidas locais. Não modifica o Supabase. Foi verificado com pypdf 6.21.4. Os originais e relatórios ficam em `backups/certificates`, excluído do Git.

```text
python scripts/prepare-certificate-archive.py --supabase-url https://SEU-PROJETO.supabase.co --limit 3
python scripts/prepare-certificate-archive.py --supabase-url https://SEU-PROJETO.supabase.co --limit 0 --workers 4
```

O relatório registra SHA-256 dos arquivos originais e comprimidos. A validação compara texto, número de páginas, dimensões, instruções de desenho e dados decodificados das imagens. PDFs com assinatura digital ou criptografia são preservados, sem regravação. As três amostras iniciais também foram renderizadas e comparadas pixel a pixel.

Antes de qualquer substituição online:

1. Concluir o backup e a validação de todo o inventário.
2. Preservar também uma cópia do backup em um segundo local confiável.
3. Conferir o tamanho final, os erros e os arquivos assinados/criptografados.
4. Obter aprovação para substituir os arquivos atuais pelas cópias comprimidas, mantendo os mesmos caminhos.
5. Verificar os downloads pelos links existentes e o uso atualizado antes de mudar o plano.

O painel inicial carrega apenas os campos usados nos indicadores, sem trazer os registros completos de emissão. O chat consulta a cada 60 segundos quando fechado e mantém 15 segundos quando aberto.

A aplicação ainda precisa ser publicada para que o novo comportamento entre em uso. A existência da função no banco, por si só, não altera o site publicado. Nenhum PDF foi excluído ou substituído e a assinatura não foi cancelada durante a preparação.

## Manutenção

Não apagar configurações `certificate-issued-template-*` enquanto existirem emissões que as referenciem. Manter o renderizador da versão 1 compatível; uma mudança incompatível de layout deve criar outra versão. Fazer backup das tabelas de participantes, equipe e configurações compartilhadas: os registros e modelos são necessários para gerar as novas segundas vias.
