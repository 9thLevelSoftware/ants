// Credits (GDD 08 3.3): a scrollable list generated from public/assets/CREDITS.md, followed by the fonts and
// libraries. The markdown is bundled as a string (`?raw`), so it needs no request at run time.
import creditsMd from '../../../../public/assets/CREDITS.md?raw';
import { BookPage, ScrollArea } from '../../components';
import { parseCredits, SOFTWARE_CREDITS } from './parse';

const credits = parseCredits(creditsMd);

export function Credits({ onClose }: { onClose: () => void }) {
  return (
    <BookPage title="Credits" onClose={onClose} class="ui-credits">
      <ScrollArea label="Credits" class="ui-page-scroll ui-credits-scroll">
        <section class="ui-section">
          <h2 class="ui-section-title">Sound and texture assets</h2>
          {credits.intro.map((p, i) => <p key={i} class="ui-credits-p">{p}</p>)}
        </section>
        {credits.sections.map((s) => (
          <section key={s.title} class="ui-section" aria-label={s.title}>
            <h3 class="ui-credits-h">{s.title}</h3>
            {s.notes.map((n, i) => <p key={i} class="ui-credits-p ui-small">{n}</p>)}
            {s.rows.length > 0 && (
              <ul class="ui-credits-list">
                {s.rows.map((r, i) => (
                  <li key={i} class="ui-credits-row">
                    <span class="ui-credits-work">{r.work}</span>
                    <span class="ui-credits-author">{r.author}</span>
                    <span class="ui-credits-meta">{r.usedFor} · {r.source}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
        <section class="ui-section" aria-label="Fonts and libraries">
          <h3 class="ui-credits-h">Fonts and libraries</h3>
          <ul class="ui-credits-list">
            {SOFTWARE_CREDITS.map((s) => (
              <li key={s.name} class="ui-credits-row">
                <span class="ui-credits-work">{s.name}</span>
                <span class="ui-credits-author">{s.licence}</span>
                <span class="ui-credits-meta">{s.role}</span>
              </li>
            ))}
          </ul>
        </section>
      </ScrollArea>
    </BookPage>
  );
}
