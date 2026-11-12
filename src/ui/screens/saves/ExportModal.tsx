// Text-export modal (GDD 08 7.6): shown when the file download is refused, blocked or switched off. A read-only
// TextArea with the FOUNDRESS1: text, a Copy button (clipboard API; when refused it selects everything and says
// "Press Ctrl+C to copy"), and the size in KB.
import { useRef, useState } from 'preact/hooks';
import { Button, Modal, TextArea } from '../../components';

export interface ExportModalProps {
  text: string;
  sizeKb: number;
  onClose: () => void;
}

export function ExportModal({ text, sizeKb, onClose }: ExportModalProps) {
  const [note, setNote] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const select = () => {
    const ta = box.current?.querySelector('textarea');
    if (ta) { ta.focus(); ta.select(); }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setNote('Copied to the clipboard.');
    } catch {
      select();
      setNote('Press Ctrl+C to copy.');
    }
  };
  return (
    <Modal
      title="Export as text" onClose={onClose} wide
      actions={(
        <>
          <Button icon="copy" onClick={copy} data-testid="export-copy">Copy</Button>
          <Button variant="primary" onClick={onClose}>Done</Button>
        </>
      )}
    >
      <p>Your browser did not save a file. Keep this text somewhere safe; pasting it into Import brings the colony back.</p>
      <div ref={box}><TextArea value={text} readOnly mono rows={8} aria-label="Exported colony text" data-testid="export-text" /></div>
      <p class="ui-field-help" aria-live="polite">{sizeKb} KB{note ? ` · ${note}` : ''}</p>
    </Modal>
  );
}
