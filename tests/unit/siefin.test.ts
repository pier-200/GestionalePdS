import { beforeEach, describe, expect, it } from 'vitest';
import { finanziatoCapitolo } from '../../src/domain/calcoli';
import type { Comando } from '../../src/domain/comandi';
import { ErroreApp } from '../../src/domain/errori';
import { leggiExportSiefin } from '../../src/domain/siefin';
import type { DatiCondivisi, RigaSiefin } from '../../src/domain/tipi';
import { PERMESSI_TUTTI, datiVuoti } from '../../src/domain/tipi';
import { applicaComando } from '../../src/motore/motore';

/** Export SIEFIN ridotto: stessa struttura del file reale (tabella HTML con estensione .xls). */
function exportSiefin(righe: string[][]): string {
  const intestazione = ['IDV', 'VOCE SPESA', 'NOTE CSS', 'CPT', 'ART', 'PTF', 'PC3', 'ASSEGNATO', 'CODATTIVITA', 'DESCATTIVITA', 'DECRETO'];
  const riga = (celle: string[], tag: string) => `<tr>${celle.map((c) => `<${tag}>${c}</${tag}>`).join('')}</tr>`;
  return `<form><div><table border="1">\r\n${riga(intestazione, 'th scope="col"').replace(/<\/th scope="col">/g, '</th>')}${righe.map((r) => riga(r, 'td')).join('\r\n')}</table></div></form>`;
}

const FILE = exportSiefin([
  ['9000001', 'Esigenze varie', '&nbsp;', '1189', '7', '61', 'Manutenzione mezzi', '45000,00', 'ATT_A', 'Forniture &amp; servizi', 'Fuori Area 2026 - Anticipazione'],
  ['9000002', 'Servizi di manutenzione', '&nbsp;', '1189', '7', '61', 'Manutenzione mezzi', '50000,00', 'ATT_B', 'Supporto al suolo', 'Fuori Area 2026 - Anticipazione'],
  ['9000003', 'Apparati dell&#39;ufficio', '&nbsp;', '1189', '7', '61', 'Manutenzione mezzi', '10000,00', 'ATT_B', 'Supporto al suolo', 'Fuori Area 2025 - Completamento'],
  ['9000004', 'Corso di formazione', '&nbsp;', '4242', '1', '53', 'Indennità di missione', '6,90', 'ATT_C', 'Addestramento', 'Bilancio Ordinario 2026'],
]);

describe('lettura dell’export SIEFIN', () => {
  it('estrae IDV, capitolo (CPT/ART/PTF), decreto e importo assegnato', () => {
    const righe = leggiExportSiefin(FILE);
    expect(righe).toHaveLength(4);
    expect(righe[0]).toEqual<RigaSiefin>({
      idv: '9000001',
      voce: 'Esigenze varie',
      codice: '1189/7/61',
      decreto: 'Fuori Area 2026 - Anticipazione',
      pc3: 'Manutenzione mezzi',
      cod_attivita: 'ATT_A',
      desc_attivita: 'Forniture & servizi',
      assegnato: 45_000_00,
    });
    expect(righe[2].voce).toBe("Apparati dell'ufficio");
    expect(righe[3].assegnato).toBe(690);
  });

  it('rifiuta i file che non sono un export SIEFIN', () => {
    expect(() => leggiExportSiefin('testo qualunque')).toThrow(/nessuna tabella/);
    expect(() => leggiExportSiefin('<table><tr><th>IDV</th><th>CPT</th></tr></table>')).toThrow(/mancano le colonne/);
  });
});

describe('allineamento SIEFIN', () => {
  let dati: DatiCondivisi;
  let contatore = 0;
  const esegui = (comando: Comando) => {
    const esito = applicaComando(dati, comando, { utenteId: 'admin', ora: '2026-06-01T10:00:00.000Z', nuovoId: () => `id-${++contatore}`, percorsoFile: () => '' });
    dati = esito.dati;
    return esito;
  };
  const capitolo = (decreto: string) => dati.capitoli.find((c) => c.codice === '1189/7/61' && c.decreto === decreto)!;

  beforeEach(() => {
    contatore = 0;
    dati = {
      ...datiVuoti(),
      utenti: [{ id: 'admin', username: 'admin', nome: 'admin', ruolo: 'admin', attivo: true, permessi: { ...PERMESSI_TUTTI }, created_at: '', updated_at: '' }],
    };
  });

  it('tratta come capitoli distinti lo stesso codice con decreti diversi', () => {
    const esito = esegui({ tipo: 'capitoli.allinea', esercizio: 2026, righe: leggiExportSiefin(FILE) });
    expect(esito.risultato.conteggio).toBe(3);
    expect(dati.capitoli).toHaveLength(3);
    expect(finanziatoCapitolo(capitolo('Fuori Area 2026 - Anticipazione'))).toBe(95_000_00);
    expect(finanziatoCapitolo(capitolo('Fuori Area 2025 - Completamento'))).toBe(10_000_00);
  });

  it('riallinea senza sommare e conserva i fondi aggiunti manualmente', () => {
    const righe = leggiExportSiefin(FILE);
    esegui({ tipo: 'capitoli.allinea', esercizio: 2026, righe });
    const anticipazione = capitolo('Fuori Area 2026 - Anticipazione');
    esegui({ tipo: 'capitolo.modifica', id: anticipazione.id, modifiche: { finanziato: 5_000_00 }, originale: { finanziato: 0 } });

    // stesso file: nessuna variazione
    expect(esegui({ tipo: 'capitoli.allinea', esercizio: 2026, righe }).risultato.conteggio).toBe(0);
    expect(finanziatoCapitolo(capitolo('Fuori Area 2026 - Anticipazione'))).toBe(100_000_00);

    // nuovo export: un importo cambia, un IDV sparisce e uno passa all'altro decreto
    const nuove = righe
      .filter((r) => r.idv !== '9000004')
      .map((r) => (r.idv === '9000001' ? { ...r, assegnato: 40_000_00 } : r.idv === '9000002' ? { ...r, decreto: 'Fuori Area 2025 - Completamento' } : r));
    esegui({ tipo: 'capitoli.allinea', esercizio: 2026, righe: nuove });
    expect(dati.capitoli).toHaveLength(3);
    expect(capitolo('Fuori Area 2026 - Anticipazione').idv!.map((f) => f.idv)).toEqual(['9000001']);
    expect(finanziatoCapitolo(capitolo('Fuori Area 2026 - Anticipazione'))).toBe(45_000_00);
    expect(finanziatoCapitolo(capitolo('Fuori Area 2025 - Completamento'))).toBe(60_000_00);
    // il capitolo assente dal nuovo file resta com'era
    expect(finanziatoCapitolo(dati.capitoli.find((c) => c.codice === '4242/1/53')!)).toBe(690);
  });

  it('accetta sui PdS solo IDV esistenti sul capitolo, oppure nessun IDV', () => {
    esegui({ tipo: 'capitoli.allinea', esercizio: 2026, righe: leggiExportSiefin(FILE) });
    const id = capitolo('Fuori Area 2026 - Anticipazione').id;
    const crea = (numero: string, idv: string | null) => esegui({ tipo: 'pds.crea', dati: { numero, capitolo_id: id, idv } }).risultato.id!;
    const errore = (fn: () => unknown) => {
      try {
        fn();
      } catch (e) {
        if (e instanceof ErroreApp) return e.message;
      }
      return null;
    };
    crea('1', '9000001, 9000002');
    const senzaIdv = crea('2', null);
    expect(errore(() => crea('3', '9999999'))).toMatch(/IDV 9999999 non presente/);
    // l'IDV esiste, ma sul capitolo dell'altro decreto
    expect(errore(() => crea('4', '9000003'))).toMatch(/non presente sul capitolo 1189\/7\/61 Fuori Area 2026 - Anticipazione/);
    expect(errore(() => esegui({ tipo: 'pds.modifica', id: senzaIdv, modifiche: { idv: '123' }, originale: { idv: null } }))).toMatch(/non presente/);
    esegui({ tipo: 'pds.modifica', id: senzaIdv, modifiche: { idv: '9000001' }, originale: { idv: null } });
    expect(dati.pds.find((p) => p.id === senzaIdv)!.idv).toBe('9000001');
  });
});
