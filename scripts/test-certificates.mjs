import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { buildCertificateIssueMetadata, certificateSnapshotInput, certificateEmissionDate } from '../src/lib/certificateRecord.js';

const recipient = { professional_name: 'Pessoa Original', professional_rg: '12345', certificate_score: 95 };
const training = { id: 'training-test', title: 'Curso Original', duration_hours: 8, dates: [{ date: '2025-03-10' }] };
const metadata = buildCertificateIssueMetadata({
  recipient, training, type: 'participante', templateKey: 'frozen-template', modelId: 'original',
  options: { includeSchedule: false }, issuedAt: '2025-03-15T01:00:00Z', validityDate: '2027-03-14',
});
recipient.professional_name = 'Nome Alterado';
training.title = 'Curso Alterado';
training.dates[0].date = '2030-01-01';
const record = { certificate_number: 'CERT-2025-000123', certificate_issue_metadata: metadata };
const input = certificateSnapshotInput(record);
assert.equal(input.recipient.professional_name, 'Pessoa Original');
assert.equal(input.training.title, 'Curso Original');
assert.equal(input.training.dates[0].date, '2025-03-10');
assert.equal(input.recipient.certificate_number, 'CERT-2025-000123');
assert.equal(input.recipient.validity_date, '2027-03-14');
assert.equal(certificateEmissionDate(input.recipient), '2025-03-14');
assert.equal(input.options.includeSchedule, false);
assert.throws(() => certificateSnapshotInput({ certificate_number: 'old' }), /original/);
assert.throws(() => certificateSnapshotInput({ ...record, certificate_issue_metadata: { ...metadata, renderer_version: 2 } }), /original/);

const template = {
  title: 'CERTIFICADO', body: '{{nome}} - {{treinamento}} - {{carga_horaria}} horas',
  footer: '{{data_emissao}} - {{numero_certificado}}', logos: {},
};
const bundle = await build({
  entryPoints: ['src/components/trainings/CertificateGenerator.jsx'], bundle: true,
  write: false, format: 'esm', platform: 'browser', logLevel: 'silent',
  alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) },
  plugins: [{ name: 'isolated-template', setup(build) {
    build.onResolve({ filter: /^@\/lib\/certificateTemplate$/ }, () => ({ path: 'template', namespace: 'fixture' }));
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const loadCertificateTemplate = () => ({});' }));
  } }],
});
const generators = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
for (const [name, source] of [
  ['generateParticipantCertificate', input.recipient],
  ['generateCoordinatorCertificate', { name: 'Pessoa Original', certificate_number: record.certificate_number, certificate_issue_metadata: metadata }],
  ['generateMonitorCertificate', { name: 'Pessoa Original', certificate_number: record.certificate_number, certificate_issue_metadata: metadata }],
  ['generateSpeakerCertificate', { name: 'Pessoa Original', certificate_number: record.certificate_number, certificate_issue_metadata: metadata }],
]) {
  const pdf = generators[name](source, input.training, template, input.options);
  const textCommands = pdf.internal.pages.flat().join('\n');
  assert.ok(textCommands.includes('Pessoa') && textCommands.includes('Original'), name);
  assert.ok(textCommands.includes('14/03/2025'), name);
  assert.ok(textCommands.includes('CERT-2025-000123'), name);
  assert.equal(pdf.internal.getNumberOfPages(), 1, name);
  assert.ok(pdf.output().startsWith('%PDF-'), name);
}
const withSchedule = generators.generateParticipantCertificate(input.recipient, input.training, template, { includeSchedule: true });
assert.equal(withSchedule.internal.getNumberOfPages(), 2);

// Isolate persistence and PDF rendering to exercise archive behavior without
// connecting to production, creating issues or sending any email.
const archiveBundle = await build({
  entryPoints: ['src/lib/certificateArchive.js'], bundle: true, write: false,
  format: 'esm', platform: 'browser', logLevel: 'silent',
  plugins: [{ name: 'archive-dependencies', setup(build) {
    build.onResolve({ filter: /^@\// }, (args) => ({ path: args.path, namespace: 'mock' }));
    build.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => {
      if (args.path.endsWith('supabaseClient')) return { contents: 'export const supabase = { rpc: async () => ({data: null, error: {message:"reservation failed"}}) };' };
      if (args.path.endsWith('sharedConfigStore')) return { contents: `
        const values = new Map();
        export const loadSharedConfigJson = async key => values.get(key);
        export const saveSharedConfigJson = async (key,value) => { values.set(key,structuredClone(value)); };
      ` };
      return { contents: `
        const generate = (recipient,training,template,options) => ({ output: () => new Blob([JSON.stringify({recipient,training,template,options})]) });
        export { generate as generateParticipantCertificate, generate as generateCoordinatorCertificate, generate as generateMonitorCertificate, generate as generateSpeakerCertificate };
      ` };
    });
  } }],
});
const archive = await import(`data:text/javascript;base64,${Buffer.from(archiveBundle.outputFiles[0].text).toString('base64')}`);
const [key1, key2] = await Promise.all([archive.freezeCertificateTemplate(template), archive.freezeCertificateTemplate(template)]);
assert.equal(key1, key2);
assert.equal(await archive.freezeCertificateTemplate(Object.fromEntries(Object.entries(template).reverse())), key1);
assert.notEqual(await archive.freezeCertificateTemplate({ ...template, title: 'New Model' }), key1);
const frozenRecord = { ...record, certificate_issue_metadata: { ...metadata, template_key: key1 } };
const rendered = JSON.parse(await (await archive.getCertificateBlob(frozenRecord)).text());
assert.equal(rendered.recipient.certificate_number, record.certificate_number);
assert.equal(rendered.training.title, 'Curso Original');
assert.deepEqual(rendered.template, template);
assert.equal(rendered.options.includeSchedule, false);
await assert.rejects(archive.getCertificateBlob({}), /original/);
await assert.rejects(archive.getCertificateBlob(record), /Modelo original/);
await assert.rejects(archive.reserveCertificateIssue({ metadata }), /reservation failed/);
const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async () => new Response('%PDF-1.4\nlegacy original bytes', { status: 200 });
  assert.equal(await (await archive.getCertificateBlob({ certificate_url: 'https://example.invalid/original.pdf' })).text(), '%PDF-1.4\nlegacy original bytes');
  globalThis.fetch = async () => new Response('not a pdf', { status: 200 });
  await assert.rejects(archive.getCertificateBlob({ certificate_url: 'https://example.invalid/original.pdf' }), /PDF válido/);
} finally { globalThis.fetch = originalFetch; }
console.log('Certificate checks passed: frozen content, original number/date/validity, all four PDF roles, schedule, shared templates, legacy originals and failure paths.');
