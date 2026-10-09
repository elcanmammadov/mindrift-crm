import { useState, type FormEvent } from 'react';
import { Archive, Camera, FileText, Mail, MessageCircle, Pencil, Phone, Plus, ScanText, Upload } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { fmtDateTime, toLocalInput } from '../../lib/format';
import type { Source } from '../../lib/types';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, Select, Spinner, Textarea, cx, errorMessage } from '../../components/ui';
import { CameraCapture } from '../../components/CameraCapture';
import { useSettings } from '../../components/Layout';
import { useCase, useCaseAction } from './context';

const TYPES = ['EMAIL', 'WHATSAPP', 'TELEGRAM', 'CALL_NOTE', 'MEETING_NOTE', 'PROPOSAL', 'CONTRACT', 'SUPPORT_REPLY', 'INTERNAL_NOTE', 'DOCUMENT'];
const icon = (type: string) =>
  type === 'EMAIL' ? <Mail className="h-4 w-4" /> : type === 'WHATSAPP' || type === 'TELEGRAM' ? <MessageCircle className="h-4 w-4" /> : type === 'CALL_NOTE' ? <Phone className="h-4 w-4" /> : <FileText className="h-4 w-4" />;

interface Meta {
  type: string;
  title: string;
  author: string;
  authorSide: string;
  occurredAt: string;
  packageRef: string;
}

function MetaFields({ meta, setMeta, errors }: { meta: Meta; setMeta: (m: Meta) => void; errors: Partial<Record<keyof Meta, string>> }) {
  const { t, te } = useI18n();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={t('sources.type')} required>
        {(id) => (
          <Select id={id} value={meta.type} onChange={(e) => setMeta({ ...meta, type: e.target.value })}>
            {TYPES.map((x) => (
              <option key={x} value={x}>
                {te('sources.types', x)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label={t('common.title')} required error={errors.title}>
        {(id) => <Input id={id} value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} aria-invalid={!!errors.title} />}
      </Field>
      <Field label={t('sources.author')} required error={errors.author}>
        {(id) => <Input id={id} value={meta.author} onChange={(e) => setMeta({ ...meta, author: e.target.value })} aria-invalid={!!errors.author} />}
      </Field>
      <Field label={t('sources.sideLabel')} required>
        {(id) => (
          <Select id={id} value={meta.authorSide} onChange={(e) => setMeta({ ...meta, authorSide: e.target.value })}>
            <option value="CUSTOMER">{te('sources.side', 'CUSTOMER')}</option>
            <option value="COMPANY">{te('sources.side', 'COMPANY')}</option>
          </Select>
        )}
      </Field>
      <Field label={t('sources.occurredAt')} required error={errors.occurredAt}>
        {(id) => <Input id={id} type="datetime-local" value={meta.occurredAt} onChange={(e) => setMeta({ ...meta, occurredAt: e.target.value })} />}
      </Field>
      <Field label={`${t('sources.packageRef')} (${t('common.optional')})`}>
        {(id) => <Input id={id} value={meta.packageRef} onChange={(e) => setMeta({ ...meta, packageRef: e.target.value })} placeholder="Start / Biznes / Premium" />}
      </Field>
    </div>
  );
}

function validateMeta(m: Meta, t: (k: string) => string) {
  const e: Partial<Record<keyof Meta, string>> = {};
  if (!m.title.trim()) e.title = t('common.required');
  if (!m.author.trim()) e.author = t('common.required');
  if (!m.occurredAt || Number.isNaN(+new Date(m.occurredAt))) e.occurredAt = t('common.required');
  return e;
}

function SourceForm({ existing, onDone }: { existing?: Source; onDone: () => void }) {
  const { caseId } = useCase();
  const { t } = useI18n();
  const [mode, setMode] = useState<'text' | 'file' | 'camera'>('text');
  const [fromCamera, setFromCamera] = useState(false);
  const [meta, setMeta] = useState<Meta>({
    type: existing?.type ?? 'EMAIL',
    title: existing?.title ?? '',
    author: existing?.author ?? '',
    authorSide: existing?.authorSide ?? 'CUSTOMER',
    occurredAt: toLocalInput(existing ? new Date(existing.occurredAt) : new Date()),
    packageRef: existing?.packageRef ?? '',
  });
  const [content, setContent] = useState(existing?.content ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [touched, setTouched] = useState(false);
  const errors = touched ? validateMeta(meta, t) : {};
  const contentError = touched && mode === 'text' && !content.trim() ? t('common.required') : undefined;
  const fileError = touched && mode === 'file' && !file ? t('common.required') : undefined;

  const settings = useSettings();
  const ocr = useMutation({
    mutationFn: async (photo: Blob): Promise<{ text: string }> => {
      // With an API key the server reads the photo with Claude vision; otherwise OCR runs offline in the browser.
      if (settings.data?.hasApiKey) {
        const fd = new FormData();
        fd.append('file', photo, 'photo.jpg');
        return api.upload<{ text: string }>(`/cases/${caseId}/sources/ocr`, fd);
      }
      const { recognize } = await import('tesseract.js');
      // Engine and language data are served locally (scripts/copy-ocr-assets.mjs), so this also works offline.
      const { data } = await recognize(photo, 'aze+eng', { workerPath: '/tesseract/worker.min.js', corePath: '/tesseract', langPath: '/tesseract/lang', workerBlobURL: false });
      const text = data.text.trim();
      if (text.replace(/s+/g, '').length < 3) throw new Error(t('errors.OCR_NO_TEXT'));
      return { text };
    },
    onSuccess: ({ text }) => {
      setContent(text);
      setFromCamera(true);
      if (meta.type === 'EMAIL') setMeta({ ...meta, type: 'DOCUMENT', title: meta.title || t('camera.defaultTitle') });
      setMode('text');
    },
  });

  const save = useCaseAction(
    async () => {
      const body = { ...meta, occurredAt: new Date(meta.occurredAt).toISOString(), packageRef: meta.packageRef || null };
      if (existing) return api.patch(`/sources/${existing.id}`, { ...body, content });
      if (mode === 'file') {
        const fd = new FormData();
        fd.append('file', file!);
        for (const [k, v] of Object.entries(body)) if (v !== null) fd.append(k, v);
        return api.upload(`/cases/${caseId}/sources/upload`, fd);
      }
      return api.post(`/cases/${caseId}/sources`, { ...body, content, origin: fromCamera ? 'CAMERA_OCR' : 'PASTE' });
    },
    { onSuccess: onDone },
  );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (mode === 'camera') return;
    if (Object.keys(validateMeta(meta, t)).length || (mode === 'text' && !content.trim()) || (mode === 'file' && !file)) return;
    save.mutate();
  };
  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      {save.error && <Alert tone="danger">{errorMessage(save.error, t)}</Alert>}
      {!existing && (
        <div className="inline-flex rounded-lg border border-slate-300 p-0.5 text-sm" role="group">
          {(['text', 'file', 'camera'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={cx('inline-flex items-center gap-1.5 rounded-md px-3 py-1', mode === m ? 'bg-brand-600 text-white' : 'text-slate-600')}
            >
              {m === 'camera' && <Camera className="h-3.5 w-3.5" aria-hidden />}
              {m === 'text' ? t('sources.content') : m === 'file' ? t('sources.upload') : t('camera.tab')}
            </button>
          ))}
        </div>
      )}
      {mode === 'camera' && !existing ? (
        <div className="space-y-2">
          {ocr.error && <Alert tone="danger">{errorMessage(ocr.error, t)}</Alert>}
          {ocr.isPending ? (
            <Spinner label={t('camera.reading')} />
          ) : (
            <CameraCapture key={ocr.submittedAt} onCapture={(photo) => ocr.mutate(photo)} />
          )}
          <p className="flex items-center gap-1.5 text-xs text-slate-500">
            <ScanText className="h-3.5 w-3.5" aria-hidden /> {t('camera.hint')}
          </p>
        </div>
      ) : (
        <MetaFields meta={meta} setMeta={setMeta} errors={errors} />
      )}
      {fromCamera && mode === 'text' && <Alert tone="info">{t('camera.review')}</Alert>}
      {mode === 'camera' && !existing ? null : mode === 'text' || existing ? (
        <Field label={t('sources.content')} required error={contentError}>
          {(id) => <Textarea id={id} rows={8} value={content} onChange={(e) => setContent(e.target.value)} placeholder={t('sources.paste')} aria-invalid={!!contentError} />}
        </Field>
      ) : (
        <Field label={t('sources.file')} required error={fileError} hint={t('sources.noText')}>
          {(id) => <Input id={id} type="file" accept=".txt,.pdf,text/plain,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />}
        </Field>
      )}
      <div className={cx('flex justify-end', mode === 'camera' && !existing && 'hidden')}>
        <Button type="submit" loading={save.isPending} icon={mode === 'file' && !existing ? <Upload className="h-4 w-4" /> : undefined}>
          {existing ? t('common.save') : t('common.add')}
        </Button>
      </div>
    </form>
  );
}

export function SourcesTab() {
  const { bundle, openSource } = useCase();
  const { t, te, locale } = useI18n();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Source | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const archive = useCaseAction((id: string) => api.del(`/sources/${id}`), { success: t('sources.archived') });

  return (
    <Card
      title={t('case.tabs.sources')}
      actions={
        <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>
          {t('sources.add')}
        </Button>
      }
    >
      {bundle.sources.length === 0 ? (
        <EmptyState>{t('sources.empty')}</EmptyState>
      ) : (
        <ol className="relative space-y-4 border-l border-slate-200 pl-5">
          {bundle.sources.map((s) => {
            const long = s.content.length > 280;
            const open = expanded[s.id];
            return (
              <li key={s.id} className="relative">
                <span className={cx('absolute -left-[29px] top-1 flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-white', s.authorSide === 'CUSTOMER' ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-600')}>
                  {icon(s.type)}
                </span>
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <button type="button" onClick={() => openSource({ sourceId: s.id })} className="text-left text-sm font-semibold text-slate-900 hover:text-brand-700">
                        {s.title}
                      </button>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                        <Badge tone="brand">{te('sources.types', s.type)}</Badge>
                        <Badge tone={s.authorSide === 'CUSTOMER' ? 'blue' : 'slate'}>{te('sources.side', s.authorSide)}</Badge>
                        <span>{s.author}</span>
                        <span>· {fmtDateTime(s.occurredAt, locale)}</span>
                        {s.packageRef && <Badge tone="violet">{s.packageRef}</Badge>}
                        {s.version > 1 && (
                          <span>
                            · {t('sources.version')} {s.version}
                          </span>
                        )}
                        {s.origin === 'DEMO_IMPORT' && <Badge tone="slate">{t('sources.imported')}</Badge>}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditing(s)} aria-label={t('common.edit')} />
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Archive className="h-3.5 w-3.5" />}
                        aria-label={t('sources.archive')}
                        onClick={() => window.confirm(t('sources.archiveConfirm')) && archive.mutate(s.id)}
                      />
                    </div>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{long && !open ? `${s.content.slice(0, 280)}…` : s.content}</p>
                  {long && (
                    <button type="button" className="mt-1 text-xs text-brand-700 hover:underline" onClick={() => setExpanded({ ...expanded, [s.id]: !open })}>
                      {open ? t('common.showLess') : t('common.showMore')}
                    </button>
                  )}
                  {s.origin === 'DEMO_IMPORT' && <p className="mt-2 text-xs text-amber-700">{t('sources.importedNote', { channel: te('sources.types', s.type) })}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <Modal open={adding} onClose={() => setAdding(false)} title={t('sources.add')} wide>
        <SourceForm onDone={() => setAdding(false)} />
      </Modal>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={t('common.edit')} wide>
        {editing && <SourceForm existing={editing} onDone={() => setEditing(null)} />}
      </Modal>
    </Card>
  );
}
