import { Box, Group, Stack, Text, Tooltip, useComputedColorScheme } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconAlertTriangle } from '@tabler/icons-react';
import { formattaEuro, formattaEuroCompatto, formattaPercentuale, rapporto } from '../../domain/importi';
import { sforamentoDaSegnalare, type RigaSintesi } from '../../domain/sintesi';
import { COLORI_GRAFICO } from '../tema';

type Serie = 'finanziato' | 'inviato' | 'stipulato' | 'pagato';

const SERIE: { chiave: Serie; etichetta: string; descrizione: string }[] = [
  { chiave: 'finanziato', etichetta: 'Finanziato', descrizione: 'Totale finanziato sul capitolo' },
  { chiave: 'inviato', etichetta: 'Impegnato (Trasmesso)', descrizione: 'Somma degli importi dei PdS trasmessi' },
  { chiave: 'stipulato', etichetta: 'Impegnato (Stipulato)', descrizione: 'Somma dei valori di stipula dei PdS stipulati' },
  { chiave: 'pagato', etichetta: 'Effettivo pagato', descrizione: 'Somma dei pagamenti registrati' },
];

const SPESSORE = 10;
const INTERVALLO = 2;

/** Massimo "tondo" per l'asse (1, 2, 2,5, 5 × 10^n). */
function massimoAsse(valore: number): number {
  if (valore <= 0) return 100_00;
  const potenza = 10 ** Math.floor(Math.log10(valore));
  for (const passo of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (passo * potenza >= valore) return passo * potenza;
  }
  return 10 * potenza;
}

export function GraficoCapitoli({ righe }: { righe: RigaSintesi[] }) {
  const schema = useComputedColorScheme('light');
  const colori = COLORI_GRAFICO[schema === 'dark' ? 'scuro' : 'chiaro'];
  const stretto = useMediaQuery('(max-width: 48em)');
  const massimo = massimoAsse(Math.max(0, ...righe.flatMap((r) => [r.finanziato, r.inviato, r.stipulato, r.pagato])));
  const tacche = (stretto ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1]).map((f) => f * massimo);
  const posizione = (v: number) => `${Math.min(100, (v / massimo) * 100)}%`;

  const legenda = (
    <Group gap="md" wrap="wrap" component="ul" style={{ listStyle: 'none', padding: 0, margin: 0 }} aria-label="Legenda">
      {SERIE.map((s) => (
        <Group key={s.chiave} gap={6} component="li" wrap="nowrap">
          <span aria-hidden style={{ width: 14, height: 10, borderRadius: 2, background: colori[s.chiave], display: 'inline-block' }} />
          <Text fz="xs" c="var(--pds-inchiostro-2)">
            {s.etichetta}
          </Text>
        </Group>
      ))}
      <Group gap={6} component="li" wrap="nowrap">
        <span aria-hidden style={{ width: 1, height: 14, background: 'var(--pds-inchiostro-2)', display: 'inline-block' }} />
        <Text fz="xs" c="var(--pds-inchiostro-2)">
          Livello del finanziato
        </Text>
      </Group>
    </Group>
  );

  const asse = (
    <div style={{ position: 'relative', height: 18 }} aria-hidden>
      {tacche.map((t, i) => (
        <Text
          key={t}
          fz={11}
          c="var(--pds-muto)"
          className="num"
          style={{ position: 'absolute', left: posizione(t), transform: i === 0 ? 'none' : i === tacche.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)', top: 2 }}
        >
          {t === 0 ? '0 €' : formattaEuroCompatto(t)}
        </Text>
      ))}
    </div>
  );

  return (
    <Stack gap="sm">
      {legenda}
      <div style={{ display: 'grid', gridTemplateColumns: stretto ? '1fr' : 'minmax(150px, 230px) 1fr', columnGap: 16 }}>
        {!stretto && <div />}
        {asse}
        {righe.map((r, indiceRiga) => {
          const sforamento = sforamentoDaSegnalare(r);
          const etichettaCapitolo = r.capitolo.codice;
          return (
            <div key={r.capitolo.id} style={{ display: 'contents' }}>
              <Box py={8} pr={4} style={{ borderTop: '1px solid var(--pds-griglia)' }}>
                <Group gap={6} wrap="nowrap" align="flex-start">
                  <Text fz="sm" fw={600} lh={1.3}>
                    {etichettaCapitolo}
                  </Text>
                  {sforamento && (
                    <Group gap={3} wrap="nowrap">
                      <IconAlertTriangle size={15} color="var(--pds-critico)" aria-hidden />
                      <Text fz={11} fw={600} c="red.7">
                        Superamento
                      </Text>
                    </Group>
                  )}
                </Group>
              </Box>
              <div
                style={{
                  position: 'relative',
                  paddingBlock: stretto ? '0 12px' : 10,
                  borderTop: stretto ? undefined : '1px solid var(--pds-griglia)',
                  borderLeft: '1px solid var(--pds-base-asse)',
                  backgroundImage: `repeating-linear-gradient(to right, transparent 0, transparent calc(25% - 1px), var(--pds-griglia) calc(25% - 1px), var(--pds-griglia) 25%)`,
                  backgroundSize: '100% 100%',
                }}
              >
                {SERIE.map((s) => {
                  const valore = r[s.chiave];
                  const perc = s.chiave === 'finanziato' ? null : rapporto(valore, r.finanziato);
                  const oltre = s.chiave !== 'finanziato' && s.chiave !== 'pagato' && valore > r.finanziato;
                  const testoTooltip = `${etichettaCapitolo} · ${s.etichetta}: ${formattaEuro(valore)}${perc != null ? ` (${formattaPercentuale(perc)} del finanziato)` : ''}${oltre ? ' – supera il finanziato' : ''}`;
                  return (
                    <Tooltip key={s.chiave} label={testoTooltip} position="top-start" offset={2} openDelay={60}>
                      <div
                        tabIndex={0}
                        role="img"
                        aria-label={testoTooltip}
                        style={{ height: SPESSORE + INTERVALLO * 2, display: 'flex', alignItems: 'center', position: 'relative', outlineOffset: 1 }}
                      >
                        <div
                          style={{
                            width: posizione(valore),
                            minWidth: valore > 0 ? 3 : 0,
                            height: SPESSORE,
                            background: colori[s.chiave],
                            borderRadius: '0 4px 4px 0',
                          }}
                        />
                        {indiceRiga === 0 && !stretto && (
                          <Text
                            fz={10.5}
                            c="var(--pds-inchiostro-2)"
                            ml={4}
                            px={3}
                            style={{ whiteSpace: 'nowrap', lineHeight: '13px', background: 'var(--mantine-color-body)', position: 'relative', zIndex: 1, borderRadius: 3 }}
                            aria-hidden
                          >
                            {s.etichetta}
                          </Text>
                        )}
                      </div>
                    </Tooltip>
                  );
                })}
                <div
                  aria-hidden
                  style={{
                    position: 'absolute',
                    top: stretto ? 0 : 6,
                    bottom: stretto ? 8 : 6,
                    left: posizione(r.finanziato),
                    width: 1,
                    background: 'var(--pds-inchiostro-2)',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <Text fz="xs" c="dimmed">
        Passare sulle barre (o selezionarle con il tasto Tab) per i valori; tutti gli importi sono riportati nella tabella sottostante.
      </Text>
    </Stack>
  );
}
