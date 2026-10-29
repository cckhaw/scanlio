import { describeExport } from '../lib/export';
import { haptic } from '../lib/haptics';
import type { ExportFormat, ExportOptions as Opts, PdfMode } from '../types';

const Seg = <T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) => (
  <div className="grid gap-1 rounded-btn bg-label/[.07] p-1" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }} role="radiogroup" aria-label={label}>
    {options.map(([id, text]) => (
      <button key={id} role="radio" aria-checked={value === id} onClick={() => { haptic('light'); onChange(id); }}
        className={`min-h-tap rounded-xl text-[14px] font-semibold transition-all duration-500 ease-hig ${value === id ? 'bg-elevated text-label shadow-glass' : 'text-secondary'}`}>
        {text}
      </button>
    ))}
  </div>
);

/** File format + (for multi-page PDF) one-file-or-many choice. */
export function ExportOptions({ value, onChange, pageCount }: { value: Opts; onChange: (o: Opts) => void; pageCount: number }) {
  const multi = pageCount > 1;
  return (
    <div className="space-y-2.5">
      <Seg<ExportFormat> label="File format" value={value.format} onChange={(format) => onChange({ ...value, format })}
        options={[['pdf', 'PDF'], ['png', 'PNG'], ['jpg', 'JPG']]} />
      {multi && value.format === 'pdf' && (
        <Seg<PdfMode> label="PDF layout" value={value.pdfMode} onChange={(pdfMode) => onChange({ ...value, pdfMode })}
          options={[['combined', 'One PDF'], ['separate', 'Separate PDFs']]} />
      )}
      <p className="px-1 text-[12px] text-secondary">
        {describeExport(value, pageCount)}
        {multi && value.format !== 'pdf' && ' — one image file per page'}
      </p>
    </div>
  );
}
