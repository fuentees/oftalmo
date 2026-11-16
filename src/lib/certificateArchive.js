import { supabase } from '@/api/supabaseClient';
import { loadSharedConfigJson, saveSharedConfigJson } from '@/lib/sharedConfigStore';
import { certificateSnapshotInput, hasCertificateSnapshot } from './certificateRecord';

const templatePromises = new Map();
const frozenTemplates = new Map();
const canonicalJson = (value) => JSON.stringify(value, (_key, item) =>
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]]))
    : item
);
const templateKeyFor = async (template) => {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(template)));
  const hash = Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
  return `certificate-issued-template-${hash}`;
};
const loadFrozenTemplate = async (key) => {
  if (!frozenTemplates.has(key)) {
    frozenTemplates.set(key, (async () => {
      const template = await loadSharedConfigJson(key);
      if (!template) throw new Error('Modelo original indisponível. A segunda via não será gerada com outro modelo.');
      if (await templateKeyFor(template) !== key) throw new Error('O modelo arquivado foi alterado. Recupere a versão original antes de emitir a segunda via.');
      return template;
    })().catch((error) => { frozenTemplates.delete(key); throw error; }));
  }
  return frozenTemplates.get(key);
};

// One immutable, content-addressed template shared by all its certificates.
export const freezeCertificateTemplate = async (template) => {
  const preserved = JSON.parse(JSON.stringify(template));
  const key = await templateKeyFor(preserved);
  if (!templatePromises.has(key)) {
    templatePromises.set(key, (async () => {
      if (!await loadSharedConfigJson(key)) await saveSharedConfigJson(key, preserved);
      await loadFrozenTemplate(key);
      return key;
    })().catch((error) => { templatePromises.delete(key); throw error; }));
  }
  return templatePromises.get(key);
};

export const reserveCertificateIssue = async ({ participantId = null, staff = null, metadata, validityDate = null }) => {
  const { data, error } = await supabase.rpc('reserve_certificate_issue', {
    p_participant_id: participantId, p_staff: staff,
    p_metadata: metadata, p_validity_date: validityDate,
  });
  if (error) throw new Error(`Não foi possível registrar a emissão com segurança. ${error.message}`);
  if (!data?.certificate_number) throw new Error('A emissão não retornou um número de certificado.');
  return data;
};

export const getCertificateBlob = async (record) => {
  if (!hasCertificateSnapshot(record)) {
    if (!record?.certificate_url) {
      throw new Error('Certificado antigo sem arquivo original disponível. Recupere o original antes de gerar uma segunda via.');
    }
    const response = await fetch(record.certificate_url);
    if (!response.ok) throw new Error('Não foi possível recuperar o certificado original. Nenhum dado da emissão foi alterado.');
    const blob = await response.blob();
    if (!(await blob.slice(0, 5).text()).startsWith('%PDF-')) {
      throw new Error('O arquivo original não é um PDF válido.');
    }
    return blob;
  }
  const input = certificateSnapshotInput(record);
  const template = await loadFrozenTemplate(input.templateKey);
  const generators = await import('@/components/trainings/CertificateGenerator');
  const generator = {
    participante: generators.generateParticipantCertificate,
    coordenador: generators.generateCoordinatorCertificate,
    monitor: generators.generateMonitorCertificate,
    palestrante: generators.generateSpeakerCertificate,
  }[input.type];
  if (!generator) throw new Error('Tipo de certificado desconhecido.');
  return generator(input.recipient, input.training, template, input.options).output('blob');
};

export const downloadCertificate = async (record) => {
  const blob = await getCertificateBlob(record);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `certificado-${String(record.certificate_number || record.id).replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
};
